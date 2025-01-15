import { DependencyTracker } from 'sc4/plugins';
import path from 'node:path';
import fs from 'node:fs';
import ora from 'ora';
import traverse from './traverse-yaml.js';

const dist = path.resolve(import.meta.dirname, '../dist/plugins');
const packages = JSON.parse(fs.readFileSync(path.join(dist, 'sc4pac-plugins.json')));

// Setup the dependency tracker.
const spinner = ora().start();
const index = {};
const tracker = new DependencyTracker({});
for (let pkg of packages.explicit) {
	spinner.text = `Tracking dependencies for ${pkg}`;
	let result = await tracker.track(pkg);
	index[pkg] = result.packages;
}
spinner.succeed('Tracked all dependencies');

// Loop all our files again and then update the dependencies.
await traverse('**/*.yaml', function(pkg) {
	if (pkg.assetId) return;
	let id = `${pkg.group}:${pkg.name}`;
	let deps = index[id];
	if (!(deps?.length > 0)) return;

	// If SimFox' day and nite mod was tracked as a dependency, this is because 
	// a light cone was referenced with the mod active. We exclude this.
	let set = new Set(deps);
	set.delete('simfox:day-and-nite-mod');
	pkg.dependencies = [...set].sort();
	return pkg;

});
