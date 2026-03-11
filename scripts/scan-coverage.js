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

// Complete STEX category mapping (IDs 101-122)
// This is kept for reference/documentation purposes.
// The API returns category names in file.category, so we don't need to map them.
// eslint-disable-next-line no-unused-vars
const STEX_CATEGORIES = {
	101: 'Residential',
	102: 'Commercial',
	103: 'Industrial',
	104: 'Agricultural',
	105: 'Building Sets',
	106: 'Civic & Non-RCI',
	107: 'Utilities',
	108: 'Parks & Plazas',
	109: 'Waterfront',
	110: 'Transportation',
	111: 'Automata',
	112: 'Gameplay Mods',
	113: 'Graphical Mods',
	114: 'Cheats',
	115: 'Tools',
	116: 'Maps',
	117: 'Ready Made Regions',
	118: 'Dependencies',
	119: '3ds Models',
	120: 'Obsolete & Legacy',
	121: 'Reference & Info',
	122: 'DLL Mods',
};

// Categories to exclude
const EXCLUDED_CATEGORIES = [
	// Tools
	115,
	// Maps
	116,
	// Ready Made Regions
	117,
	// 3ds Models
	119,
	// Reference & Info
	121,
];

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
 * Escape special characters in text for Markdown
 */
// eslint-disable-next-line no-unused-vars
function escapeMarkdown(text) {
	return text
		// Backslash must be first
		.replace(/\\/g, '\\\\')
		// Code
		.replace(/`/g, '\\`')
		// Bold/italic
		.replace(/\*/g, '\\*')
		// Italic/bold
		.replace(/_/g, '\\_')
		// Strikethrough
		.replace(/~/g, '\\~')
		// Curly braces
		.replace(/\{/g, '\\{')
		.replace(/\}/g, '\\}')
		// Brackets
		.replace(/\[/g, '\\[')
		.replace(/\]/g, '\\]')
		.replace(/\(/g, '\\(')
		.replace(/\)/g, '\\)')
		// Headings
		.replace(/#/g, '\\#')
		// Tables
		.replace(/\|/g, '\\|')
		// HTML/autolinks
		.replace(/</g, '\\<')
		// HTML/blockquotes
		.replace(/>/g, '\\>');
}

/**
 * Escape special characters in text for Markdown
 */
function removePipes(text) {
	return text
		.replace(/\|/g, '\\|');
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
 * @returns {Object} Calculated statistics
 */
function calculateOverallStats(stats) {
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
async function fetchAllStexFiles(apiKey, endpoint) {
	const delayMs = 2000;
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
		url.searchParams.set('extras', 'true');

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

				// Add all files (including excluded categories for complete cache)
				allFiles.push(...json);

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
	let sc4eChannelCount = 0;

	const defaultUrl = 'https://memo33.github.io/sc4pac/channel/';
	const sc4eUrl = 'https://sc4evermore.github.io/sc4pac-channel/channel/';

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
		} else if (typeof packageInfo === 'string') { // Handle legacy string format from stex.js (treat as main channel)
			mainChannelCount++;
		} else if (packageInfo.local) {
			simtropolisCount++;
		} else {
			let hasDefault = false;
			let hasSc4e = false;
			for (const pkg of packageInfo.values()) {
				if (pkg.channel === defaultUrl) hasDefault = true;
				if (pkg.channel === sc4eUrl) hasSc4e = true;
			}
			if (hasDefault) {
				mainChannelCount++;
			} else if (hasSc4e) {
				sc4eChannelCount++;
			}
		}
	}

	return { missing, simtropolisCount, mainChannelCount, sc4eChannelCount };
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
 * @param {number} sc4eChannelCount - SC4Evermore channel count
 * @returns {string} Markdown summary section
 */
function generateSummarySection(stats, simtropolisCount, mainChannelCount, sc4eChannelCount) {
	const overallStats = calculateOverallStats(stats);

	return dedent`\
		## Summary

		- **STEX files analyzed**: ${overallStats.totalFiles}
		- **Covered packages**: ${overallStats.packagesInChannels}
		  - **Simtropolis Channel**: ${simtropolisCount}
		  - **Default Channel**: ${mainChannelCount}
		  - **SC4Evermore Channel**: ${sc4eChannelCount}
		- **Missing packages**: ${stats.total}
		- **Overall coverage**: ${overallStats.overallCoverage}%
		- **Total authors**: ${overallStats.totalAuthors}

	`;
}

/**
 * Generate table of contents with navigation links
 * @returns {string} Markdown table of contents
 */
// eslint-disable-next-line no-unused-vars
function generateTableOfContents() {
	return dedent`\
		## Table of Contents

		- [Top Authors with Missing Packages](#${generateAnchor('Top Authors with Missing Packages')})
		- [Package Summary by Category](#${generateAnchor('Package Summary by Category')})
		- [Package Summary by Author](#${generateAnchor('Package Summary by Author')})
		- [Package Details](#${generateAnchor('Package Details')})
	`;
}

/**
 * Generate navigation bar with page links
 * @param {string} currentPage - Current page identifier ('index', 'top-files', 'authors')
 * @returns {string} HTML navbar with navigation links
 */
function generateNavbar(currentPage = 'index') {
	const pages = [
		{ id: 'index', href: 'index.html', label: 'Summary' },
		{ id: 'top-files', href: 'top-files.html', label: 'Top Files' },
		{ id: 'authors', href: 'authors.html', label: 'By Author' },
	];

	const navItems = pages.map(page => {
		const activeClass = page.id === currentPage ? ' aria-current="page"' : '';
		return `<li><a href="${page.href}"${activeClass}>${page.label}</a></li>`;
	}).join('\n\t\t    ');

	return dedent`\
		<nav>
		  <ul>
		    <li><h1><a href="index.html" style="text-decoration: none; color: inherit;">STEX Coverage Report</a></h1></li>
		  </ul>
		  <ul>
		    ${navItems}
		  </ul>
		</nav>

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
	md += '| Author | Total Packages | Missing Packages | Coverage | Package Details |\n';
	md += '|--------|----------------|------------------|----------|-----------------|\n';

	for (const [author, data] of topAuthors) {
		const coveragePercent = calculateCoveragePercent(data.missingCount, data.totalFiles);
		const profileUrl = generateProfileUrl(data.authorId, author);
		const detailAnchor = generateDetailAnchor(author, data.missingCount, data.totalFiles);

		md += `| [${removePipes(author)} ↗](<${profileUrl}>) | ${data.totalFiles} | ${data.missingCount} | ${coveragePercent} | [View details](${detailAnchor}) |\n`;
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
	md += '| Category | Total Packages | Missing Packages | Coverage |\n';
	md += '|----------|----------------|------------------|----------|\n';

	for (const [category, data] of sortedCategories) {
		const coveragePercent = calculateCoveragePercent(data.missingCount, data.totalFiles);
		md += `| ${category} | ${data.totalFiles} | ${data.missingCount} | ${coveragePercent} |\n`;
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
	md += '| Author | Total Packages | Missing Packages | Coverage | Package Details |\n';
	md += '|--------|----------------|------------------|----------|-----------------|\n';

	for (const [author, data, coveragePercent] of allAuthors) {
		const profileUrl = generateProfileUrl(data.authorId, author);
		const detailAnchor = generateDetailAnchor(author, data.missingCount, data.totalFiles);

		md += `| [${removePipes(author)} ↗](<${profileUrl}>) | ${data.totalFiles} | ${data.missingCount} | ${coveragePercent.toFixed(1)} | [View details](${detailAnchor}) |\n`;
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
		## Coverage by Author

		<div id="coverage-grid">
		    ${gridCells}
		</div>

	`;
}

/**
 * Generate a summary of top 100/1000 files by downloads
 * @param {Array} stexFiles - All STEX files
 * @param {Object} index - Package index from buildIndex()
 */
function generateTopFilesSummary(stexFiles, index) {
	// Sort ALL files by download count (descending)
	const sortedFiles = stexFiles.sort((a, b) => {
		const aDownloads = a.downloads || a.download_count || 0;
		const bDownloads = b.downloads || b.download_count || 0;
		return bDownloads - aDownloads;
	});

	const top100 = sortedFiles.slice(0, 100);
	const top1000 = sortedFiles.slice(0, 1000);

	const top100Covered = top100.filter(file => index.stex[file.id.toString()]).length;
	const top1000Covered = top1000.filter(file => index.stex[file.id.toString()]).length;

	const top100Percent = (top100Covered / top100.length * 100).toFixed(1);
	const top1000Percent = (top1000Covered / top1000.length * 100).toFixed(1);

	let md = '## Top Files by Download Count\n\n';
	md += `<p><strong>Top 100 most downloads:</strong> ${top100Covered} of ${top100.length} (${top100Percent}%)<progress value="${top100Covered}" max="${top100.length}"></progress></p>\n`;
	md += `<p><strong>Top 1000 most downloads:</strong> ${top1000Covered} of ${top1000.length} (${top1000Percent}%)<progress value="${top1000Covered}" max="${top1000.length}"></progress></p>\n`;
	return md;
}


/**
 * Generate a HTMLyou table of the top 1000 files and their coverage status
 * @param {Array} stexFiles - All STEX files
 * @param {Object} index - Package index from buildIndex()
 */
function generateTopFilesTable(stexFiles, index) {
	// Sort ALL files by download count (descending) 
	const sortedFiles = stexFiles.sort((a, b) => {
		const aDownloads = a.downloads || a.download_count || 0;
		const bDownloads = b.downloads || b.download_count || 0;
		return bDownloads - aDownloads;
	});

	const topFiles = sortedFiles.slice(0, 1000);

	let md = '<h2>Top 1000 Files</h2>\n\n';
	md += '<table class="sortable asc top-files-table">\n';
	md += '<thead>\n';
	md += '<tr>\n';
	md += '<th class="no-sort status-col"></th>\n';
	md += '<th>Title</th>\n';
	md += '<th>Author</th>\n';
	md += '<th>Category</th>\n';
	md += '<th>File Upload Date</th>\n';
	md += '<th>Download Count</th>\n';
	md += '</tr>\n';
	md += '</thead>\n';
	md += '<tbody>\n';

	for (const file of topFiles) {
		const title = file.title || 'Unknown';
		const author = file.author || 'Unknown';
		const category = file.category || 'Unknown';
		const submittedDate = (new Date(file.submitted)).toISOString().split('T')[0] || 'Unknown';
		const downloads = file.downloads || file.download_count || 0;
		const url = file.fileURL || '#';
		const fileId = file.id.toString();
		const isCovered = index.stex[fileId];
		const rowClass = isCovered ? 'covered' : 'missing';

		md += `<tr class="${rowClass}">\n`;
		md += `<td class="status-cell ${rowClass}"></td>\n`;
		md += `<td><a href="${url}" target="_blank">${removePipes(title)} ↗</a></td>\n`;
		md += `<td>${removePipes(author)}</td>\n`;
		md += `<td>${category}</td>\n`;
		md += `<td>${submittedDate}</td>\n`;
		md += `<td data-sort="${downloads}">${downloads.toLocaleString()}</td>\n`;
		md += '</tr>\n';
	}

	md += '</tbody>\n';
	md += '</table>\n\n';

	return md;
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

	let html = '## Package Details\n\n';

	for (const [author, { covered, missing: missingPkgs }] of sortedAuthors) {
		const totalPkgs = covered.length + missingPkgs.length;
		html += `### ${author} (${missingPkgs.length} of ${totalPkgs} packages missing)\n\n`;
		html += '<ul class="package-list">\n';

		// Show covered packages first
		for (const pkg of covered) {
			html += `<li class="covered"><a href="${pkg.url}" target="_blank">${pkg.title} ↗</a> - ${pkg.category}</li>\n`;
		}

		// Show missing packages
		for (const pkg of missingPkgs) {
			html += `<li class="missing"><a href="${pkg.url}" target="_blank">${pkg.title} ↗</a> - ${pkg.category}</li>\n`;
		}

		html += '</ul>\n\n';
	}

	return html;
}


/**
 * Generate back-to-top button styling and HTML
 * @returns {string} CSS and HTML for back-to-top button
 */
function getBackToTopStyles() {
	return dedent`\
		<a href="#" class="back-to-top">↑</a>
	`;
}

/**
 * Convert markdown content to HTML with styling
 * @param {string} markdownContent - Markdown content to convert
 * @param {string} pageTitle - Page title
 * @param {string} currentPage - Current page identifier for navigation
 * @returns {string} Complete HTML document
 */
function outputToHTML(markdownContent, pageTitle = 'STEX Coverage Report', currentPage = 'index') {
	// Configure custom renderer for headings with anchor links
	const renderer = new marked.Renderer();
	renderer.heading = ({ text, depth }) => {
		const id = generateAnchor(text);
		return `<h${depth} id="${id}">${text}<a class="anchor-link" href="#${id}"></a></h${depth}>`;
	};

	// Configure custom renderer for links to open external links in new tab
	renderer.link = ({ href, title, text }) => {
		const isExternal = href.startsWith('http://') || href.startsWith('https://');
		const target = isExternal ? ' target="_blank"' : '';
		const titleAttr = title ? ` title="${title}"` : '';
		return `<a href="${href}"${titleAttr}${target}>${text}</a>`;
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
			<title>${pageTitle}</title>
			<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.classless.blue.min.css">
			<link rel="stylesheet" href="coverage.css">
		</head>
		<body>
		${generateNavbar(currentPage)}
		<main>
		${htmlContent}
		</main>
		<script src="https://cdn.jsdelivr.net/gh/tofsjonas/sortable@latest/dist/sortable.auto.min.js"></script>
		</body>
		</html>
	`;
}

/**
 * Generate HTML coverage report
 */
function generateReport(missing, stats, outputDir, simtropolisCount, mainChannelCount, sc4eChannelCount, stexFiles, index) {
	const generatedDate = new Date().toISOString();
	const htmlPaths = [];

	let indexMd = '# STEX Coverage Report\n\n';
	indexMd += `Generated: ${generatedDate}\n\n`;
	indexMd += generateSummarySection(stats, simtropolisCount, mainChannelCount, sc4eChannelCount);
	indexMd += generateCategoryTable(stats);
	indexMd += generateTopAuthorsTable(stats);
	const indexPath = path.join(outputDir, 'index.html');
	const indexHtml = outputToHTML(indexMd, 'STEX Coverage Report - Summary', 'index');
	fs.writeFileSync(indexPath, indexHtml);
	htmlPaths.push(indexPath);

	let topFilesMd = generateTopFilesSummary(stexFiles, index);
	topFilesMd += generateTopFilesTable(stexFiles, index);
	topFilesMd += getBackToTopStyles();
	const topFilesPath = path.join(outputDir, 'top-files.html');
	const topFilesHtml = outputToHTML(topFilesMd, 'Top Files - STEX Coverage Report', 'top-files');
	fs.writeFileSync(topFilesPath, topFilesHtml);
	htmlPaths.push(topFilesPath);

	let authorsMd = generateCoverageGridSection(stats)
	authorsMd += generateAllAuthorsTable(stats);
	authorsMd += generatePackageDetails(missing, stexFiles, index);
	authorsMd += getBackToTopStyles();
	const authorsPath = path.join(outputDir, 'authors.html');
	const authorsHtml = outputToHTML(authorsMd, 'Authors - STEX Coverage Report', 'authors');
	fs.writeFileSync(authorsPath, authorsHtml);
	htmlPaths.push(authorsPath);

	return htmlPaths;
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
		stexFiles = await fetchAllStexFiles(apiKey, endpoint);

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

	// Filter out excluded categories before analysis
	// (Cache contains all files, but we exclude certain categories from the report)
	const totalFiles = stexFiles.length;
	stexFiles = stexFiles.filter(file => !EXCLUDED_CATEGORIES.includes(file.cid));
	const filteredCount = totalFiles - stexFiles.length;
	if (filteredCount > 0) {
		ora().succeed(`Excluded ${styleText('cyan', filteredCount.toString())} files from categories: ${EXCLUDED_CATEGORIES.join(', ')}`);
	}

	// Step 3: Find missing packages
	const spinner = ora('Analyzing coverage...').start();
	const { missing, simtropolisCount, mainChannelCount, sc4eChannelCount } = findMissingPackages(stexFiles, index);
	const stats = generateStats(missing, stexFiles);
	spinner.succeed('Analysis complete');

	// Step 4: Generate output files
	console.log();
	const outputSpinner = ora('Generating reports...').start();

	const htmlPaths = generateReport(missing, stats, outputDir, simtropolisCount, mainChannelCount, sc4eChannelCount, stexFiles, index);

	// Copy HTML and CSS to docs for GitHub Pages
	const docsDir = path.resolve(import.meta.dirname, '../docs/coverage-report');
	if (!fs.existsSync(docsDir)) {
		fs.mkdirSync(docsDir, { recursive: true });
	}

	// Copy all HTML files to docs
	for (const htmlPath of htmlPaths) {
		const fileName = path.basename(htmlPath);
		fs.copyFileSync(htmlPath, path.join(docsDir, fileName));
	}

	// Copy CSS file
	fs.copyFileSync(path.join(outputDir, 'coverage.css'), path.join(docsDir, 'coverage.css'));

	outputSpinner.succeed('Reports generated');

	// Step 5: Display summary
	console.log();
	console.log(styleText('bold', '📈 Summary\n'));
	console.log(`Total STEX files analyzed: ${styleText('cyan', stexFiles.length.toString())}`);
	console.log(`Missing packages: ${styleText('yellow', stats.total.toString())}`);

	console.log();
	console.log(styleText('bold', '📁 Output Files:\n'));
	console.log('HTML:');
	for (const htmlPath of htmlPaths) {
		console.log(`  ${styleText('cyan', htmlPath)}`);
	}
	console.log('GitHub Pages:');
	console.log(`  ${styleText('cyan', path.join(docsDir, 'index.html'))}`);

	console.log();
	console.log(styleText('dim', 'Tip: Open index.html to start browsing the report.'));
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
		.example('$0', 'Generate coverage report')
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
		.group(['cache', 'use-cache'], 'Options:')
		.group(['help'], 'Info:')
		.help();

	await run(argv);
}
