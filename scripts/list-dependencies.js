#!/usr/bin/env node
import fs from 'node:fs';
import { styleText } from 'node:util';
import ora from 'ora';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';

class DependencyLister {
	index = {};
	cache = {};
	channels = [
		String(new URL('../dist/channel/', import.meta.url)),
		'https://memo33.github.io/sc4pac/channel/',
		'https://sc4pac.simtropolis.com/',
	];

	// ## buildIndex()
	// Fetches the package index from all the configured channgels.
	async buildIndex() {
		let spinner = ora('Building up package index').start();
		await Promise.all(this.channels.map(url => this.buildChannelIndex(url)));
		spinner.succeed();
	}

	// ## getJSON(url)
	// Gets the contents of a given url (might be a file url) as json.
	async getJSON(url) {
		let parsed = new URL(url);
		if (parsed.protocol === 'file:') {
			let contents = await fs.promises.readFile(parsed);
			return JSON.parse(String(contents));
		} else {
			let res = await fetch(url);
			return await res.json();
		}
	}

	// ## buildChannelIndex(channel)
	// Builds up the package index from a specific channel.
	async buildChannelIndex(channel) {
		const { channels } = this;
		let url = new URL('./sc4pac-channel-contents.json', channel);
		let json = await this.getJSON(url);
		for (let pkg of json.packages) {
			let id = `${pkg.group}:${pkg.name}`;
			let arr = this.index[id] ??= [];
			arr.push({
				...pkg,
				channel,
			});
			arr.sort((a, b) => {
				return channels.indexOf(a.channel) - channels.indexOf(b.channel);
			});
		}
	}

	// ## getInfo(pkg)
	// Fetches the full package info.
	async getInfo(pkg) {
		let { group, name, channel } = pkg;
		let url = new URL(
			`./metadata/${group}/${name}/latest/pkg.json`,
			channel,
		);
		if (url in this.cache) {
			return await this.cache[url];
		} else {
			let promise = this.getJSON(url);
			this.cache[url] = promise;
			return await promise;
		}
	}

	// ## getDependencies(id)
	// Generates a full html document containing all dependencies for the given 
	// pkg.
	async getDependencies(id) {
		await this.buildIndex();
		let packages = this.index[id];
		if (!packages) {
			throw new Error(`Package ${id} not found in any of the channels.`);
		}
		let pkg = await this.getInfo(packages[0]);
		let html = `<style>* {font-family: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";}</style>`;
		html += `<div><h1>${pkg.info.summary}</h1>`;
		if (pkg.info.images) {
			html += `<img src="${pkg.info.images[0]}" style="width: 256px; height: 256px; object-fit: cover">`;
		}
		let common = new Set(
			pkg.variants
				.map(variant => variant.dependencies ?? [])
				.flat()
				.map(pkg => `${pkg.group}:${pkg.name}`),
		);
		for (let variant of pkg.variants) {
			let { dependencies = [] } = variant;
			let subset = dependencies.map(pkg => `${pkg.group}:${pkg.name}`);
			common = common.intersection(new Set(subset));
		}
		html += '<h4>Dependencies:</h4>';
		html += await this.generateList([...common].sort());
		for (let variant of pkg.variants) {
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
			html += await this.generateList([...unique].sort());
		}
		html += '</div>';
		html += '<div><button>Copy dependencies</button></div>';
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

	// # generateList(deps)
	async generateList(deps) {
		let html = '<ul>';
		for (let pkg of deps) {
			let def = this.index[pkg];
			let metadata = await this.getInfo(def[0]);
			let {
				website,
				websites = website ? [website] : [],
			} = metadata.info;
			if (websites.length > 0) {
				html += `<li><a href="${websites[0]}">${pkg}</a></li>\n`;
			} else {
				html += `<li>${pkg}</li>`;
			}
		}
		html += '</ul>';
		return html;
	}

}

const { argv } = yargs(hideBin(process.argv));
if (argv._.length === 0) {
	console.error(styleText('red', 'Please specify a package as argument'));
	process.exit(1);
}

const lister = new DependencyLister();
await lister.getDependencies(argv._[0]);
