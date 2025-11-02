#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { styleText } from 'node:util';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import ora from 'ora';

// Import existing index building functionality
import { buildIndex } from './manual-add.js';

// SQLite support is optional
let Database;
try {
	const betterSqlite3 = await import('better-sqlite3');
	Database = betterSqlite3.default;
} catch {
	// SQLite not available
}

// Categories to exclude (Tools, Maps, Region)
const EXCLUDED_CATEGORIES = [115, 116, 117];

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetches all files from STEX API with pagination
 */
async function fetchAllStexFiles(apiKey, endpoint, delayMs = 2000) {
	const allFiles = [];
	let offset = 0;
	const limit = 1000;
	let batch = 1;

	let spinner = ora('Fetching STEX files...').start();

	while (true) {
		// Build the API URL
		const url = new URL(endpoint);
		url.searchParams.set('key', apiKey);
		// All files
		url.searchParams.set('days', '-1');
		url.searchParams.set('sc4only', 'true');
		url.searchParams.set('mode', 'submitted');
		url.searchParams.set('sort', 'asc');
		url.searchParams.set('offset', offset.toString());
		url.searchParams.set('limit', limit.toString());
		url.searchParams.set('metadata', 'true');
		url.searchParams.set('desctype', 'html,urls');
		url.searchParams.set('images', 'main');

		spinner.text = `Fetching batch ${batch} (offset ${offset})...`;

		let retries = 0;
		const maxRetries = 3;

		while (retries <= maxRetries) {
			try {
				const res = await fetch(url);

				if (res.status === 429) {
					// Rate limited - wait longer and retry
					const waitTime = delayMs * Math.pow(2, retries);
					spinner.text = `Rate limited, waiting ${waitTime / 1000}s before retry ${retries + 1}/${maxRetries}...`;
					await sleep(waitTime);
					retries++;
					continue;
				}

				if (!res.ok) {
					throw new Error(`API returned status ${res.status}`);
				}

				const json = await res.json();
				if (!Array.isArray(json) || json.length === 0) {
					spinner.succeed(`Fetched ${styleText('cyan', allFiles.length.toString())} total STEX files`);
					return allFiles;
				}

				// Filter out excluded categories
				const filtered = json.filter(file => !EXCLUDED_CATEGORIES.includes(file.cid));
				allFiles.push(...filtered);

				spinner.text = `Fetched ${allFiles.length} files so far...`;

				// If we got fewer than limit results, we've reached the end
				if (json.length < limit) {
					spinner.succeed(`Fetched ${styleText('cyan', allFiles.length.toString())} total STEX files`);
					return allFiles;
				}

				offset += limit;
				batch++;

				// Add delay between requests to avoid rate limiting
				if (delayMs > 0) {
					await sleep(delayMs);
				}

				break; // Success, exit retry loop
			} catch (error) {
				if (retries === maxRetries) {
					spinner.fail('Failed to fetch STEX files');
					throw error;
				}
				retries++;
				const waitTime = delayMs * Math.pow(2, retries);
				spinner.text = `Error, waiting ${waitTime / 1000}s before retry ${retries}/${maxRetries}...`;
				await sleep(waitTime);
			}
		}
	}
}

/**
 * Compares STEX files against package index to find missing packages
 */
function findMissingPackages(stexFiles, index) {
	const missing = [];

	for (const file of stexFiles) {
		const fileId = file.id.toString();
		const packageInfo = index.stex[fileId];

		// If not in index at all, it's missing from both channels
		if (!packageInfo) {
			missing.push({
				fileId: file.id,
				authorName: file.author,
				authorId: file.uid,
				title: file.title,
				category: file.category,
				descriptor: file.descriptor,
				stexUrl: file.fileURL,
				submittedDate: file.submitted,
				updatedDate: file.updated,
				hasMetadata: !!file.metadata,
				missingFrom: 'both',
			});
			continue;
		}

		// Check if it's local-only (not in main channel)
		const hasLocal = packageInfo.local;
		const hasRemote = packageInfo.size > (hasLocal ? 1 : 0);

		if (hasLocal && !hasRemote) {
			missing.push({
				fileId: file.id,
				authorName: file.author,
				authorId: file.uid,
				title: file.title,
				category: file.category,
				descriptor: file.descriptor,
				stexUrl: file.fileURL,
				submittedDate: file.submitted,
				updatedDate: file.updated,
				hasMetadata: !!file.metadata,
				missingFrom: 'main',
			});
		}
	}

	return missing;
}

/**
 * Generates statistics from missing packages
 */
function generateStats(missing) {
	const stats = {
		total: missing.length,
		byAuthor: {},
		byCategory: {},
		withMetadata: missing.filter(p => p.hasMetadata).length,
		missingFromBoth: missing.filter(p => p.missingFrom === 'both').length,
		missingFromMain: missing.filter(p => p.missingFrom === 'main').length,
	};

	for (const pkg of missing) {
		// Count by author
		if (!stats.byAuthor[pkg.authorName]) {
			stats.byAuthor[pkg.authorName] = {
				count: 0,
				authorId: pkg.authorId,
				withMetadata: 0,
			};
		}
		stats.byAuthor[pkg.authorName].count++;
		if (pkg.hasMetadata) {
			stats.byAuthor[pkg.authorName].withMetadata++;
		}

		// Count by category
		stats.byCategory[pkg.category] = (stats.byCategory[pkg.category] || 0) + 1;
	}

	return stats;
}

/**
 * Outputs results to SQLite database
 */
function outputToSqlite(missing, stats, outputDir) {
	if (!Database) {
		throw new Error('SQLite support requires the better-sqlite3 package. Install it with: npm install -D better-sqlite3');
	}

	const dbPath = path.join(outputDir, 'coverage.db');

	// Remove existing database if it exists
	if (fs.existsSync(dbPath)) {
		fs.unlinkSync(dbPath);
	}

	const db = new Database(dbPath);

	// Create tables
	db.exec(`
		CREATE TABLE missing_packages (
			file_id INTEGER PRIMARY KEY,
			author_name TEXT,
			author_id INTEGER,
			title TEXT,
			category TEXT,
			descriptor TEXT,
			stex_url TEXT,
			submitted_date TEXT,
			updated_date TEXT,
			has_metadata BOOLEAN,
			missing_from TEXT
		);

		CREATE INDEX idx_author ON missing_packages(author_name);
		CREATE INDEX idx_category ON missing_packages(category);
		CREATE INDEX idx_missing_from ON missing_packages(missing_from);
		CREATE INDEX idx_has_metadata ON missing_packages(has_metadata);

		CREATE TABLE stats (
			key TEXT PRIMARY KEY,
			value TEXT
		);

		CREATE TABLE author_stats (
			author_name TEXT PRIMARY KEY,
			author_id INTEGER,
			package_count INTEGER,
			with_metadata INTEGER
		);

		CREATE TABLE category_stats (
			category TEXT PRIMARY KEY,
			package_count INTEGER
		);
	`);

	// Insert missing packages
	const insertPackage = db.prepare(`
		INSERT INTO missing_packages VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);

	for (const pkg of missing) {
		insertPackage.run(
			pkg.fileId,
			pkg.authorName,
			pkg.authorId,
			pkg.title,
			pkg.category,
			pkg.descriptor,
			pkg.stexUrl,
			pkg.submittedDate,
			pkg.updatedDate,
			pkg.hasMetadata ? 1 : 0,
			pkg.missingFrom,
		);
	}

	// Insert overall stats
	const insertStat = db.prepare('INSERT INTO stats VALUES (?, ?)');
	insertStat.run('total', stats.total.toString());
	insertStat.run('with_metadata', stats.withMetadata.toString());
	insertStat.run('missing_from_both', stats.missingFromBoth.toString());
	insertStat.run('missing_from_main', stats.missingFromMain.toString());

	// Insert author stats
	const insertAuthor = db.prepare('INSERT INTO author_stats VALUES (?, ?, ?, ?)');
	for (const [author, data] of Object.entries(stats.byAuthor)) {
		insertAuthor.run(author, data.authorId, data.count, data.withMetadata);
	}

	// Insert category stats
	const insertCategory = db.prepare('INSERT INTO category_stats VALUES (?, ?)');
	for (const [category, count] of Object.entries(stats.byCategory)) {
		insertCategory.run(category, count);
	}

	db.close();
	return dbPath;
}

/**
 * Outputs results to JSON file
 */
function outputToJson(missing, stats, outputDir) {
	const jsonPath = path.join(outputDir, 'coverage.json');
	const output = {
		generatedAt: new Date().toISOString(),
		stats,
		packages: missing,
	};
	fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2));
	return jsonPath;
}

/**
 * Outputs results to CSV file
 */
function outputToCsv(missing, outputDir) {
	const csvPath = path.join(outputDir, 'coverage.csv');
	const headers = [
		'File ID',
		'Author',
		'Author ID',
		'Title',
		'Category',
		'Descriptor',
		'STEX URL',
		'Submitted',
		'Updated',
		'Has Metadata',
		'Missing From',
	];

	const rows = missing.map(pkg => [
		pkg.fileId,
		`"${pkg.authorName.replace(/"/g, '""')}"`,
		pkg.authorId,
		`"${pkg.title.replace(/"/g, '""')}"`,
		pkg.category,
		pkg.descriptor,
		pkg.stexUrl,
		pkg.submittedDate,
		pkg.updatedDate,
		pkg.hasMetadata ? 'Yes' : 'No',
		pkg.missingFrom,
	]);

	const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
	fs.writeFileSync(csvPath, csv);
	return csvPath;
}

/**
 * Outputs results to Markdown file
 */
function outputToMarkdown(missing, stats, outputDir) {
	const mdPath = path.join(outputDir, 'coverage.md');

	let md = '# STEX Coverage Report\n\n';
	md += `Generated: ${new Date().toISOString()}\n\n`;

	// Overall stats
	md += '## Summary Statistics\n\n';
	md += `- **Total missing packages**: ${stats.total}\n`;
	md += `- **Missing from both channels**: ${stats.missingFromBoth}\n`;
	md += `- **Missing from main channel only**: ${stats.missingFromMain}\n`;
	md += `- **Packages with metadata.yaml**: ${stats.withMetadata} (${((stats.withMetadata / stats.total) * 100).toFixed(1)}%)\n\n`;

	// Top authors
	md += '## Top Authors with Missing Packages\n\n';
	const sortedAuthors = Object.entries(stats.byAuthor)
		.sort(([, a], [, b]) => b.count - a.count)
		.slice(0, 20);

	md += '| Author | Count | With Metadata | Author ID |\n';
	md += '|--------|-------|---------------|----------|\n';
	for (const [author, data] of sortedAuthors) {
		md += `| ${author} | ${data.count} | ${data.withMetadata} | ${data.authorId} |\n`;
	}
	md += '\n';

	// Category breakdown
	md += '## Missing Packages by Category\n\n';
	const sortedCategories = Object.entries(stats.byCategory)
		.sort(([, a], [, b]) => b - a);

	md += '| Category | Count |\n';
	md += '|----------|-------|\n';
	for (const [category, count] of sortedCategories) {
		md += `| ${category} | ${count} |\n`;
	}
	md += '\n';

	// Packages grouped by author
	md += '## Missing Packages by Author\n\n';
	const byAuthor = {};
	for (const pkg of missing) {
		if (!byAuthor[pkg.authorName]) {
			byAuthor[pkg.authorName] = [];
		}
		byAuthor[pkg.authorName].push(pkg);
	}

	for (const [author, packages] of Object.entries(byAuthor).sort(([, a], [, b]) => b.length - a.length)) {
		md += `### ${author} (${packages.length} packages)\n\n`;
		for (const pkg of packages) {
			const metadataTag = pkg.hasMetadata ? ' 📋' : '';
			const missingTag = pkg.missingFrom === 'both' ? ' ⚠️' : '';
			md += `- [${pkg.title}](${pkg.stexUrl}) - ${pkg.category}${metadataTag}${missingTag}\n`;
		}
		md += '\n';
	}

	md += '---\n\n';
	md += '**Legend**:\n';
	md += '- 📋 = Has metadata.yaml file\n';
	md += '- ⚠️ = Missing from both channels\n';

	fs.writeFileSync(mdPath, md);
	return mdPath;
}

/**
 * Main function
 */
async function run(argv) {
	const apiKey = process.env.STEX_API_KEY;
	if (!apiKey) {
		console.error(styleText('red', 'Error: STEX_API_KEY environment variable is not set'));
		console.log('Please add your STEX API key to your .env file');
		process.exit(1);
	}

	const endpoint = argv.endpoint ?? 'https://community.simtropolis.com/stex/files-api.php';
	const format = argv.format ?? 'markdown';
	const delay = argv.delay ?? 2000;

	console.log(styleText('bold', '📊 STEX Coverage Analysis\n'));

	// Step 1: Build package index
	const index = await buildIndex();

	// Step 2: Fetch all STEX files
	const stexFiles = await fetchAllStexFiles(apiKey, endpoint, delay);

	// Step 3: Find missing packages
	const spinner = ora('Analyzing coverage...').start();
	const missing = findMissingPackages(stexFiles, index);
	const stats = generateStats(missing);
	spinner.succeed('Analysis complete');

	// Step 4: Create output directory
	const outputDir = path.resolve(import.meta.dirname, '../coverage-report');
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	// Step 5: Generate output files
	console.log();
	const outputSpinner = ora('Generating reports...').start();
	const outputs = [];

	if (format === 'all' || format === 'sqlite') {
		const dbPath = outputToSqlite(missing, stats, outputDir);
		outputs.push(`SQLite: ${styleText('cyan', dbPath)}`);
	}

	if (format === 'all' || format === 'json') {
		const jsonPath = outputToJson(missing, stats, outputDir);
		outputs.push(`JSON: ${styleText('cyan', jsonPath)}`);
	}

	if (format === 'all' || format === 'csv') {
		const csvPath = outputToCsv(missing, outputDir);
		outputs.push(`CSV: ${styleText('cyan', csvPath)}`);
	}

	if (format === 'all' || format === 'markdown') {
		const mdPath = outputToMarkdown(missing, stats, outputDir);
		outputs.push(`Markdown: ${styleText('cyan', mdPath)}`);
	}

	outputSpinner.succeed('Reports generated');

	// Step 6: Display summary
	console.log();
	console.log(styleText('bold', '📈 Summary\n'));
	console.log(`Total STEX files analyzed: ${styleText('cyan', stexFiles.length.toString())}`);
	console.log(`Missing packages: ${styleText('yellow', stats.total.toString())}`);
	console.log(`  - Missing from both channels: ${styleText('red', stats.missingFromBoth.toString())}`);
	console.log(`  - Missing from main channel only: ${styleText('yellow', stats.missingFromMain.toString())}`);
	console.log(`  - With metadata.yaml: ${styleText('green', stats.withMetadata.toString())} (${((stats.withMetadata / stats.total) * 100).toFixed(1)}%)`);

	console.log();
	console.log(styleText('bold', '📁 Output Files:\n'));
	for (const output of outputs) {
		console.log(`  ${output}`);
	}

	console.log();
	console.log(styleText('dim', 'Tip: Use a SQLite browser to query the database, or open the Markdown report for a human-readable view.'));
}

// Only run when executed directly (not when imported as a module)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	// Detect if running via npm and customize script name in help output
	const isNpm = !!process.env.npm_lifecycle_event;
	const scriptName = isNpm ?
		`npm run ${process.env.npm_lifecycle_event} --` :
		'scan-coverage.js';

	// Define command line arguments and documentation
	const { argv } = yargs(hideBin(process.argv))
		.scriptName(scriptName)
		.usage('Usage: $0 [options]')
		.example('$0', 'Generate Markdown report (default)')
		.example('$0 --format=all', 'Generate all format types (requires better-sqlite3)')
		.example('$0 --format=json', 'Generate JSON report only')
		.example('$0 --format=sqlite', 'Generate SQLite database (requires better-sqlite3)')
		.option('format', {
			alias: 'f',
			type: 'string',
			description: 'Output format',
			choices: ['sqlite', 'json', 'csv', 'markdown', 'all'],
			default: 'markdown',
		})
		.option('delay', {
			alias: 'd',
			type: 'number',
			description: 'Delay between API requests in milliseconds',
			default: 2000,
		})
		.option('endpoint', {
			type: 'string',
			description: 'STEX API endpoint URL',
			hidden: true,
		})
		.version(false)
		.group(['format', 'delay'], 'Options:')
		.group(['help'], 'Info:')
		.help();

	await run(argv);
}
