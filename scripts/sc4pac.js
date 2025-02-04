// # install.js
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { Glob } from 'glob';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import { parseAllDocuments } from 'yaml';
import { Minimatch } from 'minimatch';
import standardDeps from './standard-deps.js';
import standardVariants from './standard-variants.js';

// Parse the regular expressions for the packages
const { argv } = yargs(hideBin(process.argv));
const matchers = argv._.map(pattern => new Minimatch(pattern));

// Loop all packages
const glob = new Glob('**/*.yaml', {
	cwd: path.resolve(import.meta.dirname, '../src'),
	absolute: true,
});
const packages = glob
	.walkSync()
	.map(file => {
		let contents = fs.readFileSync(file);
		let docs = parseAllDocuments(String(contents));
		return docs
			.map(doc => doc.toJSON())
			.filter(doc => !doc.assetId)
			.map(pkg => `${pkg.group}:${pkg.name}`)
			.filter(id => matchers.some(mm => mm.match(id)));
	})
	.flat()
	.sort();

// Always add a bunch of dependencies that come in handy when testing.
packages.push(...standardDeps);

// Now generate the sc4pac-plugins.json file.
const pluginsRoot = path.resolve(import.meta.dirname, '../dist/plugins');
const cacheRoot = process.env.SC4PAC_CACHE_ROOT;
const json = {
	config: {
		pluginsRoot,
		cacheRoot,
		tempRoot: `.${path.sep}temp`,
		variant: {
			...standardVariants,
		},
		channels: [
			'https://memo33.github.io/sc4pac/channel/',
			pathToFileURL(path.resolve(import.meta.dirname, '../dist/channel'))+'/',
		],
	},
	explicit: packages,
};

await fs.promises.mkdir(pluginsRoot, { recursive: true });
await fs.promises.writeFile(
	path.join(pluginsRoot, 'sc4pac-plugins.json'),
	JSON.stringify(json, null, 2),
);

// Now run sc4pac.
cp.execSync('sc4pac update -y', {
	cwd: pluginsRoot,
	stdio: 'inherit',
});
