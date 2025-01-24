#!/usr/bin/env node
import { Minimatch } from 'minimatch';
import fs from 'node:fs';
import { styleText } from 'node:util';
import ora from 'ora';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';

const defaultChannel = 'https://memo33.github.io/sc4pac/channel/';

class DependencyLister {
	index = {};
	cache = {};
	defaultOnly = false;
	channels = [
		String(new URL('../dist/channel/', import.meta.url)),
		defaultChannel,
		'https://sc4pac.simtropolis.com/',
	];

	// ## buildIndex()
	// Fetches the package index from all the configured channgels.
	async buildIndex() {
		let spinner = ora('Building up package index');
		spinner.start();
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

	// ## list(patterns)
	async list(patterns, opts = {}) {
		this.defaultOnly = opts.defaultOnly;
		let matchers = patterns.map(pattern => new Minimatch(pattern));
		await this.buildIndex();
		let packages = Object.keys(this.index).filter(pkg => {
			return matchers.some(mm => mm.match(pkg));
		});
		let spinner = ora('Listing dependencies').start();
		let html = `<style>* {font-family: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";}</style>`;
		for (let pkg of packages) {
			spinner.text = `Listing dependencies for ${pkg}`;
			html += await this.getDependencies(pkg);
		}

		// Add the copying code.
		html += `<script>
		let buttons = document.querySelectorAll('button');
		for (let button of buttons) {
			button.addEventListener('click', async () => {
				let deps = button.closest('article').querySelector('aside');
				let html = deps.outerHTML.trim();
				let text = [...deps.querySelectorAll('ul > li a')].map(a => {
					return '- '+a.textContent.trim();
				}).join('\\n');
				await navigator.clipboard.write([new ClipboardItem({
					'text/html': new Blob([html], { type: 'text/html' }),
					'text/plain': new Blob([text], { type: 'text/plain' }),
				})]);
			});
		}
		</script>`;

		let url = new URL('../dist/copy.html', import.meta.url);
		await fs.promises.writeFile(url, html);
		spinner.succeed(`Written output to ${url}`);
	}

	// ## getDependencies(id)
	// Generates the html for a certain package by its id.
	async getDependencies(id) {
		let packages = this.index[id];
		if (!packages) {
			throw new Error(`Package ${id} not found in any of the channels.`);
		}
		let pkg = await this.getInfo(packages[0]);
		let html = '<article>';
		html += `<h1>${pkg.info.summary}</h1>`;
		let {
			website,
			websites = [website],
		} = pkg.info || {};
		if (websites[0]) {
			html += `<div style="padding-bottom: 16px;"><a href="${websites[0]}">${websites[0]}</a></div>`;
		}
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
		html += '<aside>';
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
		html += '</aside>';
		html += '<div><button>Copy dependencies</button></div>';
		html += '</article>';
		return html;
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
			let title = pkg;
			if (this.defaultOnly && def[0].channel !== defaultChannel) {
				title = `${metadata.info.author} ${metadata.info.summary}`;
			}
			if (websites.length > 0) {
				html += `<li><a href="${websites[0]}">${title}</a></li>\n`;
			} else {
				html += `<li>${title}</li>`;
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
await lister.list(argv._, argv);
