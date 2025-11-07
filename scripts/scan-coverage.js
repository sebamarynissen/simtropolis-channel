#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { styleText } from 'node:util';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import ora from 'ora';
import { marked } from 'marked';
import dedentLib from 'dedent';

// Configure dedent with default options
const dedent = dedentLib.withOptions({ trimWhitespace: false });

// Import existing index building functionality
import { buildIndex } from './manual-add.js';

// Categories to exclude (Tools, Maps, Region)
const EXCLUDED_CATEGORIES = [115, 116, 117];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
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
 * Sort package-related data by a property in descending order
 * @param {Object} obj - Object with entries to sort (e.g., stats.byAuthor)
 * @param {string} property - Property name to sort by (e.g., 'missingCount')
 * @returns {Array} Sorted array of [key, value] entries
 */
function sortPackagesByProperty(obj, property) {
	return Object.entries(obj)
		.sort(([, a], [, b]) => b[property] - a[property]);
}

/**
 * Generate STEX profile URL for an author
 * @param {number} authorId - Author's STEX ID
 * @param {string} authorName - Author's name
 * @returns {string} STEX profile URL
 */
function generateProfileUrl(authorId, authorName) {
	return `https://community.simtropolis.com/profile/${authorId}-${encodeURIComponent(authorName)}/content/?type=downloads_file`;
}

/**
 * Generate anchor link to author detail section
 * @param {string} author - Author name
 * @param {number} missingCount - Number of missing packages
 * @param {number} totalFiles - Total number of packages
 * @returns {string} Markdown anchor link
 */
function generateDetailAnchor(author, missingCount, totalFiles) {
	const detailHeading = `${author} (${missingCount} of ${totalFiles} packages missing)`;
	return `#${generateAnchor(detailHeading)}`;
}

/**
 * Calculate overall statistics for the coverage report
 * @param {Object} stats - Statistics object from generateStats()
 * @param {number} simtropolisCount - Count from Simtropolis channel
 * @param {number} mainChannelCount - Count from main channel
 * @returns {Object} Calculated statistics
 */
function calculateOverallStats(stats, simtropolisCount, mainChannelCount) {
	const totalFiles = Object.values(stats.byAuthor).reduce((sum, data) => sum + data.totalFiles, 0);
	const packagesInChannels = totalFiles - stats.total;
	const overallCoverage = (packagesInChannels / totalFiles * 100).toFixed(1);
	const totalAuthors = Object.keys(stats.byAuthor).length;
	const authorsWithMissing = Object.values(stats.byAuthor).filter(data => data.missingCount > 0).length;
	const authorsWithFullCoverage = totalAuthors - authorsWithMissing;
	const authorCoverage = (authorsWithFullCoverage / totalAuthors * 100).toFixed(1);

	return {
		totalFiles,
		packagesInChannels,
		overallCoverage,
		totalAuthors,
		authorsWithMissing,
		authorsWithFullCoverage,
		authorCoverage,
	};
}

/**
 * Calculate coverage percentage
 * @param {number} missing - Number of missing packages
 * @param {number} total - Total number of packages
 * @returns {string} Coverage percentage with 1 decimal place
 */
function calculateCoveragePercent(missing, total) {
	return ((total - missing) / total * 100).toFixed(1);
}

/**
 * Calculate coverage level (0-11) from coverage percentage
 * @param {number} coveragePercent - Coverage percentage (0-100)
 * @returns {number} Coverage level (0-11)
 */
function getCoverageLevel(coveragePercent) {
	// No coverage
	if (coveragePercent === 0) return 0;
	// Perfect coverage
	if (coveragePercent === 100) return 11;
	// 1-10 for 1-99%
	return Math.ceil(coveragePercent / 10);
}

/**
 * Format coverage percentage with smart rounding
 * @param {number} coveragePercent - Coverage percentage (0-100)
 * @returns {string} Formatted percentage string
 */
function formatCoveragePercent(coveragePercent) {
	// Show integer for exactly 0% or 100%
	if (coveragePercent === 0 || coveragePercent === 100) {
		return `${Math.round(coveragePercent)}%`;
	}
	// Show decimal for very low (<=1%) or very high (>=99%) coverage
	if (coveragePercent <= 1 || coveragePercent >= 99) {
		return `${coveragePercent.toFixed(1)}%`;
	}
	// Round to integer for everything else
	return `${Math.round(coveragePercent)}%`;
}

// ============================================================================
// DATA PROCESSING
// ============================================================================

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
		// Package is covered - determine which channel
		} else if (packageInfo.local) {
				simtropolisCount++;
		} else {
				mainChannelCount++;
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

// ============================================================================
// REPORT GENERATION & EXECUTION
// ============================================================================

/**
 * Generate summary section with overall statistics
 * @param {Object} stats - Statistics object
 * @param {number} simtropolisCount - Simtropolis channel count
 * @param {number} mainChannelCount - Main channel count
 * @returns {string} Markdown summary section
 */
function generateSummarySection(stats, simtropolisCount, mainChannelCount) {
	const overallStats = calculateOverallStats(stats, simtropolisCount, mainChannelCount);

	return dedent`\
		## Summary

		- **STEX files analyzed**: ${overallStats.totalFiles}
		- **Covered packages**: ${overallStats.packagesInChannels}
		  - **Simtropolis**: ${simtropolisCount}
		  - **Main**: ${mainChannelCount}
		- **Missing packages**: ${stats.total}
		- **Overall coverage**: ${overallStats.overallCoverage}%
		- **Total authors**: ${overallStats.totalAuthors}
		- **Author coverage**: ${overallStats.authorCoverage}% (${overallStats.authorsWithFullCoverage} of ${overallStats.totalAuthors} authors with 100% coverage)

	`;
}

/**
 * Generate table of contents with navigation links
 * @returns {string} Markdown table of contents
 */
function generateTableOfContents() {
	return dedent`\
		## Table of Contents

		- [Top Authors with Missing Packages](#${generateAnchor('Top Authors with Missing Packages')})
		- [Package Summary by Category](#${generateAnchor('Package Summary by Category')})
		- [Package Summary by Author](#${generateAnchor('Package Summary by Author')})
		- [Missing Package Details](#${generateAnchor('Missing Package Details')})

	`;
}

/**
 * Generate table of top authors with missing packages
 * @param {Object} stats - Statistics object
 * @returns {string} Markdown table
 */
function generateTopAuthorsTable(stats) {
	const topAuthors = sortPackagesByProperty(stats.byAuthor, 'missingCount').slice(0, 20);

	let md = '## Top Authors with Missing Packages\n\n';
	md += '| Author | Total | Missing | Coverage | Package Details |\n';
	md += '|--------|-------|---------|----------|-----------------|\n';

	for (const [author, data] of topAuthors) {
		const coveragePercent = calculateCoveragePercent(data.missingCount, data.totalFiles);
		const profileUrl = generateProfileUrl(data.authorId, author);
		const detailAnchor = generateDetailAnchor(author, data.missingCount, data.totalFiles);

		md += `| [${escapeMarkdown(author)} ↗](<${profileUrl}>) | ${data.totalFiles} | ${data.missingCount} | ${coveragePercent}% | [View details](${detailAnchor}) |\n`;
	}
	md += '\n';

	return md;
}

/**
 * Generate category summary table
 * @param {Object} stats - Statistics object
 * @returns {string} Markdown table
 */
function generateCategoryTable(stats) {
	const sortedCategories = Object.entries(stats.byCategory)
		.sort(([categoryA], [categoryB]) => categoryA.localeCompare(categoryB));

	let md = '## Package Summary by Category\n\n';
	md += '| Category | Total | Missing | Coverage |\n';
	md += '|----------|-------|---------|----------|\n';

	for (const [category, data] of sortedCategories) {
		const coveragePercent = calculateCoveragePercent(data.missingCount, data.totalFiles);
		md += `| ${category} | ${data.totalFiles} | ${data.missingCount} | ${coveragePercent}% |\n`;
	}
	md += '\n';

	return md;
}

/**
 * Generate complete author list table
 * @param {Object} stats - Statistics object
 * @returns {string} Markdown table
 */
function generateAllAuthorsTable(stats) {
	const allAuthors = Object.entries(stats.byAuthor)
		.map(([author, data]) => {
			const coveragePercent = ((data.totalFiles - data.missingCount) / data.totalFiles * 100);
			return [author, data, coveragePercent];
		})
		// Sort alphabetically by author name
		.sort(([authorA], [authorB]) => authorA.localeCompare(authorB));

	let md = '## Package Summary by Author\n\n';
	md += '| Author | Total | Missing | Coverage | Package Details |\n';
	md += '|--------|-------|---------|----------|-----------------|\n';

	for (const [author, data, coveragePercent] of allAuthors) {
		const profileUrl = generateProfileUrl(data.authorId, author);
		const detailAnchor = generateDetailAnchor(author, data.missingCount, data.totalFiles);

		md += `| [${escapeMarkdown(author)} ↗](<${profileUrl}>) | ${data.totalFiles} | ${data.missingCount} | ${coveragePercent.toFixed(1)}% | [View details](${detailAnchor}) |\n`;
	}
	md += '\n';

	return md;
}

/**
 * Generate coverage grid section with heading, description, and visualization
 * @param {Object} stats - Statistics object
 * @returns {string} Complete coverage grid section (markdown heading + HTML grid)
 */
function generateCoverageGridSection(stats) {
	// Sort authors alphabetically (case-insensitive)
	const sortedAuthors = Object.keys(stats.byAuthor).sort((a, b) => a.localeCompare(b));

	// Generate grid cells
	const gridCells = sortedAuthors.map(author => {
		const data = stats.byAuthor[author];
		const coveragePercent = parseFloat(calculateCoveragePercent(data.missingCount, data.totalFiles));
		const level = getCoverageLevel(coveragePercent);
		const detailAnchor = generateDetailAnchor(author, data.missingCount, data.totalFiles);
		const coveredPackages = data.totalFiles - data.missingCount;
		const formattedPercent = formatCoveragePercent(coveragePercent);
		const tooltip = `${author} (${coveredPackages}/${data.totalFiles} packages, ${formattedPercent} coverage)`;

		return `<a href="${detailAnchor}" data-level="${level}" data-tooltip="${tooltip}"></a>`;
	}).join('\n    ');

	return dedent`\
		## Coverage

		Each square represents an author. Hover for details. Color intensity indicates coverage percentage.

		<div id="coverage-grid">
		    ${gridCells}
		</div>

	`;
}

/**
 * Generate package details grouped by author (all packages, not just missing)
 * @param {Array} missing - Array of missing package objects
 * @param {Array} stexFiles - All STEX files
 * @param {Object} index - Package index from buildIndex()
 * @returns {string} HTML package listings with checkboxes
 */
function generatePackageDetails(missing, stexFiles, index) {
	// Group all STEX files by author
	const byAuthor = {};

	for (const file of stexFiles) {
		const authorName = file.author || 'Unknown';
		if (!byAuthor[authorName]) {
			byAuthor[authorName] = {
				covered: [],
				missing: [],
			};
		}

		const fileId = file.id.toString();
		const packageInfo = index.stex[fileId];
		const packageData = {
			title: file.title || 'Unknown',
			url: file.fileURL || '#',
			category: file.category || 'Unknown',
		};

		if (packageInfo) {
			byAuthor[authorName].covered.push(packageData);
		} else {
			byAuthor[authorName].missing.push(packageData);
		}
	}

	// Sort authors alphabetically
	const sortedAuthors = Object.entries(byAuthor)
		.sort(([authorA], [authorB]) => authorA.localeCompare(authorB));

	let html = '## Package Details by Author\n\n';

	for (const [author, { covered, missing: missingPkgs }] of sortedAuthors) {
		const totalPkgs = covered.length + missingPkgs.length;
		html += `### ${author} (${missingPkgs.length} of ${totalPkgs} packages missing)\n\n`;
		html += '<ul class="package-list">\n';

		// Show covered packages first
		for (const pkg of covered) {
			html += `<li class="covered"><a href="${pkg.url}">${pkg.title} ↗</a> - ${pkg.category}</li>\n`;
		}

		// Show missing packages
		for (const pkg of missingPkgs) {
			html += `<li class="missing"><a href="${pkg.url}">${pkg.title} ↗</a> - ${pkg.category}</li>\n`;
		}

		html += '</ul>\n\n';
	}

	return html;
}

/**
 * Generate custom CSS styles for the report
 * @returns {string} CSS for coverage grid, checkboxes, and other custom styles
 */
function getCustomStyles() {
	return dedent`\
		/* Coverage Grid Styles */
		#coverage-grid {
			--level-0: hsla(204, 0%, 98%, 1);
			--level-1: hsla(204, 100%, 90%, 1);
			--level-2: hsla(204, 100%, 83%, 1);
			--level-3: hsla(203, 100%, 76%, 1);
			--level-4: hsla(203, 100%, 69%, 1);
			--level-5: hsla(203, 100%, 63%, 1);
			--level-6: hsla(203, 99%, 57%, 1);
			--level-7: hsla(206, 97%, 53%, 1);
			--level-8: hsla(210, 95%, 50%, 1);
			--level-9: hsla(214, 98%, 45%, 1);
			--level-10: hsla(217, 100%, 40%, 1);
			--level-11: hsla(217, 100%, 40%, 1);

			display: grid;
			grid-template-columns: repeat(auto-fit, 15px);
			grid-auto-rows: 1fr;
			gap: 5px;
			max-width: 100%;
			margin: 20px 0;
		}

		#coverage-grid a {
			width: 100%;
			aspect-ratio: 1 / 1;
			border: none;
			border-radius: 2px;
			background-color: #e2e5e9;
			padding: 0;
			position: relative;
			border: 0.5px solid #1f23280d;
			cursor: pointer;
		}

		#coverage-grid a:hover {
			outline: 2px solid #333;
		}

		#coverage-grid [data-level="0"] { background-color: var(--level-0); }
		#coverage-grid [data-level="1"] { background-color: var(--level-1); }
		#coverage-grid [data-level="2"] { background-color: var(--level-2); }
		#coverage-grid [data-level="3"] { background-color: var(--level-3); }
		#coverage-grid [data-level="4"] { background-color: var(--level-4); }
		#coverage-grid [data-level="5"] { background-color: var(--level-5); }
		#coverage-grid [data-level="6"] { background-color: var(--level-6); }
		#coverage-grid [data-level="7"] { background-color: var(--level-7); }
		#coverage-grid [data-level="8"] { background-color: var(--level-8); }
		#coverage-grid [data-level="9"] { background-color: var(--level-9); }
		#coverage-grid [data-level="10"] { background-color: var(--level-10); }
		#coverage-grid [data-level="11"] { background-color: var(--level-11); }

		/* more sensible font sizing */
		:root {
			--pico-form-element-spacing-vertical: 0.35rem;
			--pico-form-element-spacing-horizontal: 0.75rem;
			--pico-font-size: 1rem;
		}

		/* Table striping (from PicoCSS, adapted for all tables) */
		tbody tr:nth-child(odd) td,
		tbody tr:nth-child(odd) th {
			background-color: var(--pico-table-row-stripped-background-color);
		}

		/* Package checklist styles */
		.package-list {
			list-style: none;
			padding-left: 0;
		}

		.package-list li {
			list-style: none;
			padding: 4px 0;
		}

		.package-list li::before {
			content: "";
			width: 20px;
			height: 20px;
			margin-right: 12px;
			flex-shrink: 0;
			border: 2px solid #ddd;
			border-radius: 4px;
			background: white;
			display: inline-block;
			margin-top: 2px;
		}

		.package-list li.covered::before {
			content: "✓";
			background-color: #4CAF50;
			border-color: #4CAF50;
			color: white;
			font-size: 14px;
			font-weight: bold;
			text-align: center;
			line-height: 16px;
		}

		.package-list li.missing::before {
			content: "?";
			background-color: #ddd;
			border-color: #ddd;
			color: white;
			font-size: 14px;
			font-weight: bold;
			text-align: center;
			line-height: 16px;
		}

		/* Heading anchor links with anchorjs font */
		@font-face {
			font-family: "anchorjs-icons";
			src: url(data:n/a;base64,AAEAAAALAIAAAwAwT1MvMg8yG2cAAAE4AAAAYGNtYXDp3gC3AAABpAAAAExnYXNwAAAAEAAAA9wAAAAIZ2x5ZlQCcfwAAAH4AAABCGhlYWQHFvHyAAAAvAAAADZoaGVhBnACFwAAAPQAAAAkaG10eASAADEAAAGYAAAADGxvY2EACACEAAAB8AAAAAhtYXhwAAYAVwAAARgAAAAgbmFtZQGOH9cAAAMAAAAAunBvc3QAAwAAAAADvAAAACAAAQAAAAEAAHzE2p9fDzz1AAkEAAAAAADRecUWAAAAANQA6R8AAAAAAoACwAAAAAgAAgAAAAAAAAABAAADwP/AAAACgAAA/9MCrQABAAAAAAAAAAAAAAAAAAAAAwABAAAAAwBVAAIAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAMCQAGQAAUAAAKZAswAAACPApkCzAAAAesAMwEJAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAQAAg//0DwP/AAEADwABAAAAAAQAAAAAAAAAAAAAAIAAAAAAAAAIAAAACgAAxAAAAAwAAAAMAAAAcAAEAAwAAABwAAwABAAAAHAAEADAAAAAIAAgAAgAAACDpy//9//8AAAAg6cv//f///+EWNwADAAEAAAAAAAAAAAAAAAAACACEAAEAAAAAAAAAAAAAAAAxAAACAAQARAKAAsAAKwBUAAABIiYnJjQ3NzY2MzIWFxYUBwcGIicmNDc3NjQnJiYjIgYHBwYUFxYUBwYGIwciJicmNDc3NjIXFhQHBwYUFxYWMzI2Nzc2NCcmNDc2MhcWFAcHBgYjARQGDAUtLXoWOR8fORYtLTgKGwoKCjgaGg0gEhIgDXoaGgkJBQwHdR85Fi0tOAobCgoKOBoaDSASEiANehoaCQkKGwotLXoWOR8BMwUFLYEuehYXFxYugC44CQkKGwo4GkoaDQ0NDXoaShoKGwoFBe8XFi6ALjgJCQobCjgaShoNDQ0NehpKGgobCgoKLYEuehYXAAAADACWAAEAAAAAAAEACAAAAAEAAAAAAAIAAwAIAAEAAAAAAAMACAAAAAEAAAAAAAQACAAAAAEAAAAAAAUAAQALAAEAAAAAAAYACAAAAAMAAQQJAAEAEAAMAAMAAQQJAAIABgAcAAMAAQQJAAMAEAAMAAMAAQQJAAQAEAAMAAMAAQQJAAUAAgAiAAMAAQQJAAYAEAAMYW5jaG9yanM0MDBAAGEAbgBjAGgAbwByAGoAcwA0ADAAMABAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAH//wAP) format("truetype");
		}

		.anchor-link {
			text-decoration: none;
			opacity: 0;
			transition: opacity 0.2s ease;
			padding-left: 0.375em;
			font-size: 1em;
			-webkit-font-smoothing: antialiased;
		}

		.anchor-link::before {
			content: "\e9cb";
			font-family: "anchorjs-icons";
			font-style: normal;
			font-variant: normal;
			font-weight: normal;
			line-height: 1;
		}

		h1:hover .anchor-link,
		h2:hover .anchor-link,
		h3:hover .anchor-link,
		h4:hover .anchor-link,
		h5:hover .anchor-link,
		h6:hover .anchor-link {
			opacity: 1;
		}

		/* Sortable table styles */

		.sortable thead th {
			position: sticky;
			top: 0;
			z-index: 1;
		}

		.sortable thead th:hover {
			background-color: var(--pico-table-row-stripped-background-color);
		}

		.sortable thead th:not(.no-sort) {
			cursor: pointer;
		}
		.sortable thead th:not(.no-sort)::after,
		.sortable thead th:not(.no-sort)::before {
			transition: color 0.1s ease-in-out;
			font-size: 1.2em;
			color: transparent;
			position: relative;
			top: -0.1em;
		}
		.sortable thead th:not(.no-sort)::after {
			margin-left: 3px;
			content: "↓";
		}
		.sortable.asc thead th:not(.no-sort)::after {
			content: "↑";
		}
		.sortable thead th:not(.no-sort):hover::after {
			color: var(--pico-primary);
		}
		.sortable thead th:not(.no-sort)[aria-sort=descending]::after {
			color: inherit;
			content: "↓";
		}
		.sortable thead th:not(.no-sort)[aria-sort=ascending]::after {
			color: inherit;
			content: "↑";
		}
	`;
}

/**
 * Generate back-to-top button styling and HTML
 * @returns {string} CSS and HTML for back-to-top button
 */
function getBackToTopStyles() {
	return dedent`\
		<style>
		  .back-to-top {
		    position: fixed;
		    bottom: 20px;
		    right: 20px;
		    background-color: #0366d6;
		    color: white;
		    padding: 10px 15px;
		    border-radius: 5px;
		    text-decoration: none;
		    font-weight: bold;
		    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
		    z-index: 1000;
		  }
		  .back-to-top:hover {
		    background-color: #0256c4;
		  }
		</style>

		<a href="#" class="back-to-top">↑</a>
	`;
}

/**
 * Convert markdown content to HTML with styling
 * @param {string} markdownContent - Markdown content to convert
 * @returns {string} Complete HTML document
 */
function outputToHTML(markdownContent) {
	// Configure custom renderer for headings with anchor links
	const renderer = new marked.Renderer();
	renderer.heading = ({ text, depth }) => {
		const id = generateAnchor(text);
		return `<h${depth} id="${id}">${text}<a class="anchor-link" href="#${id}"></a></h${depth}>`;
	};

	// Parse markdown with custom renderer
	let htmlContent = marked.parse(markdownContent, { renderer });

	// Add sortable class to all tables
	htmlContent = htmlContent.replace(/<table>/g, '<table class="sortable asc">');

	return dedent`\
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>STEX Coverage Report</title>
			<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.classless.blue.min.css">
			<style>
			${getCustomStyles()}
			</style>
		</head>
		<body>
		<main>
		${htmlContent}
		</main>
		<script src="https://cdn.jsdelivr.net/gh/tofsjonas/sortable@latest/dist/sortable.auto.min.js"></script>
		</body>
		</html>
	`;
}

/**
 * Outputs results to Markdown file and generates HTML
 */
function outputToMarkdown(missing, stats, outputDir, simtropolisCount, mainChannelCount, stexFiles, index) {
	const mdPath = path.join(outputDir, 'coverage.md');

	// Build markdown report from sections
	let md = '# STEX Coverage Report\n\n';
	md += `Generated: ${new Date().toISOString()}\n\n`;
	md += generateSummarySection(stats, simtropolisCount, mainChannelCount);
	md += generateCoverageGridSection(stats);
	md += generateTableOfContents();
	md += generateTopAuthorsTable(stats);
	md += generateCategoryTable(stats);
	md += generateAllAuthorsTable(stats);
	md += generatePackageDetails(missing, stexFiles, index);
	md += getBackToTopStyles();

	// Write markdown file
	fs.writeFileSync(mdPath, md);

	// Generate and write HTML file
	const htmlPath = path.join(outputDir, 'coverage.html');
	const html = outputToHTML(md);
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

	const mdPath = outputToMarkdown(missing, stats, outputDir, simtropolisCount, mainChannelCount, stexFiles, index);
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
	console.log('Markdown:');
	console.log(`  ${styleText('cyan', mdPath)}`);
	console.log('HTML:');
	console.log(`  ${styleText('cyan', htmlPath)}`);
	console.log('GitHub Pages:');
	console.log(`  ${styleText('cyan', docsMdPath)}`);

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
