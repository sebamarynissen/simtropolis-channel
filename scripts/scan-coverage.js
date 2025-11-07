#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { styleText } from 'node:util';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import ora from 'ora';
import { marked } from 'marked';

// Import existing index building functionality
import { buildIndex } from './manual-add.js';

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

		spinner.text = `Fetching batch ${batch} (offset ${offset})...`;

		let retries = 0;
		const maxRetries = 3;

		while (retries <= maxRetries) {
			try {
				const res = await fetch(url);

				if (res.status === 429) {
					// Rate limited - wait longer and retry
					const waitTime = delayMs * (2 ** retries);
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

				// Success, exit retry loop
				break;
			} catch (error) {
				if (retries === maxRetries) {
					spinner.fail('Failed to fetch STEX files');
					throw error;
				}
				retries++;
				const waitTime = delayMs * (2 ** retries);
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
	let simtropolisCount = 0;
	let mainChannelCount = 0;

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
			});
		} else {
			// Package is covered - determine which channel
			if (packageInfo.local) {
				simtropolisCount++;
			} else {
				mainChannelCount++;
			}
		}
	}

	return { missing, simtropolisCount, mainChannelCount };
}

/**
 * Generates statistics from missing packages and all STEX files
 */
function generateStats(missing, stexFiles) {
	const stats = {
		total: missing.length,
		byAuthor: {},
		byCategory: {},
	};

	// Count total files per author and category from all STEX files
	for (const file of stexFiles) {
		const authorName = file.author || 'Unknown';
		const category = file.category || 'Unknown';

		// Initialize author stats if needed
		if (!stats.byAuthor[authorName]) {
			stats.byAuthor[authorName] = {
				missingCount: 0,
				totalFiles: 0,
				authorId: file.uid,
			};
		}
		stats.byAuthor[authorName].totalFiles++;

		// Initialize category stats if needed
		if (!stats.byCategory[category]) {
			stats.byCategory[category] = {
				missingCount: 0,
				totalFiles: 0,
			};
		}
		stats.byCategory[category].totalFiles++;
	}

	// Count missing packages per author and category
	for (const pkg of missing) {
		const authorName = pkg.authorName || 'Unknown';
		const category = pkg.category || 'Unknown';

		// Initialize if not already done (shouldn't happen, but be safe)
		if (!stats.byAuthor[authorName]) {
			stats.byAuthor[authorName] = {
				missingCount: 0,
				totalFiles: 0,
				authorId: pkg.authorId,
			};
		}
		stats.byAuthor[authorName].missingCount++;

		if (!stats.byCategory[category]) {
			stats.byCategory[category] = {
				missingCount: 0,
				totalFiles: 0,
			};
		}
		stats.byCategory[category].missingCount++;
	}

	return stats;
}

/**
 * Escape special characters in text for Markdown tables
 * Escapes: | [ ] ( )
 */
function escapeMarkdown(text) {
	return text
		.replace(/\|/g, '\\|')
		.replace(/\[/g, '\\[')
		.replace(/\]/g, '\\]')
		.replace(/\(/g, '\\(')
		.replace(/\)/g, '\\)');
}

/**
 * Generate GitHub-style anchor from heading text
 * Example: "memo (100 packages)" -> "memo-100-packages"
 */
function generateAnchor(heading) {
	return heading
		.toLowerCase()
		.replace(/\s+/g, '-')
		.replace(/[^a-z0-9-]/g, '');
}

/**
 * Outputs results to Markdown file
 */
function outputToMarkdown(missing, stats, outputDir, simtropolisCount, mainChannelCount) {
	const mdPath = path.join(outputDir, 'coverage.md');

	let md = '# STEX Coverage Report\n\n';
	md += `Generated: ${new Date().toISOString()}\n\n`;

	// Overall stats
	md += '## Summary\n\n';

	// Calculate totals
	const totalFiles = Object.values(stats.byAuthor).reduce((sum, data) => sum + data.totalFiles, 0);
	const packagesInChannels = totalFiles - stats.total;
	const overallCoverage = (packagesInChannels / totalFiles * 100).toFixed(1);
	const totalAuthors = Object.keys(stats.byAuthor).length;
	const authorsWithMissing = Object.values(stats.byAuthor).filter(data => data.missingCount > 0).length;
	const authorsWithFullCoverage = totalAuthors - authorsWithMissing;
	const authorCoverage = (authorsWithFullCoverage / totalAuthors * 100).toFixed(1);

	md += `- **STEX files analyzed**: ${totalFiles}\n`;
	md += `- **Covered packages**: ${packagesInChannels}\n`;
	md += `  - **Simtropolis**: ${simtropolisCount}\n`;
	md += `  - **Main**: ${mainChannelCount}\n`;
	md += `- **Missing packages**: ${stats.total}\n`;
	md += `- **Overall coverage**: ${overallCoverage}%\n`;
	md += `- **Total authors**: ${totalAuthors}\n`;
	md += `- **Author coverage**: ${authorCoverage}% (${authorsWithFullCoverage} of ${totalAuthors} authors with 100% coverage)\n`;
	md += '\n';

	// Table of contents
	md += '## Table of Contents\n\n';
	md += `- [Top Authors with Missing Packages](#${generateAnchor('Top Authors with Missing Packages')})\n`;
	md += `- [Package Summary by Category](#${generateAnchor('Package Summary by Category')})\n`;
	md += `- [Package Summary by Author](#${generateAnchor('Package Summary by Author')})\n`;
	md += `- [Missing Package Details](#${generateAnchor('Missing Package Details')})\n`;
	md += '\n';

	// Top authors
	md += '## Top Authors with Missing Packages\n\n';
	const sortedAuthors = Object.entries(stats.byAuthor)
		.sort(([, a], [, b]) => b.missingCount - a.missingCount)
		.slice(0, 20);

	md += '| Author | Missing | Total | Coverage | Details |\n';
	md += '|--------|---------|-------|----------|----------|\n';
	for (const [author, data] of sortedAuthors) {
		const coveragePercent = ((data.totalFiles - data.missingCount) / data.totalFiles * 100).toFixed(1);
		const profileUrl = `https://community.simtropolis.com/profile/${data.authorId}-${encodeURIComponent(author)}/content/?type=downloads_file`;
		const detailHeading = `${author} (${data.missingCount} packages missing)`;
		const detailAnchor = `#${generateAnchor(detailHeading)}`;
		md += `| [${escapeMarkdown(author)} ↗](<${profileUrl}>) | ${data.missingCount} | ${data.totalFiles} | ${coveragePercent}% | [View details](${detailAnchor}) |\n`;
	}
	md += '\n';

	// Category breakdown
	md += '## Package Summary by Category\n\n';
	const sortedCategories = Object.entries(stats.byCategory)
		.sort(([, a], [, b]) => b.missingCount - a.missingCount);

	md += '| Category | Missing | Total | Coverage |\n';
	md += '|----------|---------|-------|----------|\n';
	for (const [category, data] of sortedCategories) {
		const coveragePercent = ((data.totalFiles - data.missingCount) / data.totalFiles * 100).toFixed(1);
		md += `| ${category} | ${data.missingCount} | ${data.totalFiles} | ${coveragePercent}% |\n`;
	}
	md += '\n';

	// All authors sorted by missing count
	md += '## Package Summary by Author\n\n';
	const allAuthors = Object.entries(stats.byAuthor)
		.map(([author, data]) => {
			const coveragePercent = ((data.totalFiles - data.missingCount) / data.totalFiles * 100);
			return [author, data, coveragePercent];
		})
		// Sort by missing count descending (most missing first)
		.sort(([, a], [, b]) => b.missingCount - a.missingCount);

	md += '| Author | Missing | Total | Coverage | Details |\n';
	md += '|--------|---------|-------|----------|----------|\n';
	for (const [author, data, coveragePercent] of allAuthors) {
		const profileUrl = `https://community.simtropolis.com/profile/${data.authorId}-${encodeURIComponent(author)}/content/?type=downloads_file`;
		const detailHeading = `${author} (${data.missingCount} packages missing)`;
		const detailAnchor = `#${generateAnchor(detailHeading)}`;
		md += `| [${escapeMarkdown(author)} ↗](<${profileUrl}>) | ${data.missingCount} | ${data.totalFiles} | ${coveragePercent.toFixed(1)}% | [View details](${detailAnchor}) |\n`;
	}
	md += '\n';

	// Packages grouped by author
	md += '## Missing Package Details\n\n';
	const byAuthor = {};
	for (const pkg of missing) {
		const authorName = pkg.authorName || 'Unknown';
		if (!byAuthor[authorName]) {
			byAuthor[authorName] = [];
		}
		byAuthor[authorName].push(pkg);
	}

	for (const [author, packages] of Object.entries(byAuthor).sort(([, a], [, b]) => b.length - a.length)) {
		md += `### ${author} (${packages.length} packages missing)\n\n`;
		for (const pkg of packages) {
			const title = pkg.title || 'Unknown';
			const url = pkg.stexUrl || '#';
			const category = pkg.category || 'Unknown';
			md += `- [${title} ↗](${url}) - ${category}\n`;
		}
		md += '\n';
	}

	// Add back-to-top button
	md += '<style>\n';
	md += '  .back-to-top {\n';
	md += '    position: fixed;\n';
	md += '    bottom: 20px;\n';
	md += '    right: 20px;\n';
	md += '    background-color: #0366d6;\n';
	md += '    color: white;\n';
	md += '    padding: 10px 15px;\n';
	md += '    border-radius: 5px;\n';
	md += '    text-decoration: none;\n';
	md += '    font-weight: bold;\n';
	md += '    box-shadow: 0 2px 5px rgba(0,0,0,0.2);\n';
	md += '    z-index: 1000;\n';
	md += '  }\n';
	md += '  .back-to-top:hover {\n';
	md += '    background-color: #0256c4;\n';
	md += '  }\n';
	md += '</style>\n\n';
	md += '<a href="#" class="back-to-top">↑</a>\n';

	fs.writeFileSync(mdPath, md);

	// Also generate HTML version
	const htmlPath = path.join(outputDir, 'coverage.html');
	const htmlContent = marked.parse(md);
	const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>STEX Coverage Report</title>
	<style>
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
			line-height: 1.6;
			max-width: 1200px;
			margin: 0 auto;
			padding: 20px;
			color: #333;
		}
		table {
			border-collapse: collapse;
			width: 100%;
			margin: 20px 0;
		}
		th, td {
			border: 1px solid #ddd;
			padding: 8px 12px;
			text-align: left;
		}
		th {
			background-color: #f6f8fa;
			font-weight: 600;
		}
		tr:hover {
			background-color: #f6f8fa;
		}
		a {
			color: #0969da;
			text-decoration: none;
		}
		a:hover {
			text-decoration: underline;
		}
		h1, h2, h3 {
			margin-top: 24px;
			margin-bottom: 16px;
		}
		h1 {
			border-bottom: 1px solid #eaecef;
			padding-bottom: 10px;
		}
		h2 {
			border-bottom: 1px solid #eaecef;
			padding-bottom: 8px;
		}
		code {
			background-color: #f6f8fa;
			padding: 2px 6px;
			border-radius: 3px;
			font-family: ui-monospace, monospace;
		}
	</style>
</head>
<body>
${htmlContent}
</body>
</html>`;

	fs.writeFileSync(htmlPath, html);

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

	const delay = argv.delay ?? 2000;
	const endpoint = 'https://community.simtropolis.com/stex/files-api.php';

	console.log(styleText('bold', '📊 STEX Coverage Analysis\n'));

	// Step 0: Create output directory (needed for cache file access)
	const outputDir = path.resolve(import.meta.dirname, '../coverage-report');
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	// Step 1: Build package index
	const index = await buildIndex();

	// Step 2: Fetch all STEX files or load from cache
	let stexFiles;
	const cacheFile = path.join(outputDir, 'stex-files-cache.json');

	if (argv['use-cache'] && fs.existsSync(cacheFile)) {
		const spinner = ora('Loading from cache...').start();
		const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
		stexFiles = cached.stexFiles;
		const cacheDate = new Date(cached.cachedAt).toLocaleString();
		spinner.succeed(`Loaded ${styleText('cyan', stexFiles.length.toString())} files from cache (cached: ${cacheDate})`);
	} else {
		stexFiles = await fetchAllStexFiles(apiKey, endpoint, delay);

		// Save to cache if requested
		if (argv.cache) {
			const spinner = ora('Saving to cache...').start();
			fs.writeFileSync(cacheFile, JSON.stringify({
				cachedAt: new Date().toISOString(),
				stexFiles,
			}, null, 2));
			spinner.succeed(`Cache saved to ${styleText('cyan', `"${cacheFile}"`)}`);
		}
	}

	// Step 3: Find missing packages
	const spinner = ora('Analyzing coverage...').start();
	const { missing, simtropolisCount, mainChannelCount } = findMissingPackages(stexFiles, index);
	const stats = generateStats(missing, stexFiles);
	spinner.succeed('Analysis complete');

	// Step 4: Generate output files
	console.log();
	const outputSpinner = ora('Generating reports...').start();

	const mdPath = outputToMarkdown(missing, stats, outputDir, simtropolisCount, mainChannelCount);
	const htmlPath = mdPath.replace(/\.md$/, '.html');

	// Copy markdown to docs for GitHub Pages
	const docsDir = path.resolve(import.meta.dirname, '../docs/coverage-report');
	if (!fs.existsSync(docsDir)) {
		fs.mkdirSync(docsDir, { recursive: true });
	}
	const docsMdPath = path.join(docsDir, 'index.md');
	fs.copyFileSync(mdPath, docsMdPath);

	outputSpinner.succeed('Reports generated');

	// Step 5: Display summary
	console.log();
	console.log(styleText('bold', '📈 Summary\n'));
	console.log(`Total STEX files analyzed: ${styleText('cyan', stexFiles.length.toString())}`);
	console.log(`Missing packages: ${styleText('yellow', stats.total.toString())}`);

	console.log();
	console.log(styleText('bold', '📁 Output Files:\n'));
	console.log(`  Markdown: ${styleText('cyan', `"${mdPath}"`)}`);
	console.log(`  HTML: ${styleText('cyan', `"${htmlPath}"`)}`);
	console.log(`  GitHub Pages: ${styleText('cyan', `"${docsMdPath}"`)}`);

	console.log();
	console.log(styleText('dim', 'Tip: Open the Markdown or HTML report for a human-readable view.'));
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
		.example('$0', 'Generate coverage report (Markdown and HTML)')
		.option('delay', {
			alias: 'd',
			type: 'number',
			description: 'Delay between API requests in milliseconds',
			default: 2000,
		})
		.option('cache', {
			type: 'boolean',
			description: 'Save API results to cache file for future use',
			default: false,
		})
		.option('use-cache', {
			type: 'boolean',
			description: 'Load from cache instead of fetching from API',
			default: false,
		})
		.version(false)
		.group(['delay', 'cache', 'use-cache'], 'Options:')
		.group(['help'], 'Info:')
		.help();

	await run(argv);
}
