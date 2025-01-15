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
import { styleText } from 'node:util';

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

const pluginsRoot = process.env.SC4_PLUGINS;
if (fs.existsSync(pluginsRoot)) {
	const dir = await fs.promises.readdir(pluginsRoot);
	if (dir.length !== 0) {
		console.error(styleText('red', 'Your plugins folder is not empty. Please empty it manually and then run this script again.'));
		process.exit(1);
	}
}

// Now generate the sc4pac-plugins.json file.
const cacheRoot = process.env.SC4PAC_CACHE_FOLDER;
const json = {
	config: {
		pluginsRoot,
		cacheRoot,
		tempRoot: `.${path.sep}temp`,
		variant: {},
		channels: [
			'https://memo33.github.io/sc4pac/channel/',
			pathToFileURL(path.resolve(import.meta.dirname, '../dist/channel'))+'/',
		],
	},
	explicit: packages,
};

const dist = path.resolve(import.meta.dirname, '../dist/plugins');
await fs.promises.mkdir(dist, { recursive: true });
await fs.promises.writeFile(
	path.join(dist, 'sc4pac-plugins.json'),
	JSON.stringify(json, null, 2),
);

// Now run sc4pac.
cp.execSync('sc4pac update -y', {
	cwd: dist,
	stdio: 'inherit',
});
