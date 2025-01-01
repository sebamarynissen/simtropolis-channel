// # complete-metadata.js
import scrape from './scrape.js';
import { kFileTags, kExtractedAsset } from './symbols.js';
import detectGrowables from './detect-growables.js';

// # completeMetadata(metadata, json)
// Completes the metadata parsed from the api response with the description, 
// images and subfolder. For the moment we need to use HTML scraping for this, 
// as those fields are not yet included in the STEX api.
export default async function completeMetadata(metadata, json) {

	// Read the description, images & subfolder, and then complete the metadata 
	// with it.
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
	return await generateVariants(configs, metadata);
}

// # findIncludedVariants(metadata)
// Finds the variants that are supported by this package. Note that we have no 
// way yet of inspecting the actual package contents, we only support detecting 
// this when there are separate downloads.
function findIncludedVariants(metadata) {
	let variants = [];
	let { assets } = metadata;
	if (hasOneOf(assets, ['maxisnite', 'darknite'])) {
		variants.push('nightmode');
	}
	if (hasOneOf(assets, ['rhd', 'lhd'])) {
		variants.push('driveside');
	}
	if (hasOneOf(assets, ['cam'])) {
		variants.push('CAM');
	}
	if (hasOneOf(assets, ['hd'])) {
		variants.push('resolution');
	}
	return variants;
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

// # generateVariants(config, metadata)
async function generateVariants(configs, metadata) {
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
			let list = await detectGrowables(asset[kExtractedAsset]);
			growables.set(asset, list);
		}
	}
	return configs.map(config => {
		return generateVariant(config, metadata, { growables });
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
		let opposite = nightmode === 'standard' ? 'darknite' : 'maxisnite';
		assets = assets.filter(asset => !has(asset, opposite));
		if (nightmode === 'dark') dependencies.push('simfox:day-and-nite-mod');
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
				if (file.match(/[*+?^${}()|[\]\\]/)) {
					let chars = /[.*+?^${}()|[\]\\/]/g;
					return `/${file.replaceAll(chars, '\\$&')}$`;
				} else {
					return `/${file}`;
				}
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
