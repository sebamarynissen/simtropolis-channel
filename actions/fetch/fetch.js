// # fetch.js
import fs from 'node:fs';
import path from 'node:path';
import { Document } from 'yaml';
import stylize from './stylize-doc.js';
import apiToMetadata from './api-to-metadata.js';
const endpoint = 'https://community.simtropolis.com/stex/files-api.php';

// # fetch(opts)
export default async function fetchPackage(opts) {

	// If the id given is a url, extract the id from it.
	let { id } = opts;
	if (id.startsWith('https://')) {
		let { pathname } = new URL(id);
		id = pathname
			.replace(/\/$/, '')
			.split('/')
			.at(-1)
			.split('-')
			.at(0);
	}

	// Build up the url.
	const url = new URL(endpoint);
	url.searchParams.set('key', process.env.STEX_API_KEY);
	url.searchParams.set('id', id);

	// Fetch from the api.
	// TODO: handle errors here.
	let res = await fetch(url);
	if (res.status >= 400) {
		throw new Error(`Simtropolis returned ${res.status}!`);
	}
	let json = await res.json();
	if (!Array.isArray(json) || json.length === 0) {
		throw new Error(`File ${id} was not found!`);
	}

	// Handle all files one by one to not flood Simtropolis.
	let results = [];
	let handleOptions = {
		cwd: process.env.GITHUB_WORKSPACE ?? process.cwd(),
	};
	for (let obj of json) {
		results.push(await handleFile(obj, handleOptions));
	}
	let message = results.map((result, index) => {
		let { message } = result;
		return index > 0 ? message.toLowerCase() : message;
	}).join(', ');
	return { message };

}

// # handleFile(json)
// Handles a single STEX file.
async function handleFile(json, opts = {}) {

	// Start by extracting all metadata we can from the api.
	let metadata = apiToMetadata(json);

	// TODO: Use scraping for description and images, these are not yet included 
	// in the api.
	// TODO: download the assets and check if one of them contains a yaml 
	// metadata file.

	// Now generate the variants from what we've decided to include. This will 
	// multiply the available variants by 2 in every step.
	let includedVariants = findIncludedVariants(metadata);
	let variants = generateVariants(includedVariants, metadata);

	// If there are no variants, then we just include the assets as is.
	let assets;
	if (!variants || variants.length === 0) {
		assets = metadata.assets;
	}
	Object.assign(metadata.package, { assets, variants });

	// Generate the proper yaml documents now.
	let docs = [metadata.package, ...metadata.assets].map((json, index) => {
		let doc = new Document(json);
		if (index === 0) {
			doc = stylize(doc);
		} else {
			doc.directives.docStart = true;
		}
		return doc;
	});

	// Note: if the file already exists, we'll use "Update" instead of "Add" in 
	// the commit message.
	let { cwd, path: srcPath = 'src/yaml' } = opts;
	let { group, name } = metadata.package;
	let pkg = `${group}:${name}`;
	let yaml = docs.join('\n');
	let output = path.resolve(cwd, srcPath, `${group}/${name}.yaml`);
	let label = 'Add';
	if (fs.existsSync(output)) {
		label = 'Update';
	}
	await fs.promises.mkdir(path.dirname(output), { recursive: true });
	await fs.promises.writeFile(output, yaml);
	return {
		id: pkg,
		metadata,
		message: `${label} ${pkg}`,
	};

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

function ucfirst(str) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}
