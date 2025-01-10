// # patch-metadata.js
import * as dot from 'dot-prop';

// This function takes the main package metadata as generated from the STEX, and 
// then applies the user-defined metadata as a patch to it. Note that it's 
// possible that the user has specified multiple packages.
export default function patchMetadata(
	metadata,
	patch,
	original = metadata.package,
) {

	// If nothing needs to be patched, just return the package as is.
	if (!patch || patch === true) {
		return {
			packages: [metadata.package],
			assets: [...metadata.assets],
			main: metadata.package,
			basename: original.name,
		};
	}

	// The patch might contain patches for both packages and assets. We need to 
	// separate both to properly apply the patches.
	let packagePatches = [];
	let assetPatches = [];
	[patch].flat().forEach(metadata => {
		if (metadata.url) {
			assetPatches.push(metadata);
		} else {
			packagePatches.push(metadata);
		}
	});

	// If urls were specified for the assets, we have to update them because in 
	// that case the Simtropolis url becomes the nonPersistentUrl.
	let assets = [...metadata.assets];
	if (assetPatches.length > 0) {
		for (let i = 0; i < assets.length; i++) {
			let patch = assetPatches[i];
			if (!patch) continue;
			let { url } = patch;
			let { url: nonPersistentUrl, withChecksum, ...rest } = assets[i];
			assets[i] = {
				url,
				nonPersistentUrl,
				...rest,
			};
		}
	}

	// We first have to figure out what the "main package" of the user-defined 
	// metadata is, because the parsed dependencies and variants from the api 
	// should only be applied to the main package.
	let basename = original.name;
	let mainIndex = findMainPackageIndex(patch);
	let packages = [patch]
		.flat()
		.map((patch, index) => {
			let isMain = index === mainIndex;
			let bare = applyPatch(metadata.package, patch, { main: isMain });
			let filled = fill(bare, metadata);
			if (isMain && patch.name) {
				basename = filled.name;
			}
			return filled;
		});
	return {
		packages,
		main: packages[mainIndex],
		assets,
		basename,
	};

}

// # applyPatch(apiPackage, usePackage, opts)
// Completes the user-defined metadata with the information found in the stex 
// and returns it.
function applyPatch(apiPackage, userPackage, opts = {}) {
	apiPackage = { ...apiPackage };
	userPackage = { ...userPackage };
	if (Object.hasOwn(userPackage, 'main')) {
		delete userPackage.main;
	}

	// If this is not the main package, we *never* patch the variants or 
	// dependencies.
	if (!opts.main) {
		delete apiPackage.variants;
		delete apiPackage.dependencies;
		delete apiPackage?.info.website;
		delete apiPackage?.info.images;
	}
	return {
		...apiPackage,
		...userPackage,
		info: {
			...apiPackage.info,
			...userPackage.info,
		},
	};
}

// # fill(value)
// The function that recursively loops the given object and interpolates any 
// variables used in the text.
function fill(value, metadata) {
	if (typeof value === 'string') {
		return interpolate(value, metadata);
	} else if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			value[i] = fill(value[i], metadata);
		}
		return value;
	} else if (value !== null && typeof value === 'object') {
		for (let key of Object.keys(value)) {
			value[key] = fill(value[key], metadata);
		}
		return value;
	} else {
		return value;
	}
}

// # interpolate(str)
function interpolate(str, metadata) {
	let tokens = lex(str);
	return tokens.map(token => {
		if (token.type === 'literal') {
			return token.value;
		} else if (token.type === 'interpolation') {
			let path = token.value.replaceAll(/\.(\d+)/g, '[$1]');
			let value = dot.getProperty(metadata, path);
			return value ?? '';
		} else {
			return '';
		}
	}).join('');
}

// # lex(input)
function lex(input) {
	const regex = /\$\{\{(.*?)\}\}/g;
	let result = [];
	let lastIndex = 0;

	let match;
	while ((match = regex.exec(input)) !== null) {
		if (match.index > lastIndex) {
			result.push({
				type: 'literal',
				value: input.slice(lastIndex, match.index),
			});
		}
		result.push({
			type: 'interpolation',
			value: match[1].trim(),
		});
		lastIndex = regex.lastIndex;
	}

	// Add any remaining literal text
	if (lastIndex < input.length) {
		result.push({
			type: 'literal',
			value: input.slice(lastIndex),
		});
	}

	return result;
}

// # findMainPackageIndex(patch)
// Finds the main package to patch
function findMainPackageIndex(patch) {

	// In case there's only 1 patch, obviously this is the main patch object.
	if (!Array.isArray(patch) || patch.length === 1) {
		return 0;
	}

	// At this point we know that there are multiple packages to patch. In order 
	// to find the "main" package, we have several strategies. If a package has 
	// no specific name given, then this is the main package. Otherwise it can 
	// also be labeled as "main".
	let index = patch.findIndex(pkg => !Object.hasOwn(pkg, 'name'));
	if (index > -1) return index;
	index = patch.findIndex(pkg => pkg.main === true);
	if (index > -1) return index;
	return 0;

}
