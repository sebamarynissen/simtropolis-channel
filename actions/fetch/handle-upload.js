// # handle-upload.js
import nodeFs from 'node:fs';
import path from 'node:path';
import { Document } from 'yaml';
import stylize from './stylize-doc.js';
import apiToMetadata from './api-to-metadata.js';
import Downloader from './downloader.js';
import completeMetadata from './complete-metadata.js';
import patchMetadata from './patch-metadata.js';
import checkPreviousVersion from './check-previous-version.js';

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

	// Start by extracting all metadata we can from the api. This should be 
	// sufficient to look for a `metadata.yaml` file in the downloads. We'll do 
	// that first before completing the metadata with scraping, because we might 
	// be able to shortcut already here.
	let { permissions } = opts;
	let metadata = apiToMetadata(permissions.transform(json));
	let parsedMetadata = false;
	let downloader = new Downloader();
	for (let asset of metadata.assets) {

		// If the assets contains metadata, we'll use this one, only if former 
		// assets did not contain metadata either. Note: if something is wrong 
		// when unzipping, then we'll just swallow it. It's always possible that 
		// someone uploads an invalid zip file, nothing we can do about that, 
		// but we don't want this to block our workflow.
		let info = await downloader.handleAsset(asset);
		if (info.metadata && !parsedMetadata) {
			parsedMetadata = info.metadata;
		}

		// If the asset contains dll files, then checksums should have been 
		// generated. We'll add those to the metadata.
		if (info.checksums.length > 0) {
			asset.withChecksum = info.checksums;
		}

	}

	// If we have not found any metadata at this moment, then we skip this 
	// package. It means the user has not made their package compatible with 
	// sc4pac.
	const { requireMetadata = true } = opts;
	if (!parsedMetadata && requireMetadata) {
		return {
			skipped: true,
			type: 'notice',
			reason: `Package ${json.fileURL} does not have a metadata.yaml file in its root. Skipping.`,
		};
	}

	// If we reach this point, we're sure to include the package. We now need to 
	// complete the metadata from the api by resorting to HTML scraping as the 
	// description, images and subfolder cannot be derived directly from the api 
	// response.
	await completeMetadata(metadata, json);

	// See #42. If metadata for the package already existed before - either 
	// added by the bot, or manually by backfilling - then we have to patch the 
	// *default* metadata so that the name can't change unintentionally.
	let original = { ...metadata.package };
	let author = original.group;
	let { cwd, path: srcPath = 'src/yaml', fs = nodeFs } = opts;
	let deletions = await checkPreviousVersion(json.id, metadata, {
		cwd,
		srcPath,
		fs,
	});

	// Patch the metadata with the metadata that was parsed from the assets. 
	// Then we'll verify that the generated package is ok according to our 
	// permissions.
	let {
		packages,
		main,
		basename,
	} = patchMetadata(metadata, parsedMetadata, original);
	let zipped = [...packages, ...metadata.assets];
	try {
		permissions.assertPackageAllowed(json, packages);
	} catch (e) {
		return {
			skipped: true,
			type: 'warning',
			reason: `${e.message}\n\n${serialize(zipped)}`,
		};
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
		branchId: String(json.id),
		deletions,
		additions: [relativePath],
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
