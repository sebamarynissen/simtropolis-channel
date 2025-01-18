// # split-package.js
import './polyfill.js';
import path from 'node:path';
import { DBPF, FileType, ExemplarProperty } from 'sc4/core';
import { FileScanner } from 'sc4/plugins';
import { kExtractedAsset, kResourcePackage } from './symbols.js';
import escape from './escape-pattern.js';
const { ExemplarType } = ExemplarProperty;

export default async function splitPackage(metadata) {
	let { package: pkg, assets } = metadata;
	let map = {};
	for (let asset of assets) {
		let { resource, main } = await splitAsset(asset);
		map[asset.assetId] = {
			resource: getIncludeList(resource, main),
			main: getIncludeList(main, resource),
		};
	}

	// Assets have been processed, now perform the actual split.
	let resource = {
		[kResourcePackage]: true,
		group: pkg.group,
		name: `${pkg.name}-resources`,
		version: pkg.version,
		subfolder: '100-props-textures',
		info: {
			summary: `${pkg.info.summary} resources`,
			description: `This package is a resource for \`pkg=${pkg.group}:${pkg.name}\``,
			author: pkg.info.author,
			website: pkg.info.website,
		},
		assets: modifyAssets(pkg.assets, 'resource', map),
		variants: pkg.variants
			?.map(variant => {
				return {
					...variant,
					assets: modifyAssets(variant.assets, 'resource', map),
				};
			}),
	};
	let main = {
		...pkg,
		info: { ...pkg.info },
		assets: modifyAssets(pkg.assets, 'main', map),
		variants: pkg.variants
			?.map(variant => {
				return {
					...variant,
					assets: modifyAssets(variant.assets, 'main', map),
				};
			}),
	};
	main.dependencies ??= [];
	main.dependencies.unshift(`${resource.group}:${resource.name}`);
	return [main, resource];

}

// # splitAsset(asset)
async function splitAsset(asset) {
	let labels = await labelAsset(asset);
	let flatLabels = Object.entries(labels).map(([file, labels]) => ({ file, labels }));
	let { resource = [], main = [] } = Object.groupBy(flatLabels, row => {
		let { labels } = row;
		if (labels.length === 0) return 'main';
		if (labels.includes('lot') || labels.includes('flora')) {
			return 'main';
		} else {
			return 'resource';
		}
	});
	return { resource, main };
}

// # labelAsset(asset)
// This function labels each file in asset as either a lot, model, prop, flora, 
// texture or model - or nothing at all. Based on this, the splitAsset function 
// can group the files in both resources and main package.
async function labelAsset(asset) {

	// We'll start by simply reading in all files from the asset. .SC4Model, 
	// .SC4Lot can be labeled without parsing them.
	let labels = {};
	let cwd = asset[kExtractedAsset];
	let glob = new FileScanner('**/*', {
		cwd,
	});
	for await (let file of glob) {
		let ext = path.extname(file).toLowerCase();
		let rel = path.relative(cwd, file);
		if (ext === '.sc4lot') {
			labels[rel] = ['lot'];
			continue;
		} else if (ext === '.sc4model') {
			labels[rel] = ['model'];
			continue;
		}

		// In case of a .dat or .sc4desc, we actually have to parse the file as 
		// a dbpf.
		let labelsSet = new Set();
		let dbpf = new DBPF({ file, parse: false });
		await dbpf.parseAsync();
		for (let entry of dbpf) {
			if (entry.type === FileType.Exemplar) {
				let exemplar = await entry.readAsync();
				let type = exemplar.get('ExemplarType');
				if (type === ExemplarType.Prop) {
					labelsSet.add('prop');
				} else if (type === ExemplarType.Buildings) {

					// Note: we only add a building label for *growable* 
					// buildings! If this is a ploppable lot, then the building 
					// exemplar can't be re-used for a relot because it has a 
					// unique LotResourceKey. If you are going to relot a 
					// ploppable building, you should create your own building 
					// exemplar!
					let isPloppable = exemplar.get('LotResourceKey');
					labelsSet.add(isPloppable ? 'lot' : 'building');

				} else if (type === ExemplarType.Flora) {
					labelsSet.add('flora');
				} else if (type === ExemplarType.LotConfigurations) {
					labelsSet.add('lot');
				}
			} else if (entry.type === FileType.FSH) {
				labelsSet.add('texture');
			} else if (entry.type === FileType.S3D) {
				labelsSet.add('model');
			}
		}
		labels[rel] = [...labelsSet];

	}
	return labels;

}

function modifyAssets(assets, key, map) {
	let filtered = assets
		?.filter(asset => map[asset.assetId][key].length > 0)
		?.map(asset => {
			return {
				assetId: asset.assetId,
				include: map[asset.assetId][key],
			};
		});
	return filtered?.length === 0 ? undefined : filtered;
}

// # getIncludeList(asset, other)
function getIncludeList(asset, other) {

	// We will first try to compile the list by *extension*. For this, we need 
	// to be sure that the extension is not used in the other asset though.
	let extensionList = [];
	let myExtensions = new Set(getExtensions(asset));
	let otherExtensions = new Set(getExtensions(other));
	for (let ext of myExtensions) {
		if (!otherExtensions.has(ext)) {
			extensionList.push(ext);
		}
	}

	// Next we'll loop all files. If they are covered by the extension list 
	// already, cool, no need to specify the file explicitly. Otherwise, we have 
	// to include the file path explicitly.
	let rawList = [];
	for (let { file } of asset) {
		let ext = path.extname(file);
		if (extensionList.includes(ext)) continue;
		rawList.push(file);
	}

	// Zip both the extension list and raw list together.
	return [
		...extensionList.map(ext => `\\${ext}$`),
		...rawList.map(file => escape(file.replaceAll(path.sep, '/'))),
	];

}

// # getExtensions(files)
function getExtensions(files) {
	return files.map(row => path.extname(row.file));
}
