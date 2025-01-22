#!/usr/bin/env node
import fs from 'node:fs';
import { styleText } from 'node:util';
import ora from 'ora';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';

const channels = [
	String(new URL('../dist/channel/', import.meta.url)),
	'https://memo33.github.io/sc4pac/channel/',
	'https://sc4pac.simtropolis.com/',
];

async function buildIndex() {
	let spinner = ora('Building up package index').start();
	let index = {};
	await Promise.all(channels.map(url => buildChannelIndex(url, index)));
	spinner.succeed();
	return index;
}

async function getJSON(url) {
	let parsed = new URL(url);
	if (parsed.protocol === 'file:') {
		let contents = await fs.promises.readFile(parsed);
		return JSON.parse(String(contents));
	} else {
		let res = await fetch(url);
		return await res.json();
	}
}

async function buildChannelIndex(channel, index = {}) {
	let url = new URL('./sc4pac-channel-contents.json', channel);
	let json = await getJSON(url);
	for (let pkg of json.packages) {
		let id = `${pkg.group}:${pkg.name}`;
		let arr = index[id] ??= [];
		arr.push({
			...pkg,
			channel,
		});
		arr.sort((a, b) => {
			return channels.indexOf(a.channel) - channels.indexOf(b.channel);
		});
	}
	return index;
}

async function getInfo(pkg) {
	let { group, name, channel } = pkg;
	let url = new URL(`./metadata/${group}/${name}/latest/pkg.json`, channel);
	return await getJSON(url);
}

async function getDependencies(pkg, index) {
	let def = index[pkg];
	if (!def) throw new Error(`Package ${pkg} not found in any of the channels.`);
	let info = await getInfo(def[0]);
	let html = '<div>';
	let common = new Set(
		info.variants
			.map(variant => variant.dependencies ?? [])
			.flat()
			.map(pkg => `${pkg.group}:${pkg.name}`),
	);
	for (let variant of info.variants) {
		let { dependencies = [] } = variant;
		let subset = dependencies.map(pkg => `${pkg.group}:${pkg.name}`);
		common = common.intersection(new Set(subset));
	}
	html += '<h4>Dependencies:</h4>';
	html += await generateList([...common].sort());
	for (let variant of info.variants) {
		let { dependencies = [] } = variant;
		let subset = new Set(dependencies.map(pkg => `${pkg.group}:${pkg.name}`));
		let unique = subset.difference(common);
		if (unique.size === 0) continue;
		let title = Object.entries(variant.variant)
			.map(arr => arr.join(': '))
			.join('? ');
		if (title === 'nightmode: dark') {
			title = 'Darknite version only';
		}
		html += `<h4>${title}:</h4>`;
		html += await generateList([...unique].sort());
	}
	html += '</div>';
	html += '<div><button>Copy</button></div>';
	html += `<script>document.querySelector('button').addEventListener('click', async () => {
		let html = document.querySelector('div').outerHTML;
		let text = [...document.querySelectorAll('div > ul > li a')].map(a => {
			return '- '+a.textContent.trim();
		}).join('\\n');
		await navigator.clipboard.write([new ClipboardItem({
			'text/html': new Blob([html], { type: 'text/html' }),
			'text/plain': new Blob([text], { type: 'text/plain' }),
		})]);
	});</script>`;
	let url = new URL('../dist/copy.html', import.meta.url);
	await fs.promises.writeFile(url, html);
	console.log(`Written output to ${url}`);
}

async function generateList(dependencies) {
	let html = '<ul>';
	for (let pkg of dependencies) {
		let def = index[pkg];
		let metadata = await getInfo(def[0]);
		let {
			website,
			websites = [website],
		} = metadata.info;
		html += `<li><a href="${websites[0]}">${pkg}</a></li>\n`;
	}
	html += '</ul>';
	return html;
}

const { argv } = yargs(hideBin(process.argv));
if (argv._.length === 0) {
	console.error(styleText('red', 'Please specify a package as argument'));
	process.exit(1);
}
let index = await buildIndex();
await getDependencies(argv._[0], index);
