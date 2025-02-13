// # handle-upload.js
import nodeFs from 'node:fs';
import path from 'node:path';
import { styleText } from 'node:util';
import { Document, parseAllDocuments } from 'yaml';
import stylize from './stylize-doc.js';
import apiToMetadata from './api-to-metadata.js';
import Downloader from './downloader.js';
import generateVariants from './generate-variants.js';
import patchMetadata from './patch-metadata.js';
import checkPreviousVersion from './check-previous-version.js';
import { kFileNames } from './symbols.js';
import splitPackage from './split-package.js';
import parseDependencies from './parse-dependencies.js';

// # filterAssets
// Helper function that filters all assets from an array of metadata that can 
// contain both packages and assets.
function filterAssets(metadata) {
	return metadata.filter(asset => asset.assetId || asset.url);
}

// # filterPackages
// Same, but filters out the packages.
function filterPackages(metadata) {
	return metadata.filter(pkg => pkg.name);
}

// # handleUpload(json)
// Handles a single STEX upload. It accepts a json response from the STEX api 
// and will generate the package's metadata, taking into account that custom 
// metadata might have been included in the .zip folder.
export default async function handleUpload(json, opts = {}) {

	// We might already be able to shortcut based on the api response alone. 
	// This happens for example when the category is "Maps" (116).
	let excludedCategories = new Set([115, 116, 117]);
	if (excludedCategories.has(json.cid)) {
		return {
			skipped: true,
			type: 'notice',
			reason: `Package ${json.fileURL} skipped as category is "${json.category}"`,
		};
	}

	// If the files have been removed - meaning the file name is "null" - then 
	// we don't include this. This happens for example with packages marked as 
	// obsolete on the STEX.
	if (
		!json.files ||
		json.files.length === 0 ||
		json.files.some(file => file.name === null)
	) {
		return {
			skipped: true,
			type: 'notice',
			reason: `Package ${json.fileURL} skipped as it has no files`,
		};
	}

	// Start by transforming the STEX api response to so called auto-metadata. 
	// This is the base for any transformations we'll perform on it later on.
	// Then we'll use the downloader to download all assets - for which the 
	// information will be added to the asset metadata with symbols.
	let { permissions, cache, darkniteOnly } = opts;
	let autoMetadata = apiToMetadata(permissions.transform(json), {
		darkniteOnly,
	});
	let metadataSources = [];
	let downloader = new Downloader({ cache });
	let cleanup = [];
	for (let asset of filterAssets(autoMetadata)) {

		// Download the asset and extract the metadata & checksum information 
		// from it.
		let info = await downloader.handleAsset(asset);
		if (!info) continue;
		if (info.metadata) {
			let allMetadata = [info.metadata].flat();
			for (let metadata of allMetadata) {
				metadataSources.push({
					source: 'file',
					metadata,
				});
			}
		}
		if (info.checksums?.length > 0) {
			asset.withChecksum = info.checksums;
		}
		cleanup.push(info.cleanup);

	}

	// Compile a custom cleanup function that we use for early returns.
	const clean = async () => {
		for (let fn of cleanup) await fn();
	};

	// If the metadata was specified as part of the STEX api response, then this 
	// overrides any metadata.yaml file from the assets.
	let errors = [];
	let apiMetadata = json.metadata?.trim();
	if (apiMetadata) {
		try {
			let metadata = parseAllDocuments(apiMetadata)
				.map(doc => doc.toJSON());
			metadataSources.push({
				source: 'field',
				metadata,
			});
		} catch (e) {
			errors.push(`Unable to parse metadata for ${json.fileURL}: ${e.message}`);
			metadataSources.push({
				source: 'field',
				metadata: [],
			});
		}
	}

	// If we have not found any metadata at this moment, then we skip this 
	// package, but we require metadata in order for the package to be added,
	// then return early.
	const { requireMetadata = true } = opts;
	if (metadataSources.length === 0) {
		if (requireMetadata) {
			await clean();
			return {
				skipped: true,
				type: 'notice',
				reason: `Package ${json.fileURL} does not have a metadata field or metadata.yaml file in any of its assets. Skipping.`,
			};
		} else {
			metadataSources.push({ metadata: [] });
		}
	}

	// If there are multiple metadata sources, then we don't know what to pick. 
	// However, we'll still continue so that a PR is created, but with an error.
	if (metadataSources.length > 1) {
		const types = new Set(metadataSources.map(row => row.source));
		if (types.size > 1) {
			errors.push(`This package both has a metadata field and a metadata.yaml file. Only one of the two can be present.`);
		} else {
			errors.push(`This package has ${metadataSources.length} metadata.yaml files, but only 1 is allowed.`);
		}
	}

	// Cool, now continue expanding the automatically generated metadata by 
	// automatically generating the variants. We can only do this by actually 
	// inspecting assets though.
	await generateVariants(autoMetadata);

	// Check what we need to do with the dependencies. If "auto" was specified, 
	// it means that dependencies need to be automatically parsed from the links 
	// in the description. This is only useful when *manually* adding packages 
	// though, it shouldn't be used on packages that rely on metadata.yaml!
	if (opts.dependencies === 'auto') {
		let [pkg] = autoMetadata;
		let deps = parseDependencies(opts.dependencyIndex, pkg);
		let unmatched = deps.filter(dep => dep.startsWith('"['));
		if (unmatched.length > 0) {
			console.log(styleText('red', `${pkg.info.website} has unmatched dependencies that need to be fixed manually!`));
			for (let dep of unmatched) {
				console.log(`  ${styleText('cyan', dep)}`);
			}
		}
		if (deps.length > 0) {
			pkg.dependencies = deps;
		}
	}

	// See #42. If metadata for the package already existed before - either 
	// added by the bot, or manually by backfilling - then we have to patch the 
	// *default* metadata so that the name can't change unintentionally.
	let original = { ...autoMetadata[0] };
	let author = original.group;
	let { cwd, path: srcPath = 'src/yaml', fs = nodeFs } = opts;
	await checkPreviousVersion(json.id, autoMetadata, {
		cwd,
		srcPath,
		fs,
	});

	// Now check whether it was specified - either in the parsed metadata or as 
	// explicit option - whether the package must be split in resources and lots/
	// flora.
	let [userMetadata] = metadataSources.map(row => row.metadata);
	let { splitOffResources = false } = opts;
	if (splitOffResources) {

		// If the package has to be split, but multiple *package* metadata was 
		// given, then we can't continue. If the package is going to be split 
		// automatically, you can only override metadata for the *main* package!
		let packages = filterPackages(userMetadata);
		if (packages.length > 1) {
			let [main] = packages;
			errors.push('You can only specify custom metadata for the main package if the package has to be split!');
			await clean();
			return {
				id: `${main.group}:${main.name}`,
				fileId: String(json.id),
				branchId: String(json.id),
				githubUsername,
				errors,
			};
		}
		autoMetadata = await splitPackage(autoMetadata);

	}

	// We are now ready to clean up any downloaded & extracted assets.
	await clean();

	// Patch the metadata with the metadata that was parsed from the assets. 
	// Then we'll verify that the generated package is ok according to our 
	// permissions.
	let {
		metadata,
		main,
		basename,
	} = patchMetadata(autoMetadata, userMetadata, original);
	try {
		permissions.assertPackageAllowed(json, metadata);
	} catch (e) {

		// When there's an error, we *DO NOT* skip the package. We continue, but 
		// add it as an error, which will subsequently be handled by the 
		// create-prs action.
		errors.push(e.message);

	}

	// Check if the user has a GitHub username associated with them.
	let githubUsername = permissions.getGithubUsername(json);

	// We're not done yet. If there are assets with external urls, then we have 
	// to download those assets as well and check if DLL's have to be generated.
	// However, if the asset does not have a persistent url and it contains a 
	// DLL, then we should generate an error.
	for (let asset of filterAssets(metadata)) {
		let files = asset[kFileNames];
		if (asset.nonPersistentUrl) {
			let info = await downloader.handleAsset(asset);
			if (info.checksums?.length > 0) {
				// If the external url contains a DLL, then it can only be from 
				// GitHub **and** the usernames have to match.
				let parsed = new URL(asset.url);
				if (parsed.hostname !== 'github.com') {
					errors.push(`An external asset that includes a DLL can only be a URL from GitHub`);
					continue;
				}
				let [username] = parsed.pathname.replace(/^\//, '').split('/');
				if (username.toLowerCase() !== githubUsername?.toLowerCase()) {
					errors.push(`The GitHub user that owns ${asset.url} does not correspond to the configured GitHub user for ${json.author}!`);
					continue;
				}

				// All checks passed, continue now.
				asset.withChecksum = info.checksums;

			}
		} else if (files.some(file => path.extname(file) === '.dll')) {
			errors.push(`Asset ${asset.url} includes a DLL, but does not specify an GitHub url where the DLL can be downoaded from. Due to security reasons, only DLLs that are hosted on GitHub are allowed.`);
		}
	}

	// Allright, we're pretty much done now. Write away the metadata and return 
	// the information about what we've generated.
	let { group, name } = main;
	let id = `${group}:${name}`;
	let yaml = serialize(metadata);
	let relativePath = `${srcPath}/${author}/${json.id}-${basename}.yaml`;
	let output = path.resolve(cwd, relativePath);
	await fs.promises.mkdir(path.dirname(output), { recursive: true });
	await fs.promises.writeFile(output, yaml);
	return {
		id,
		metadata,
		fileId: String(json.id),
		branchId: String(json.id),
		additions: [relativePath],
		githubUsername,
		message: {
			to: json.author,
		},
		...errors.length > 0 && { errors },
	};

}

// # serialize(json)
function serialize(json) {
	return json.map((json, index) => {
		let doc = stylize(new Document(json));
		if (index > 0) {
			doc.directives.docStart = true;
		}
		return doc;
	}).join('\n');
}
