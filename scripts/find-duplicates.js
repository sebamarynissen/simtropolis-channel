// # find-duplicates.js
import { Glob } from 'glob';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const glob = new Glob('**/*', {
	cwd: process.env.SC4_PLUGINS,
	nodir: true,
	absolute: true,
});
let files = glob.walkSync();
let map = {};
for (let file of files) {
	let hash = doHash(file);
	map[hash] ??= [];
	map[hash].push(path.relative(process.env.SC4_PLUGINS, file).replaceAll(path.sep, '/'));
}

function doHash(file) {
	let contents = fs.readFileSync(file);
	return crypto.createHash('sha256')
		.update(contents)
		.digest('hex')
		.slice(0, 9);
}

let entries = Object.entries(map)
	.filter(row => row[1].length > 1)
	.filter(row => !row[1][0].includes('075-my-plugins'))
	.filter(row => !row[1][0].includes('150-mods'))
	.sort((a, b) => a[1].length - b[1].length);
console.log(Object.fromEntries(entries));
