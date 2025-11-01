#!/usr/bin/env node
import { styleText } from 'node:util';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import ora from 'ora';
import { run as addPackages } from './manual-add.js';

// # run()
// Fetches all files for the given author(s) and adds them to the channel
async function run(authors, argv) {

	if (!authors || authors.length === 0) {
		console.error(styleText('red', 'Error: Please provide at least one author name or ID'));
		console.log('Usage: npm run add:author -- "author name" [additional authors...]');
		console.log('Example: npm run add:author -- dogfight "NAM Team"');
		process.exit(1);
	}

	const endpoint = argv.endpoint ?? 'https://community.simtropolis.com/stex/files-api.php';
	const apiKey = process.env.STEX_API_KEY;

	if (!apiKey) {
		console.error(styleText('red', 'Error: STEX_API_KEY environment variable is not set'));
		console.log('Please add your STEX API key to your .env file');
		process.exit(1);
	}

	// Collect all files from all authors
	let allFiles = [];

	for (let author of authors) {
		let spinner = ora(`Fetching files for author: ${author}`).start();

		// Build the API URL
		const url = new URL(endpoint);
		url.searchParams.set('key', apiKey);
		url.searchParams.set('author', author);
		// Get all files regardless of date
		url.searchParams.set('days', '-1');
		// Only SC4 files
		url.searchParams.set('sc4only', 'true');
		url.searchParams.set('mode', 'submitted');
		url.searchParams.set('desctype', 'html,urls');
		url.searchParams.set('images', 'main');
		url.searchParams.set('metadata', 'true');
		// Oldest first, so dependencies are likely processed first
		url.searchParams.set('sort', 'asc');

		try {
			let res = await fetch(url);
			if (res.status >= 400) {
				if (res.status === 404) {
					spinner.warn(`No files found for author: ${author}`);
					continue;
				}
				throw new Error(`API returned status ${res.status}`);
			}

			let json = await res.json();
			if (Array.isArray(json) && json.length > 0) {
				allFiles.push(...json);
				spinner.succeed(`Found ${json.length} file(s) for author: ${author}`);
			} else {
				spinner.warn(`No files found for author: ${author}`);
			}
		} catch (error) {
			spinner.fail(`Failed to fetch files for author: ${author}`);
			console.error(styleText('red', error.message));
		}
	}

	if (allFiles.length === 0) {
		console.log(styleText('yellow', 'No files found for any of the specified authors'));
		return;
	}

	console.log(styleText('cyan', `\nTotal files found: ${allFiles.length}`));

	// Show what we're about to process
	console.log(styleText('cyan', '\nFiles to be added:'));
	for (let file of allFiles) {
		console.log(`  ${file.id}: ${file.title} (${file.author})`);
	}
	console.log();

	// Convert files to URLs and use shared logic from manual-add
	let urls = allFiles.map(file => file.fileURL);
	await addPackages(urls, argv);
}

// Parse command line arguments
const { argv } = yargs(hideBin(process.argv))
	.usage('Usage: $0 <author> [authors...] [options]')
	.example('$0 dogfight', 'Add all files by dogfight')
	.example('$0 dogfight "NAM Team"', 'Add files by multiple authors')
	.example('$0 175214', 'Add all files by author ID 175214 (dogfight)')
	.example('$0 dogfight --cache /custom/cache', 'Use custom cache directory')
	.option('cache', {
		type: 'string',
		description: 'Path to sc4pac cache directory',
	})
	.option('endpoint', {
		type: 'string',
		description: 'STEX API endpoint URL (for testing)',
		default: 'https://community.simtropolis.com/stex/files-api.php',
	})
	.demandCommand(1, 'Please provide at least one author name or ID')
	.help();

await run(argv._, argv);
