// # api-to-metadata.js
import './polyfill.js';
import path from 'node:path';
import { kFileInfo, kFileTags } from './symbols.js';
import { slugify } from './util.js';
import parseDescription from './parse-description.js';

// # apiToMetadata(json)
// Transforms a single json results from the STEX api to the basic metadata 
// structure.
export default function apiToMetadata(json, opts = {}) {
	let description = json.descHTML && parseDescription(json.descHTML);
	let descriptors = json.descriptor?.split(',').map(x => x.trim());
	let pkg = {
		group: slugify(json.group || json.author),
		name: slugifyTitle(json.title),
		version: json.release,
		subfolder: descriptorsToSubfolder(descriptors, description),
		info: {
			summary: json.title,
			description,
			author: json.author,
			website: json.fileURL,
			images: json.images,
		},
		dependencies: undefined,
		variants: undefined,
	};
	let assets = [];

	// First we'll loop all files and collect the tags for them. We do this in a 
	// separate loop so that we can find how many buildings there are without 
	// tags to determine if the assets need to be suffixed with "part-0", 
	// "part-1" etc.
	let allTags = json.files.map(file => {
		let tags = getFileTags(file);
		if (opts.darkniteOnly) tags.push('darknite');
		return [...new Set(tags)];
	});
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

	// Sort the images so that anything hosted on Simtropolis comes first in 
	// order to avoid showing broken links (like imageshack).
	pkg.info.images?.sort((a, b) => {
		let ai = a.includes('simtropolis.com') ? -1 : 1;
		let bi = b.includes('simtropolis.com') ? -1 : 1;
		return ai - bi;
	});
	return [pkg, ...assets];

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
		.replaceAll(/(\b)vol-(\d)/g, '$1vol$2');
}

// # descriptorsToSubfolder(descriptors)
// Finds the best match for a subfolder based on the given descriptors. Note 
// that in case the file has both "mod" and "commercial" descriptors for 
// example, we use the best fit, so we'll properly sort them first.
export function descriptorsToSubfolder(descriptors, description) {

	// Note: apparently Simtropolis sometimes has longer descriptors than what 
	// is possible to set when uploading a file. For example, we've seen 
	// Residential Re-lot. Hence we use a mechanism first for "normalizing" the 
	// keys by progressively looking up the "parent" name.
	if (!descriptors) return descriptors;
	let keys = Object.keys(descriptorMap);
	let normalized = descriptors
		.map(descriptor => {
			return descriptor
				.trim()
				.toLowerCase()
				.replaceAll(/\s+/g, '-')
				.replaceAll(/-+/g, '-');
		})
		.map(desc => {
			let pivot = desc;
			while (pivot && !Object.hasOwn(descriptorMap, pivot)) {
				let parts = pivot.split('-');
				parts.pop();
				pivot = parts.join('-');
			}
			return pivot || desc;
		});

	// Now properly sort so that "residential" for example comes before "mod".
	let sorted = [...normalized].sort((a, b) => {
		return keys.indexOf(a) - keys.indexOf(b);
	});
	for (let key of sorted) {
		if (Object.hasOwn(descriptorMap, key)) {
			return descriptorMap[key];
		}
	}

	// If we don't have a subfolder by now, try the description.
	if (description.match(/\bR(\$|§)+/)) {
		return '200-residential';
	} else if (description.match(/\bC[OoSs](\$|§)+/m)) {
		return '300-commercial';
	} else if (description.match(/\bI-(HT|M|D)\b/i)) {
		return '400-industrial';
	} else if (description.match(/\bfire station\b/i)) {
		return '610-safety';
	} else if (description.match(/\bstation\b/i)) {
		return '700-transit';
	} else if (description.match(/\b(school|library|museum)\b/i)) {
		return '620-education';
	} else if (description.match(/\blandmark\b/i)) {
		return '360-landmark';
	} else if (description.match(/\bparks? menu\b/i)) {
		return '660-parks';
	} else if (description.match(/\b(church|cathedral)\b/i)) {
		return '650-religion';
	}
	return undefined;
}

const descriptorMap = {
	dependency: '100-props-textures',
	residential: '200-residential',
	commercial: '300-commercial',
	industrial: '400-industrial',
	industry: '400-industrial',
	agricultural: '410-agriculture',
	'utilities-water': '500-utilities',
	'utilities-power': '500-utilities',
	'utilities-garbage': '500-utilities',
	'services-police': '610-safety',
	'services-fire': '610-safety',
	'services-education': '620-education',
	'services-medical': '630-health',
	'civics-landmarks': '360-landmark',
	'civics-rewards': '360-landmark',
	'civics-parks': '660-parks',
	civics: '600-civics',
	civic: '600-civics',
	services: '600-civics',
	automata: '710-automata',
	transport: '700-transit',
	'mmp(s)': '180-flora',
	mod: '150-mods',
	misc: '150-mods',
};
