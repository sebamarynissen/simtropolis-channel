// # build.js
// Usage: `npm run build:extensions`
// Builds the Chrome + Firefox addons to dist\extensions. To test:
//   - Chrome: open "chrome://extensions", enable Developer mode, choose Load unpacked, and select `dist/extensions/chrome`.
//   - Firefox: open "about:debugging#/runtime/this-firefox", choose Load Temporary Add-on, and select `dist/extensions/firefox/manifest.json`.
// The STEX button script is included in both browser add-ons.
import path from 'node:path';
import fs from 'node:fs';
import cp from 'node:child_process';
import { createRequire } from 'node:module';
import * as esbuild from 'esbuild';
import { Glob } from 'glob';
const require = createRequire(import.meta.url);
const manifest = require('../src/manifest.json');
const srcDir = path.resolve(import.meta.dirname, '../src');
const outDir = path.resolve(import.meta.dirname, '../../dist/extensions');

const files = [
	'background.js',
	'copy.js',
	'stex.js',
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
	let browserOutDir = path.join(outDir, browser);
	let { files } = options;
	for (let file of files) {
		await esbuild.build({
			entryPoints: [file],
			absWorkingDir: srcDir,
			bundle: true,
			outfile: path.join(browserOutDir, file),
			minify: true,
		});
	}

	await fs.promises.writeFile(
		path.join(browserOutDir, 'manifest.json'),
		JSON.stringify({
			...manifest,
			...options.manifest,
		}, null, 2),
	);

	let glob = new Glob('*.png', { cwd: srcDir });
	for await (let file of glob) {
		await fs.promises.copyFile(
			path.join(srcDir, file),
			path.join(browserOutDir, file),
		);
	}

}

// Pack up as .zip.
for (let browser of Object.keys(config)) {
	cp.execSync(`7z a ../${browser}.zip *`, {
		cwd: path.join(outDir, browser),
		stdio: 'inherit',
	});
}
