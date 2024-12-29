// # handle-upload.js
import nodeFs from 'node:fs';
import path from 'node:path';
import { Document } from 'yaml';
import stylize from './stylize-doc.js';
import apiToMetadata from './api-to-metadata.js';
import Downloader from './downloader.js';
import patchMetadata from './patch-metadata.js';
import scrape from './scrape.js';

// # handleUpload(json)
// Handles a single STEX upload.
export default async function handleUpload(json, opts = {}) {

	// Start by extracting all metadata we can from the api, and then combine 
	// this with scraping for the description and images as they are not 
	// included in the api response yet.
	let metadata = apiToMetadata(json);
	let { description, images, subfolder } = await scrape(json.fileURL);
	let { package: pkg } = metadata;
	let { info } = pkg;
	if (!info.description) {
		info.description = description;
	}
	if (!info.images) {
		info.images = images;
	}
	pkg.subfolder = subfolder;

	// Now generate the variants from what we've decided to include. This will 
	// multiply the available variants by 2 in every step.
	let includedVariants = findIncludedVariants(metadata);
	let variants = generateVariants(includedVariants, metadata);

	// If there are no variants, then we just include the assets as is.
	let assets;
	if (!variants || variants.length === 0) {
		assets = metadata.assets.map(asset => ({ assetId: asset.assetId }));
	}
	Object.assign(metadata.package, { assets, variants });

	// Cool, the metadata has been generated in standardized format. We will now 
	// download all assets and look for a metadata.yaml file to override the 
	// prefilled metadata.
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

	// Patch the metadata with the metadata that was parsed from the assets. 
	// Then we'll verify that the generated package is ok according to our 
	// permissions.
	let packages = patchMetadata(metadata, parsedMetadata);
	let zipped = [...packages, ...metadata.assets];
	let { permissions } = opts;
	try {
		permissions.assertPackageAllowed(json, packages);
	} catch (e) {
		return {
			skipped: true,
			type: 'warning',
			reason: `${e.message}\n\n${serialize(zipped)}`,
		};
	}

	// Note: if the file already exists, we'll use "Update" instead of "Add" in 
	// the commit message.
	let {
		cwd,
		path: srcPath = 'src/yaml',
		fs = nodeFs,
	} = opts;
	let { main } = packages;
	let { group, name } = main;
	let id = `${group}:${name}`;
	let yaml = serialize(zipped);
	let relativePath = `${srcPath}/${group}/${name}.yaml`;
	let output = path.resolve(cwd, relativePath);
	await fs.promises.mkdir(path.dirname(output), { recursive: true });
	await fs.promises.writeFile(output, yaml);
	return {
		id,
		metadata,
		files: [relativePath],
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

// # findIncludedVariants(metadata)
// Finds the variants that are supported by this package. Note that we have no 
// way yet of inspecting the actual package contents, we only support detecting 
// this when there are separate downloads.
function findIncludedVariants(metadata) {
	let variants = [];
	let { assets } = metadata;
	if (assets.some(asset => /-(maxisnite|darknite)$/.test(asset.assetId))) {
		variants.push('nightmode');
	}
	if (assets.some(asset => /-[rl]hd$/.test(asset.assetId))) {
		variants.push('driveside');
	}
	if (assets.some(asset => /-cam$/.test(asset.assetId))) {
		variants.push('CAM');
	}
	return variants;
}

// # generateVariants(variants, metadata)
function generateVariants(variants, metadata) {
	let output = [{}];
	for (let variant of variants) {
		let queue = output;
		output = [];
		let objects = generateVariant(variant, metadata);
		for (let variant of objects) {
			for (let q of queue) {
				output.push({
					variant: { ...q.variant, ...variant.variant },
					dependencies: mergeArray(q.dependencies, variant.dependencies),
					assets: mergeArray(q.assets, variant.assets),
				});
			}
		}
	}
	return output.length < 2 ? undefined : output;
}

// # mergeArray(a, b)
function mergeArray(a, b) {
	let merged = [...(a||[]), ...(b||[])];
	if (merged.length === 0) return;
	return structuredClone(merged);
}

// # generateVariant(type, metadata)
// Generates the essential variant information for the given type. For example, 
// for day-and-night, there are two possible variants. Subsequently we'll merge 
// this with the other variants.
function generateVariant(type, metadata) {
	let { assets } = metadata;
	if (type === 'nightmode') {
		return [
			{
				variant: { nightmode: 'standard' },
				assets: [
					{ assetId: findAsset(assets, 'maxisnite') },
				],
			},
			{
				variant: { nightmode: 'dark' },
				dependencies: ['simfox:day-and-nite-mod'],
				assets: [
					{ assetId: findAsset(assets, 'darknite') },
				],
			},
		];
	} else if (type === 'CAM') {
		return [
			{
				variant: { CAM: 'no' },
			},
			{
				variant: { CAM: 'yes' },
				assets: [
					{ assetId: findAsset(assets, 'cam') },
				],
			},
		];
	} else if (type === 'driveside') {
		return [
			{
				variant: { driveside: 'right' },
				assets: [
					{ assetId: findAsset(assets, 'rhd') },
				],
			},
			{
				variant: { driveside: 'left' },
				assets: [
					{ assetId: findAsset(assets, 'lhd') },
				],
			},
		];
	} else {
		return [];
	}
}

const regexes = {
	maxisnite: /-m(axis)?n(ite)?$/,
	darknite: /-d(ark)?n(ite)?$/,
	lhd: /-lhd$/,
	rhd: /-rhd$/,
	cam: /-cam$/,
};
function findAsset(assets, id) {
	const regex = regexes[id];
	return assets.find(asset => regex.test(asset.assetId)).assetId;
}
