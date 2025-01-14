#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import ora from 'ora';
import { Glob } from 'glob';
import { parseAllDocuments } from 'yaml';
import fetchAll from '../actions/fetch/fetch-all.js';
import { urlToFileId } from '../actions/fetch/util.js';

// # run()
async function run(urls) {
	let index = await buildIndex();
	console.log(index[28404]);
	// let results = await fetchAll(urls);
}

// # buildIndex()
// This function builds up the index that maps all stex urls that have a package 
const defaultUrl = 'https://memo33.github.io/sc4pac/channel/';
async function buildIndex() {
	let spinner = ora(`Building up package index`).start();
	let index = {};
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
		if (!pkg.externalIds) continue;
		let { stex = [] } = pkg.externalIds;
		for (let id of stex) {
			let name = `${pkg.group}:${pkg.name}`;
			(index[id] ??= new Map()).set(name, {
				id: name,
				subfolder: pkg.category[0],
			});
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
