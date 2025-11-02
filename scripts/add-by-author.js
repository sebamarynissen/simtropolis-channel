#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { styleText } from 'node:util';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import ora from 'ora';
import { run as addPackages } from './manual-add.js';

// # run()
// Fetches all files for the given author(s) and adds them to the channel
async function run(authors, argv) {

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
					spinner.warn(`No files found for author: ${styleText('bold', author)}`);
					continue;
				}
				throw new Error(`API returned status ${res.status}`);
			}

			let json = await res.json();
			if (Array.isArray(json) && json.length > 0) {
				allFiles.push(...json);
				spinner.succeed(`Found ${styleText('cyan', json.length + ' files')} for author: ${styleText('bold', author)}`);
			} else {
				spinner.warn(`No files found for author: ${styleText('bold', author)}`);
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

	// Show what we're about to process
	console.log(styleText('cyan', '\nFiles to be processed:'));
	for (let file of allFiles) {
		console.log(`  ${file.id}: ${file.title} (${file.author})`);
	}
	console.log();

	// Show action summary and prompt for confirmation
	console.log(styleText('yellow', 'Action summary:'));
	console.log(`  - ${styleText('cyan', `${allFiles.length} files`)} will be processed`);
	console.log(`  - New packages will be ${styleText('green', 'created')}`);
	console.log(`  - Existing packages will be ${argv.update ? styleText('green', 'updated') : styleText('red', 'skipped') + ' (use ' + styleText('dim', '--update') + ' to refresh all packages)'}`);

	if (!argv.yes) {
		const rl = createInterface({
			input: process.stdin,
			output: process.stdout,
		});
		const answer = await new Promise(resolve => {
			rl.question(`\n${styleText('bold', 'Continue?')} ${styleText('dim', '[y/N]')} `, resolve);
		});
		rl.close();

		if (answer.toLowerCase() !== 'y') {
			console.log('Cancelled');
			return;
		}
	}

	// Convert files to URLs and use shared logic from manual-add
	let urls = allFiles.map(file => file.fileURL);
	await addPackages(urls, argv);
}

// Detect if running via npm and customize script name in help output
const isNpm = !!process.env.npm_lifecycle_event;
const scriptName = isNpm ?
			`npm run ${process.env.npm_lifecycle_event} --` :
			'add-by-author.js';

// Define command line arguments and documentation
const { argv } = yargs(hideBin(process.argv))
	.scriptName(scriptName)
	.usage('Usage: $0 <author...> [options]')
	.example('$0 memo', 'Add all files by memo')
	.example('$0 memo "NAM Team"', 'Add files by multiple authors')
	.example('$0 95442', 'Add all files by author ID 95442 (memo)')
	.example('$0 memo --update', 'Add and update existing packages for memo')
	.example('$0 memo -y', 'Skip confirmation prompt')
	.example('$0 memo --cache /custom/cache', 'Use custom cache directory')
	.option('update', {
    alias: 'u',
		type: 'boolean',
		description: 'Update existing local packages',
		default: false,
	})
	.option('yes', {
		alias: 'y',
		type: 'boolean',
		description: 'Skip confirmation prompt',
		default: false,
	})
	.option('cache', {
    alias: 'c',
		type: 'string',
		description: 'Path to sc4pac cache directory',
	})
	.option('endpoint', {
    alias: 'e',
		type: 'string',
		description: 'STEX API endpoint URL (for testing)',
		default: 'https://community.simtropolis.com/stex/files-api.php',
	})
	.version(false)
  .group(['update', 'yes', 'cache', 'endpoint'], 'Options:')
  .group(['help'], 'Info:')
	.demandCommand(1, 'Please provide at least one author name or ID')
	.help();

await run(argv._, argv);
