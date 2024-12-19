// # scrape.js
import { JSDOM } from 'jsdom';
import ora from 'ora';
import parseDescription from './parse-description.js';

// Currently the STEX api does not include the description, nor images. Hence we 
// still use a scraping approach for now.
export default async function scrape(url) {
	let spinner = ora(`Scraping ${url}...`).start();
	let res = await fetch(url);
	if (res.status >= 400) {
		throw new Error(`HTTP ${res.status}`);
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

	return { description, images };

}
