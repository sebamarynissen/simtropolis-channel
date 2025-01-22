// # list-dependencies.js
import fs from 'node:fs';
import ora from 'ora';

// const pkg = 'kergelen:parkings-on-slope';
const pkg = 'simmer2:victoria-park-station';

async function buildIndex() {
	let spinner = ora('Building up package index').start();
	let index = {};
	await Promise.all([
		buildChannelIndex('https://memo33.github.io/sc4pac/channel/', index),
		buildChannelIndex('https://sc4pac.simtropolis.com/', index),
	]);
	spinner.succeed();
	return index;
}

async function buildChannelIndex(channel, index = {}) {
	let url = new URL('./sc4pac-channel-contents.json', channel);
	let res = await fetch(url);
	let json = await res.json();
	for (let pkg of json.packages) {
		let id = `${pkg.group}:${pkg.name}`;
		index[id] = {
			...pkg,
			channel,
		};
	}
	return index;
}

async function getInfo(pkg) {
	let { group, name, channel } = pkg;
	let url = new URL(`./metadata/${group}/${name}/latest/pkg.json`, channel);
	let res = await fetch(url);
	return await res.json();
}

async function getDependencies(pkg, index) {
	let def = index[pkg];
	if (!def) throw new Error(`Package ${pkg} not found in any of the channels.`);
	let info = await getInfo(def);
	let dependencies = [...new Set(info.variants
		.map(variant => variant.dependencies)
		.flat()
		.map(pkg => `${pkg.group}:${pkg.name}`)
		.sort(),
	)];
	let html = '<ul>';
	for (let pkg of dependencies) {
		let def = index[pkg];
		let metadata = await getInfo(def);
		let {
			website,
			websites = [website],
		} = metadata.info;
		html += `<li><a href="${websites[0]}">${pkg}</a></li>\n`;
	}
	html += '</ul>';
	html += '<div><button>Copy</button></div>';
	html += `<script>document.querySelector('button').addEventListener('click', async () => {
		let html = document.querySelector('ul').outerHTML;
		let text = [...document.querySelectorAll('ul > li a')].map(a => {
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

let index = await buildIndex();
await getDependencies(pkg, index);
