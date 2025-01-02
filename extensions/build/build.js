// # build.js
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as esbuild from 'esbuild';
import { Glob } from 'glob';
const require = createRequire(import.meta.url);
const manifest = require('../src/manifest.json');
const srcDir = path.resolve(import.meta.dirname, '../src');
const outDir = path.resolve(import.meta.dirname, '../dist/chrome');

try {
	await fs.promises.rm(outDir, { recursive: true });
} catch {}

let files = [
	'content.js',
	'background.js',
	'copy.js',
];
for (let file of files) {
	await esbuild.build({
		entryPoints: [file],
		absWorkingDir: srcDir,
		bundle: true,
		outfile: path.join(outDir, file),
	});
}

await fs.promises.writeFile(
	path.join(outDir, 'manifest.json'),
	JSON.stringify(manifest, null, 2),
);

let glob = new Glob('*.png', { cwd: srcDir });
for await (let file of glob) {
	await fs.promises.copyFile(
		path.join(srcDir, file),
		path.join(outDir, file),
	);
}
