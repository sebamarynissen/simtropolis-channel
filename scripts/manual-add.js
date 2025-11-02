#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { styleText } from 'node:util';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import ora from 'ora';
import { Glob } from 'glob';
import { parseAllDocuments } from 'yaml';
import addFromStex from '../actions/fetch/fetch.js';
import { urlToFileId } from '../actions/fetch/util.js';
import sc4d from './sc4d.js';
import stex from './stex.js';
import tsc from './tsc.js';

// # run()
// Exported function for adding packages by URL
export async function run(urls, argv) {

	// Sort the urls in ascending order so that dependencies are likely to be
	// processed first.
	urls = [urls].flat().sort();
	let dependencyIndex = await buildIndex();

	// Filter out URLs that are already present on other channels (like the
	// default channel). URLs that exist locally in this channel will be
	// reprocessed to update their metadata unless --no-update is specified.
	urls = urls.filter(url => {
		let id = urlToFileId(url);
		let pkg = dependencyIndex.stex[id];
		if (pkg) {
			if (pkg.local && !argv.update) {
				console.log(styleText('yellow', '⊘') + styleText('dim', ` Skipping ${url} (already exists
  locally, use --update to refresh)`));
				return false;
			}
			if (!pkg.local) {
				console.log(styleText('yellow', '⊘') + styleText('dim', ` Skipping ${url} (already present in one of the channels)`));
				return false;
			}
		}
		return true;
	});

	const {
		cache = process.env.SC4PAC_CACHE_ROOT,
	} = argv;
	const result = await addFromStex({
		cache,
		id: urls.length > 0 && urls.map(url => urlToFileId(url)).join(','),
		requireMetadata: argv.requireMetadata ?? false,
		splitOffResources: argv.split ?? false,
		darkniteOnly: argv.darkniteOnly ?? false,
		after: argv.after,
		dependencies: 'auto',
		dependencyIndex,
	});
	for (let pkg of result.packages) {
		let { errors = [] } = pkg;
		if (errors.length > 0) {
			console.error(styleText('red', `There was an error with ${pkg.url}:`));
		}
		for (let error of errors) {
			console.error(error);
		}
	}

}

// # buildIndex()
// This function builds up the index that maps all stex urls that have a package
const defaultUrl = 'https://memo33.github.io/sc4pac/channel/';
export async function buildIndex() {
	let spinner = ora(`Building up package index`).start();
	let index = {
		stex,
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
			(index.stex[id] ??= new Map()).set(name, {
				id: name,
				subfolder: parsed.subfolder,
				local: true,
			});
			index.stex[id].local = true;
		}
	}
}

// Only run when executed directly (not when imported as a module)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	// Detect if running via npm and customize script name in help output
	const isNpm = !!process.env.npm_lifecycle_event;
	const scriptName = isNpm ?
		`npm run ${process.env.npm_lifecycle_event} --` :
		'manual-add.js';

	// Define command line arguments and documentation
	const { argv } = yargs(hideBin(process.argv))
		.scriptName(scriptName)
		.usage('Usage: $0 <url...> [options]')
		.example('$0 https://community.simtropolis.com/files/file/12345-example/', 'Add a single package by URL')
		.example('$0 <url1> <url2> <url3>', 'Add multiple packages')
		.example('$0 <url> --no-update', 'Skip if package already exists locally')
		.option('update', {
			alias: 'u',
			type: 'boolean',
			description: 'Update existing local packages',
			default: true,
		})
		.version(false)
		.group(['update'], 'Options:')
		.group(['help'], 'Info:')
		.demandCommand(1, styleText('red', 'Please provide at least one STEX URL'))
		.help();

	await run(argv._, argv);
}
