// # scrape.js
import { JSDOM } from 'jsdom';
import ora from 'ora';
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

	// Find the file descriptor (if provided). From this we'll parse the 
	// subfolder later on.
	return [...[...$$('li strong')]
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

}
