// # api-to-metadata.js
import './polyfill.js';
import path from 'node:path';
import { kFileInfo, kFileTags } from './symbols.js';
import categories from './categories.js';
import { slugify } from './util.js';

// # apiToMetadata(json)
// Transforms a single json results from the STEX api to the basic metadata 
// structure.
export default function apiToMetadata(json) {
	let pkg = {
		group: slugify(json.author),
		name: slugifyTitle(json.title),
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

	// First we'll loop all files and collect the tags for them. We do this in a 
	// separate loop so that we can find how many buildings there are without 
	// tags to determine if the assets need to be suffixed with "part-0", 
	// "part-1" etc.
	let allTags = json.files.map(file => getFileTags(file));
	let tagAmounts = Object.groupBy(allTags, arr => arr.length);
	let defaultSuffix = (tagAmounts[0] ?? []).length < 2 ?
		() => '' :
		i => `part${i}`;

	// Allright, now loop the files again and then actually generate the 
	// suffixes.
	for (let i = 0; i < json.files.length; i++) {
		let file = json.files[i];
		let url = new URL(json.fileURL);
		if (!url.pathname.endsWith('/')) {
			url.pathname = `${url.pathname}/`;
		}
		url.searchParams.set('do', 'download');
		url.searchParams.set('r', json.files[i].id);
		let tags = allTags[i];
		let suffix = getAssetSuffix(tags) || defaultSuffix(i);
		assets.push({
			assetId: `${pkg.group}-${pkg.name}${suffix ? `-${suffix}` : ''}`,
			version: json.release,
			lastModified: normalizeDate(json.updated),
			url: url.href,
			[kFileInfo]: file,
			[kFileTags]: tags,
		});
	}

	// We're not done yet. It's possible that some assets have the same name, 
	// which we have to avoid at all cost because the linter will fail in this 
	// case without the user being able to intervene - as assets are named 
	// automatically!
	let grouped = Object.groupBy(assets, asset => asset.assetId);
	for (let arr of Object.values(grouped)) {
		if (arr.length > 1) {
			for (let i = 0; i < arr.length; i++) {
				let asset = arr[i];
				asset.assetId += `-part-${i+1}`;
			}
		}
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

// # getFileTags(file)
// Returns an array of variant tags that applies to the file based on its name.
function getFileTags(file) {
	let tags = [];
	let slug = file.name.toLowerCase();
	let name = path.basename(slug, path.extname(slug));
	if (/dark\s?ni(te|ght)/.test(name)) tags.push('darknite');
	else if (/maxis\s?ni(te|ght)/.test(name)) tags.push('maxisnite');
	if (/\(dn\)/.test(name)) tags.push('darknite');
	else if (/\(mn\)/.test(name)) tags.push('maxisnite');
	if (/\bcam([ e]lots?)?\b/.test(name)) tags.push('cam');
	if (/[_-\s]dn/.test(name)) tags.push('darknite');
	else if (/[_-\s]mn/.test(name)) tags.push('maxisnite');
	if (/\(lhd\)/.test(name)) tags.push('lhd');
	else if (/\(rhd\)/.test(name)) tags.push('rhd');
	if (/\(hd( model)?\)/.test(name)) tags.push('hd');
	else if (/\(sd( model)?\)/.test(name)) tags.push('sd');
	return tags;
}

// # getAssetSuffix(tags)
let order = ['cam', 'rhd', 'lhd', 'hd', 'maxisnite', 'darknite'];
function getAssetSuffix(tags) {
	let sorted = [...tags].sort((a, b) => order.indexOf(a) - order.indexOf(b));
	return sorted.join('-');
}

// # normalizeDate(date)
// The date returned from the api does not have the correct format. Let's fix that.
function normalizeDate(date) {
	let normalized = date.replace(' ', 'T');
	if (!normalized.endsWith('Z')) {
		return `${normalized}Z`;
	} else {
		return normalized;
	}
}

// # slugifyTitle(title)
function slugifyTitle(title) {
	return slugify(title.replaceAll(/&/g, 'and').replaceAll(/\$/g, 's'))
		.replaceAll(/(\b)vol-/g, '$1vol');
}
