import { DependencyTracker } from 'sc4/plugins';
import path from 'node:path';
import fs from 'node:fs';
import ora from 'ora';
import { hideBin } from 'yargs/helpers';
import { Minimatch } from 'minimatch';
import yargs from 'yargs/yargs';
import traverse from './traverse-yaml.js';
import standardDeps from './standard-deps.js';
import { styleText } from 'node:util';

const { argv } = yargs(hideBin(process.argv));
const dist = path.resolve(import.meta.dirname, '../dist/plugins');
const packages = JSON.parse(fs.readFileSync(path.join(dist, 'sc4pac-plugins.json')));

// If glob patterns were specified for what packages we need to prune, filter 
// them out.
let { explicit } = packages;
let matches = argv._.map(pattern => new Minimatch(pattern));
if (matches.length > 0) {
	explicit = explicit.filter(pkg => {
		return matches.some(mm => mm.match(pkg));
	});
}

// Build up an index of the explicit dependencies per package.
const spinner = ora('Building up package index').start();
const dependenciesByPackage = {};
await traverse('**/*.yaml', (pkg) => {
	if (pkg.assetId) return;
	let id = `${pkg.group}:${pkg.name}`;
	dependenciesByPackage[id] = pkg.dependencies;
});

// Setup the dependency tracker.
const index = {};
const tracker = new DependencyTracker({
	plugins: dist,
});
const results = [];
for (let pkg of explicit) {
	if (standardDeps.includes(pkg)) continue;
	spinner.text = `Tracking dependencies for ${pkg}`;
	let dependencies = dependenciesByPackage[pkg] ?? [];
	let result = await tracker.track(pkg, { dependencies });
	let set = new Set(result.packages);
	set.delete('simfox:day-and-nite-mod');
	result.packages = index[pkg] = [...set];
	results.push({
		pkg,
		result,
	});
}
spinner.succeed('Tracked all dependencies');
for (let { pkg, result } of results) {
	console.log(styleText('yellow', pkg));
	result.dump({ format: 'sc4pac' });
}

// If the "--force" flag was specified, then we will actually update the 
// dependencies. It is advised not to do this before you created a commit so 
// that you can see what's changed!
if (argv.force || argv.f) {
	await traverse('**/*.yaml', (pkg) => {
		if (pkg.assetId) return;
		let id = `${pkg.group}:${pkg.name}`;
		let deps = index[id];
		if (!(deps?.length > 0)) return;

		// If SimFox' day and nite mod was tracked as a dependency, this is 
		// because a light cone was referenced with the mod active. We exclude 
		// this.
		pkg.dependencies = deps;
		return pkg;

	});
}
