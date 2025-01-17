// # generate-variants.js
import path from 'node:path';
import { kFileTags, kFileNames, kExtractedAsset } from './symbols.js';
import detectGrowables from './detect-growables.js';
import escape from './escape-pattern.js';

// # generateVaraints()
export default async function generateVariants(metadata) {

	// Now generate the variants from what we've decided to include. This will 
	// multiply the available variants by 2 in every step.
	let variants = await expandVariants(metadata);

	// If there are no variants, then we just include the assets as is.
	let assets;
	if (!variants || variants.length === 0) {
		assets = metadata.assets.map(asset => ({ assetId: asset.assetId }));
	}
	Object.assign(metadata.package, { assets, variants });

}

// # expandVariants(metadata)
// This function is responsible for expanding the variants based on the assets 
// in the upload.
export async function expandVariants(metadata) {
	let includedVariants = findIncludedVariants(metadata);
	let configs = generateVariantConfigs(includedVariants);
	return await generateVariantsForConfigs(configs, metadata);
}

// Regular expressions we use for detecting maxisnite or darknite *folders*.
const regexes = {
	maxisnite: /\b(maxis ?ni(te|ght)|mn)\b/i,
	darknite: /\b(dark ?ni(te|ght)|dn)\b/i,
};

// # findIncludedVariants(metadata)
// Finds the variants that are supported by this package. Note that we have no 
// way yet of inspecting the actual package contents, we only support detecting 
// this when there are separate downloads.
function findIncludedVariants(metadata) {
	let variants = new Set();
	let { assets } = metadata;
	if (hasOneOf(assets, ['maxisnite', 'darknite'])) {
		variants.add('nightmode');
	}
	if (hasOneOf(assets, ['rhd', 'lhd'])) {
		variants.add('driveside');
	}
	if (hasOneOf(assets, ['cam'])) {
		variants.add('CAM');
	}
	if (hasOneOf(assets, ['hd'])) {
		variants.add('resolution');
	}

	// It's possible that MN and DN variants are contained within the same 
	// asset. We can only detect this based on the included file names, so no 
	// tags will have been set yet!
	for (let asset of assets) {
		let files = asset[kFileNames] || [];
		for (let file of files) {
			let dir = path.dirname(file);
			if (matchDir(dir, regexes.maxisnite)) {
				variants.add('nightmode');
				asset[kFileTags].push('maxisnite');
			} else if (matchDir(dir, regexes.darknite)) {
				variants.add('nightmode');
				asset[kFileTags].push('darknite');
			}
		}
	}
	return [...variants];

}

const variations = {
	nightmode: ['standard', 'dark'],
	driveside: ['right', 'left'],
	CAM: ['no', 'yes'],
	resolution: ['sd', 'hd'],
};

// # generateVariantConfigs(variants)
// Generates an array of all the - variant: {} configurations that we support.
function generateVariantConfigs(variants) {
	let configs = [{}];
	for (let variant of variants) {
		let config = variations[variant];
		if (!config) continue;
		configs = expand(configs, { [variant]: config });
	}
	return configs;
}

function expand(arr, config) {
	let result = [];
	for (let el of arr) {
		for (let key of Object.keys(config)) {
			let variations = config[key];
			for (let variation of variations) {
				result.push({ ...el, [key]: variation });
			}
		}
	}
	return result;
}

// # hasOneOf(assets, tags)
// Returns whether the asset has at least one of the given tags.
function hasOneOf(assets, tags) {
	return assets.some(asset => {
		return (asset[kFileTags] || []).some(tag => tags.includes(tag));
	});
}

// # generateVariantsForConfigs(configs, metadata)
async function generateVariantsForConfigs(configs, metadata) {
	if (configs.length < 2) return;

	// Before generating the configuration for every variant, we'll check if a 
	// specific CAM asset exists. If that's the case, we will need to filter out 
	// the growables.
	let hasCam = metadata.assets.some(asset => has(asset, 'cam'));
	let growables = new Map();
	if (hasCam) {
		let nonCamAssets = metadata.assets.filter(asset => {
			let tags = asset[kFileTags];
			return !tags.includes('cam');
		});
		for (let asset of nonCamAssets) {
			if (!asset[kExtractedAsset]) continue;
			let list = await detectGrowables(asset[kExtractedAsset]);
			growables.set(asset, list);
		}
	}

	// Collect all tags as well because some variants need to know this 
	// information.
	let tags = [...new Set(metadata.assets.map(asset => {
		return asset[kFileTags] ?? [];
	}).flat())];
	return configs.map(config => {
		return generateVariant(config, metadata, { tags, growables });
	});

}

// # generateVariant(config, metadata)
function generateVariant(config, metadata, opts) {

	// First we'll filter out anything that is not label with the correct night 
	// mode variant.
	let dependencies = [];
	let exclusions = {};
	let { assets } = metadata;
	let { nightmode, driveside, CAM, resolution } = config;
	if (nightmode) {

		// IMPORTANT! If the building only contains a darknite variant, then we 
		// can't exclude the variant!
		let { tags } = opts;
		let opposite = nightmode === 'standard' ? 'darknite' : 'maxisnite';
		if (tags.includes('maxisnite') && tags.includes('darknite')) {
			assets = assets.filter(asset => {

				// If the asset has *both* tags, don't exclude it! Only exclude 
				// if it only has the opposite tag!
				if (has(asset, 'maxisnite') && has(asset, 'darknite')) {
					return true;
				}
				return !has(asset, opposite);
			});
		}
		if (nightmode === 'dark') dependencies.push('simfox:day-and-nite-mod');

		// If maxisnite and darknite are present *in the same asset*, then we 
		// have to filter out based on dir patterns.
		for (let asset of assets) {
			if (has(asset, 'maxisnite') && has(asset, 'darknite')) {
				let regex = regexes[opposite];
				let excluded = new Set();
				for (let file of asset[kFileNames] || []) {
					let dir = matchDir(path.dirname(file), regex);
					if (dir) {
						excluded.add(`/${escape(dir)}/`);
					}
				}
				let exclude = exclusions[asset.assetId] ??= [];
				exclude.push(...excluded);
			}
		}

	}
	if (driveside) {
		let opposite = driveside === 'left' ? 'rhd' : 'lhd';
		assets = assets.filter(asset => !has(asset, opposite));
	}

	// For the cam variant, things are a bit different, because it's on/off 
	// instead of a/b.
	if (CAM === 'no') {
		assets = assets.filter(asset => !has(asset, 'cam'));
	} else if (CAM === 'yes') {

		// Cool, this is a cam variant, which means we have to filter out all 
		// the growables that we've detected from the non-cam assets.
		for (let asset of assets) {
			if (has(asset, 'cam')) continue;
			let list = opts.growables.get(asset) ?? [];
			let exclude = exclusions[asset.assetId] ??= [];
			let escaped = list.map(file => {
				return `/${escape(file, x => `${x}$`)}`;
			});
			exclude.push(...escaped);
		}

	}

	// For the resolution, things are a bit different. There are two 
	// possibilities: either both a SD and HD asset exist. In that case we just 
	// use those "as they are". If only a HD asset exists, then we assume its 
	// meant to *overridde* the SC4Model files of the standard asset.
	if (resolution) {
		let hasSd = assets.some(asset => has(asset, 'sd'));
		if (hasSd) {
			let opposite = resolution === 'hd' ? 'sd' : 'hd';
			assets = assets.filter(asset => !has(asset, opposite));
		} else if (resolution === 'sd') {
			assets = assets.filter(asset => !has(asset, 'hd'));
		} else if (resolution === 'hd') {
			for (let asset of assets) {

				// Note: excluding the .SC4Model file should not happen for cam 
				// assets, they must only contain .SC4Lot files anyway.
				if (!has(asset, 'hd') && !has(asset, 'cam')) {
					let exclude = exclusions[asset.assetId] ??= [];
					exclude.push(...filterExclusions(asset, ['.SC4Model$']));
				}

			}
		}
	}

	// At last we'll compile everything together.
	return {
		variant: config,
		...dependencies.length > 0 && { dependencies },
		assets: assets.map(asset => {
			let exclude = exclusions[asset.assetId] ?? [];
			return {
				assetId: asset.assetId,
				...exclude.length > 0 && { exclude },
			};
		}),
	};

}

// # filterExclusions(asset, patterns)
// This function filters the given exclusion patterns so that we only keep the 
// ones that will actually do something. That way we avoid an sc4pac warning 
// message that some exclusion patterns didn't match anything. This only works 
// if the downloader succeeded to parse the filenames though.
function filterExclusions(asset, patterns) {
	let files = asset[kFileNames] ?? [];
	if (files.length === 0) return patterns;
	return patterns.filter(pattern => {
		let regex = new RegExp(pattern.replace('.', '\\.'), 'i');
		return files.some(file => regex.test(file));
	});
}

// # has(asset, tag)
// Returns whether the asset contains the given tag.
function has(asset, tag) {
	let tags = asset[kFileTags] ?? [];
	return tags.includes(tag);
}

// # matchDir(dirPath, regex)
// Recursively matches dirnames with the given regex.
function matchDir(dirPath, regex) {
	while (dirPath !== '.') {
		let name = path.basename(dirPath);
		if (regex.test(name.replaceAll('_', ' '))) return name;
		dirPath = path.dirname(dirPath);
	}
	return null;
}
