// # build.js
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as esbuild from 'esbuild';
import { Glob } from 'glob';
const require = createRequire(import.meta.url);
const manifest = require('../src/manifest.json');
const srcDir = path.resolve(import.meta.dirname, '../src');
const outDir = path.resolve(import.meta.dirname, '../dist');

const files = [
	'background.js',
	'copy.js',
];
const config = {
	chrome: {
		files,
	},
	firefox: {
		files,
		manifest: {
			browser_specific_settings: {
				gecko: {
					id: 'browser-extension@sc4pac-tools',
					strict_min_version: '109.0',
				},
			},
			background: {
				scripts: ['background.js'],
			},
		},
	},
};

try {
	await fs.promises.rm(outDir, { recursive: true });
} catch {}

for (let [browser, options] of Object.entries(config)) {
	let outDir = path.resolve(import.meta.dirname, '../../dist/extensions', browser);
	let { files } = options;
	for (let file of files) {
		await esbuild.build({
			entryPoints: [file],
			absWorkingDir: srcDir,
			bundle: true,
			outfile: path.join(outDir, file),
			minify: true,
		});
	}

	await fs.promises.writeFile(
		path.join(outDir, 'manifest.json'),
		JSON.stringify({
			...manifest,
			...options.manifest,
		}, null, 2),
	);

	let glob = new Glob('*.png', { cwd: srcDir });
	for await (let file of glob) {
		await fs.promises.copyFile(
			path.join(srcDir, file),
			path.join(outDir, file),
		);
	}

}
