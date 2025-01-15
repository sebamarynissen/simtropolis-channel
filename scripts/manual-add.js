#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs';
import { styleText } from 'node:util';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import ora from 'ora';
import { Glob } from 'glob';
import { parseAllDocuments, Document } from 'yaml';
import { JSDOM } from 'jsdom';
import { marked } from 'marked';
import stylize from '../actions/fetch/stylize-doc.js';
import fetchAll from '../actions/fetch/fetch-all.js';
import { urlToFileId } from '../actions/fetch/util.js';
import parseDependencies from './parse-dependencies.js';
import sc4d from './sc4d.js';
import tsc from './tsc.js';

// # run()
async function run(urls) {

	// Sort the urls in ascending order so that dependencies are likely to be 
	// processed first.
	urls = [urls].flat().sort();
	let index = await buildIndex();
	let results = await fetchAll(urls);
	for (let result of results) {
		let [pkg] = result.metadata;
		if (!pkg.dependencies) {

			// If the package has no explicit dependencies specified, then we 
			// parse all links from the description.
			let jsdom = new JSDOM(marked(pkg.info.description));
			let links = [...jsdom.window.document.querySelectorAll('a')]
				.map(a => {
					let link = a.getAttribute('href');
					let text = a.textContent.trim();
					return { link, text };
				});
			let deps = parseDependencies(index, links);
			let unmatched = deps.filter(dep => dep.startsWith('"['));
			if (unmatched.length > 0) {
				let id = `${pkg.group}:${pkg.name}`;
				console.log(styleText('red', `${id} has unmatched dependencies that need to be fixed manually!`));
				for (let dep of unmatched) {
					console.log(`  ${styleText('cyan', dep)}`);
				}
			}
			if (deps.length > 0) {
				pkg.dependencies = deps;
			}

		}
		let file = `${pkg.group}/${result.id}-${pkg.name}.yaml`;
		let docs = result.metadata.map((data, i) => {
			let doc = stylize(new Document(data));
			if (i > 0) {
				doc.directives.docStart = true;
			}
			return doc;
		});
		let contents = docs.map(doc => doc.toString({
			lineWidth: 0,
		})).join('\n');
		let fullPath = path.resolve(
			import.meta.dirname,
			'../src/yaml',
			file,
		);
		await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
		await fs.promises.writeFile(fullPath, contents);
	}

}

// # buildIndex()
// This function builds up the index that maps all stex urls that have a package 
const defaultUrl = 'https://memo33.github.io/sc4pac/channel/';
async function buildIndex() {
	let spinner = ora(`Building up package index`).start();
	let index = {
		stex: {},
		sc4e: {},
		sc4d,
		tsc,
	};
	await Promise.all([
		buildChannelIndex(index, defaultUrl),
		buildLocalIndex(index),
	]);
	spinner.succeed('Package index built');
	return index;
}

// # buildChannelIndex(index, channel)
// Fetches a channel from a url and adds it to the index.
async function buildChannelIndex(index, channel) {
	let url = new URL('./sc4pac-channel-contents.json', channel);
	let { packages } = await fetch(url).then(res => res.json());
	for (let pkg of packages) {
		let { externalIds } = pkg;
		if (!externalIds) continue;
		for (let key of ['stex', 'sc4e']) {
			let ids = externalIds[key] ?? [];
			for (let id of ids) {
				let name = `${pkg.group}:${pkg.name}`;
				(index[key][id] ??= new Map()).set(name, {
					id: name,
					subfolder: pkg.category[0],
				});
			}
		}
	}
}

// # buildLocalIndex(index)
// Completes the package index with all our local packages. We don't fetch the 
// packages from the channel url because we may have local packages that we 
// require as dependencies.
async function buildLocalIndex(index) {
	const glob = new Glob('**/*.yaml', {
		cwd: path.resolve(import.meta.dirname, '../src'),
		absolute: true,
	});
	let tasks = [];
	for await (let file of glob) {
		tasks.push(addFileToIndex(index, file));
	}
	await Promise.all(tasks);
}

// # addFileToIndex(index, file)
async function addFileToIndex(index, file) {
	let buffer = await fs.promises.readFile(file);
	let docs = parseAllDocuments(String(buffer));
	for (let doc of docs) {
		let parsed = doc.toJSON();
		if (!parsed) continue;
		if (parsed.assetId) continue;
		if (!parsed.info) continue;
		let {
			website,
			websites = [website].filter(Boolean),
		} = parsed.info;
		for (let website of websites) {
			let id = urlToFileId(website);
			let name = `${parsed.group}:${parsed.name}`;
			(index[id] ??= new Map()).set(name, {
				id: name,
				subfolder: parsed.subfolder,
			});
		}
	}
}

const { argv } = yargs(hideBin(process.argv));
await run(argv._);
