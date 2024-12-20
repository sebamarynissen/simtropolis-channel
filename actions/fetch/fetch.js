// # fetch.js
import nodeFs from 'node:fs';
import path from 'node:path';
import { parse, Document } from 'yaml';
import stylize from './stylize-doc.js';
import apiToMetadata from './api-to-metadata.js';
import Downloader from './downloader.js';
import patchMetadata from './patch-metadata.js';
import scrape from './scrape.js';
import Permissions from './permissions.js';
import { urlToFileId } from './util.js';
const endpoint = 'https://community.simtropolis.com/stex/files-api.php';

// # fetch(opts)
export default async function fetchPackage(opts) {

	// If the id given is a url, extract the id from it.
	let { id } = opts;
	if (String(id).startsWith('https://')) {
		id = urlToFileId(id);
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
	const {
		fs = nodeFs,
		cwd = process.env.GITHUB_WORKSPACE ?? process.cwd(),
	} = opts;
	let results = [];
	let data = parse(await fs.promises.readFile(path.join(cwd, 'permissions.yaml'))+'');
	let permissions = new Permissions(data);
	let handleOptions = {
		...opts,
		cwd,
		permissions,
	};
	for (let obj of json) {
		if (!permissions.isUploadAllowed(obj)) {
			console.log(`Creator of ${obj.fileURL} is not allowed to add a plugin to the channel.`);
			continue;
		}
		let result = await handleFile(obj, handleOptions);
		if (result) {
			if (result.error) {
				console.log(result.error.message);
				continue;
			}
			results.push(result);
		}
	}
	return results;

}

// # handleFile(json)
// Handles a single STEX file.
async function handleFile(json, opts = {}) {

	// Start by extracting all metadata we can from the api, and then combine 
	// this with scraping for the description and images as they are not 
	// included in the api response yet.
	let metadata = apiToMetadata(json);
	let { description, images } = await scrape(json.fileURL);
	let { package: pkg } = metadata;
	let { info } = pkg;
	if (!info.description) {
		info.description = description;
	}
	if (!info.images) {
		info.images = images;
	}

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
		// assets did not contain metadata either.
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
		console.log(`Package ${json.fileURL} does not have a metadata.yaml file in its root, skipping.`);
		return;
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
		throw new Error(`${e.message}\n\n${serialize(zipped)}`);
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
		title: `\`${id}@${main.version}\``,
		branch: `package/${id.replace(':', '-')}`,
		body: generateBody({
			packages,
			assets: metadata.assets,
			main,
		}),
	};

}

// # generateBody(opts)
// Generates the PR body based on the packages we've added.
function generateBody({ packages, assets, main }) {
	let body = [];
	let [image] = main.info?.images ?? [];
	body.push(`# ${main.info?.summary}\n`);
	if (image) {
		body.push(`![${main.info?.summary}](${image})\n`);
	}
	body.push('## Packages\n');
	body.push(...packages.map(pkg => {
		let line = `${pkg.group}:${pkg.name}`;
		if (pkg?.info.website) {
			line = `[${line}](${pkg.info.website})`;
		}
		return `- ${line}`;
	}));
	body.push('');
	body.push('## Assets\n');
	body.push(...assets.map(asset => {
		let { assetId, url } = asset;
		return `- [${assetId}](${url})`;
	}));
	return body.join('\n');
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
