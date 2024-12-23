// # scrape.js
import { JSDOM } from 'jsdom';
import ora from 'ora';
import parseDescription from './parse-description.js';
import { SimtropolisError } from './errors.js';

// Currently the STEX api does not include the description, nor images. Hence we 
// still use a scraping approach for now.
export default async function scrape(url) {
	let spinner = ora(`Scraping ${url}`).start();
	let res = await fetch(url);
	if (res.status >= 400) {
		spinner.fail();
		throw new SimtropolisError(res);
	}
	let html = await res.text();
	spinner.succeed();

	// Parse the html and then convert the description to markdown using 
	// turndown.
	const { window } = new JSDOM(html);
	const { document } = window;
	const $$ = (...args) => document.querySelectorAll(...args);
	let h2 = [...$$('h2')].find(node => {
		return node.textContent.toLowerCase().includes('about this file');
	});
	let descriptionNode = h2.parentElement.querySelector('section > div:first-child');
	let description = '';
	if (descriptionNode) {
		description = parseDescription(descriptionNode);
	}

	// Find the full images. If they don't exist, search for the thumbnails 
	// instead.
	let images = [...$$('ul.cDownloadsCarousel [data-fullURL]')]
		.map(span => span.getAttribute('data-fullURL'));
	if (images.length === 0) {
		images = [...$$('ul.cDownloadsCarousel img')]
			.map(img => img.getAttribute('src'));
	}

	// Sort the images so that anything hosted on Simtropolis comes first in 
	// order to avoid showing broken links (like imageshack).
	images.sort((a, b) => {
		let ai = a.includes('simtropolis.com') ? -1 : 1;
		let bi = b.includes('simtropolis.com') ? -1 : 1;
		return ai - bi;
	});

	// Find the file descriptor (if provided). From this we'll parse the 
	// subfolder later on.
	let descriptors = [...[...$$('li strong')]
		.filter(node => node.textContent.toLowerCase() === 'file descriptor')
		.at(0)
		?.closest('li')
		.querySelector('div:last-child')
		.childNodes ?? []]
		.filter(node => node.nodeName === '#text')
		.map(node => {
			return node
				.textContent
				.trim()
				.toLowerCase()
				.replaceAll(/\s+/g, '-')
				.replaceAll(/-+/g, '-');
		});
	let subfolder = descriptorToSubfolder(descriptors);
	return { description, images, subfolder };

}

// # descriptorToSubfolder(descriptors)
// Finds the best match for a subfolder based on the given descriptors. Note 
// that in case the file has both "mod" and "commercial" descriptors for 
// example, we use the best fit, so we'll properly sort them first.
export function descriptorToSubfolder(descriptors) {

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
	return undefined;
}

const descriptorMap = {
	dependency: '100-props-textures',
	residential: '200-residential',
	commercial: '300-commercial',
	industrial: '400-industrial',
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
	services: '600-civics',
	automata: '710-automata',
	transport: '700-transit',
	'mmp(s)': '180-flora',
	mod: '150-mods',
	misc: '150-mods',
};
