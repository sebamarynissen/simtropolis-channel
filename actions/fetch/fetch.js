// # fetch.js
// STEX api not working for the moment, we'll verify later. For now we'll use 
// the scraping approach.
// const file = '36581';
// const endpoint = 'https://community.simtropolis.com/STEX/files-api.php';
// const url = new URL(endpoint);
// url.searchParams.set('key', process.env.STEX_API_KEY);
// url.searchParams.set('file', file);
// let res = await fetch(url);
// console.log(await res.text());
import fs from 'node:fs';
import path from 'node:path';
import scrape from '@sebamarynissen/sc4pac-helpers/scrape.js';
import generate from '@sebamarynissen/sc4pac-helpers/generate.js';

// # fetch(opts)
export default async function fetch(opts) {
	let {
		url,
		cwd = process.env.GITHUB_WORKSPACE ?? process.cwd(),
	} = opts;
	let metadata = await scrape(url);
	let yaml = generate(metadata);
	let pkg = `${metadata.group}:${metadata.name}`;
	let output = path.resolve(cwd, `src/yaml/${metadata.group}/${metadata.name}.yaml`);

	// We'll first check if the package was already created. Depending on this 
	// we use the "Add" or "Update" commit message.
	let prefix = 'Update';
	try {
		await fs.promises.stat(output);
	} catch (e) {
		if (e.code === 'ENOENT') {
			prefix = 'Add';
		} else {
			throw e;
		}
	}

	await fs.promises.mkdir(path.dirname(output), { recursive: true });
	await fs.promises.writeFile(output, yaml);
	return {
		message: `${prefix} ${pkg}`,
	};
}
