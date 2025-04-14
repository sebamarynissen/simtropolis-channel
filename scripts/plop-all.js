// # plop-all.js
// Helper script for easily plopping all lots of a specified pattern. It allows 
// the user to specify the default test city in an .env variable so that the 
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import cp from 'node:child_process';
import fs from 'node:fs';
import standardDeps from './standard-deps.js';

// command doesn't need to be remembered all the time.
const { argv } = yargs(hideBin(process.argv));
const bbox = process.env.TEST_PLOP_BBOX;
let command = 'sc4 city plop --clear';
if (bbox) {
	command += ` --bbox ${bbox}`;
}
command += ` "${process.env.TEST_PLOP_CITY}"`;
if (argv._.length > 0) {
	for (let pattern of argv._) {
		command += ` ${pattern}`;
	}
} else {

	// If no patterns were specified, then we simply use all plugins that were 
	// installed. Note that is different than using `*:*` because that one will 
	// also plop anything that's present in a dependency!
	const { explicit } = JSON.parse(
		String(fs.readFileSync('./dist/plugins/sc4pac-plugins.json')),
	);
	const plugins = explicit.filter(plugin => {
		return !standardDeps.includes(plugin);
	}).join(' ');
	command += ` ${plugins}`;

}
console.log(`> ${command}`);
cp.execSync(command, {
	stdio: 'inherit',
	env: {
		FORCE_COLOR: true,
	},
});
