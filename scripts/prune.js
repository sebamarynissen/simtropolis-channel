import { DependencyTracker } from 'sc4/plugins';
import path from 'node:path';
import fs from 'node:fs';
import ora from 'ora';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import traverse from './traverse-yaml.js';
import standardDeps from './standard-deps.js';

const { argv } = yargs(hideBin(process.argv));
const dist = path.resolve(import.meta.dirname, '../dist/plugins');
const packages = JSON.parse(fs.readFileSync(path.join(dist, 'sc4pac-plugins.json')));

// Setup the dependency tracker.
const spinner = ora().start();
const index = {};
const tracker = new DependencyTracker({
	plugins: dist,
});
const results = [];
for (let pkg of packages.explicit) {
	if (standardDeps.includes(pkg)) continue;
	spinner.text = `Tracking dependencies for ${pkg}`;
	let result = await tracker.track(pkg);
	let set = new Set(result.packages);
	set.delete('simfox:day-and-nite-mod');
	result.packages = index[pkg] = [...set];
	results.push(result);
}
spinner.succeed('Tracked all dependencies');
for (let result of results) {
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

		// If SimFox' day and nite mod was tracked as a dependency, this is because 
		// a light cone was referenced with the mod active. We exclude this.
		pkg.dependencies = deps;
		return pkg;

	});
}
