// # api-to-metadata.js
import path from 'node:path';
import { kFileInfo } from './symbols.js';
import categories from './categories.js';
import { slugify } from './util.js';

// # apiToMetadata(json)
// Transforms a single json results from the STEX api to the basic metadata 
// structure.
export default function apiToMetadata(json) {
	let pkg = {
		group: slugify(json.author),
		name: json.aliasEntry,
		version: json.release,
		subfolder: getSubfolder(json),
		info: {
			summary: json.title,
			description: undefined,
			author: json.author,
			website: json.fileURL,
			images: undefined,
		},
		dependencies: undefined,
		variants: undefined,
	};
	let assets = [];
	for (let i = 0; i < json.files.length; i++) {
		let file = json.files[i];
		let url = new URL(json.fileURL);
		url.searchParams.set('do', 'download');
		url.searchParams.set('r', json.files[i].id);
		let suffix = getAssetSuffix(file, i, json);
		assets.push({
			assetId: `${pkg.group}-${pkg.name}${suffix ? `-${suffix}` : ''}`,
			version: json.release,
			lastModified: normalizeDate(json.updated),
			url: url.href,
			[kFileInfo]: file,
		});
	}
	return {
		package: pkg,
		assets,
	};
}

// # getSubfolder(json)
// Parses the appropriate subfolder from the categories.
function getSubfolder(json) {
	let { cid } = json;
	return categories[cid];
}

// # getAssetSuffix(name, index, json)
// This function intelligently determines the asset suffix. This is mostly 
// useful for detecting maxis nite and dark nite versions.
function getAssetSuffix(file, index, json) {

	// If there's only 1 asset in this package, no suffix needed.
	if (json.files.length < 2) return '';

	// Normalize the filename to get the suffix.
	let slug = slugify(file.name);
	let name = path.basename(slug, path.extname(slug));
	if (/dark\s?ni(te|ght)/.test(name)) return 'darknite';
	if (/maxis\s?ni(te|ght)/.test(name)) return 'maxisnite';
	if (/\(dn\)/.test(name)) return 'darknite';
	if (/\(mn\)/.test(name)) return 'maxisnite';
	if (/\(cam(elot)?\)/.test(name)) return 'cam';
	if (/[_-\s]dn/.test(name)) return 'darknite';
	if (/[_-\s]mn/.test(name)) return 'maxisnite';
	if (/\(lhd\)/.test(name)) return 'lhd';
	if (/\(rhd\)/.test(name)) return 'rhd';
	return `part-${index}`;

}

// # normalizeDate(date)
// The date returned from the api does not have the correct format. Let's fix that.
function normalizeDate(date) {
	return date.replace(' ', 'T') + 'Z';
}
