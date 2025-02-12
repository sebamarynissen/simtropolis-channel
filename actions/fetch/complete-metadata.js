// # complete-metadata.js
import scrape from './scrape.js';

// # completeMetadata(metadata, json)
// Completes the metadata parsed from the api response with the description, 
// images and subfolder. The only thing we can't parse from the api yet are the 
// descriptors, so we still need scraping for that.
export default async function completeMetadata(metadata, json) {
	let { package: pkg } = metadata;
	if (!pkg.subfolder) {
		let descriptors = await scrape(json.fileURL);
		pkg.subfolder = descriptorsToSubfolder(
			descriptors,
			pkg.info.description,
		);
	}
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
	let keys = Object.keys(descriptorMap);
	let normalized = descriptors.map(desc => {
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
