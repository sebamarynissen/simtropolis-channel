// # handle-upload.js
import nodeFs from 'node:fs';
import path from 'node:path';
import { Document, parseAllDocuments } from 'yaml';
import stylize from './stylize-doc.js';
import apiToMetadata from './api-to-metadata.js';
import Downloader from './downloader.js';
import generateVariants from './generate-variants.js';
import patchMetadata from './patch-metadata.js';
import checkPreviousVersion from './check-previous-version.js';
import { kFileNames } from './symbols.js';

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

	// Start by extracting all metadata we can from the api. This should be 
	// sufficient to look for a `metadata.yaml` file in the downloads. We'll do 
	// that first before completing the metadata with scraping, because we might 
	// be able to shortcut already here.
	let { permissions } = opts;
	let metadata = apiToMetadata(permissions.transform(json));
	let parsedMetadata = [];
	let downloader = new Downloader();
	let cleanup = [];
	for (let asset of metadata.assets) {

		// If the assets contains metadata, we'll use this one, only if former 
		// assets did not contain metadata either. Note: if something is wrong 
		// when unzipping, then we'll just swallow it. It's always possible that 
		// someone uploads an invalid zip file, nothing we can do about that, 
		// but we don't want this to block our workflow.
		let info = await downloader.handleAsset(asset);
		if (!info) continue;
		if (info.metadata) {
			parsedMetadata.push(...[info.metadata].flat());
		}
		if (info.checksums?.length > 0) {
			asset.withChecksum = info.checksums;
		}
		cleanup.push(info.cleanup);

	}

	// If the metadata was specified as part of the STEX api response, then this 
	// overrides any metadata.yaml file from the assets.
	let errors = [];
	if (json.metadata) {
		try {
			let docs = parseAllDocuments(json.metadata).map(doc => doc.toJSON());
			parsedMetadata = [docs];
		} catch (e) {
			errors.push(`Unable to parse metadata for ${json.fileURL}: ${e.message}`);
			parsedMetadata = [{}];
		}
	}

	// Compile a custom cleanup function that we use for early returns.
	const clean = async () => {
		for (let fn of cleanup) await fn();
	};

	// If we have not found any metadata at this moment, then we skip this 
	// package. It means the user has not made their package compatible with 
	// sc4pac.
	const { requireMetadata = true } = opts;
	if (parsedMetadata.length === 0 && requireMetadata) {
		await clean();
		return {
			skipped: true,
			type: 'notice',
			reason: `Package ${json.fileURL} does not have a metadata.yaml file in its root. Skipping.`,
		};
	} else if (parsedMetadata.length > 1) {

		// If we found more than 1 metadata file, we'll continue, but we have to 
		// report an error though. This will ensure that the PR won't get merged.
		errors.push(`This package has ${parsedMetadata.length} metadata.yaml files, only 1 is allowed.`);

	}
	let [userMetadata] = parsedMetadata;

	// Now that we have the completed metadata, we will generate the variants.
	// Note that at this point we haven't used any information from the *custom* 
	// metadata yet! Everything we're doing is based on the *default* metadata.
	await generateVariants(metadata);

	// See #42. If metadata for the package already existed before - either 
	// added by the bot, or manually by backfilling - then we have to patch the 
	// *default* metadata so that the name can't change unintentionally.
	let original = { ...metadata.package };
	let author = original.group;
	let { cwd, path: srcPath = 'src/yaml', fs = nodeFs } = opts;
	await checkPreviousVersion(json.id, metadata, {
		cwd,
		srcPath,
		fs,
	});

	// Now check whether it was specified - either in the parsed metadata or as 
	// explicit option - whether the package must be split in resources and lots/
	// flora.
	let { split = false } = opts;
	if (split) {

		// If the package has to be split, but multiple *package* metadata was 
		// given, then we can't continue. If the package is going to be split 
		// automatically, you can only override metadata for the *main* package!
		let packages = userMetadata.filter(pkg => pkg.group);
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

	}

	// We are now ready to clean up any downloaded & extracted assets.
	await clean();

	// Patch the metadata with the metadata that was parsed from the assets. 
	// Then we'll verify that the generated package is ok according to our 
	// permissions.
	let {
		packages,
		assets,
		main,
		basename,
	} = patchMetadata(metadata, userMetadata, original);
	let zipped = [...packages, ...assets];
	try {
		permissions.assertPackageAllowed(json, packages);
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
	for (let asset of assets) {
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
	let yaml = serialize(zipped);
	let relativePath = `${srcPath}/${author}/${json.id}-${basename}.yaml`;
	let output = path.resolve(cwd, relativePath);
	await fs.promises.mkdir(path.dirname(output), { recursive: true });
	await fs.promises.writeFile(output, yaml);
	return {
		id,
		metadata: zipped,
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
