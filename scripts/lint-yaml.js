// Runs the same sc4pac-actions linter that runs on pull requests against the
// local metadata. The latest lint.py is downloaded from the remote on every run
// (cached copy is used if offline), so it never goes stale.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const url = 'https://raw.githubusercontent.com/memo33/sc4pac-actions/main/src/lint.py';
const cacheDir = path.resolve('.cache');
const script = path.join(cacheDir, 'lint.py');
fs.mkdirSync(cacheDir, { recursive: true });

try {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	fs.writeFileSync(script, await res.text());
} catch (e) {
	if (!fs.existsSync(script)) {
		console.error(`Could not download lint.py: ${e.message}`);
		process.exit(1);
	}
	console.warn(`Could not update lint.py (${e.message}), using cached copy.`);
}

const python = process.platform === 'win32' ? 'python' : 'python3';
const run = (args, opts) => spawnSync(python, args, { stdio: 'inherit', ...opts });

const probe = spawnSync(python, ['-c', 'import yaml, jsonschema'], { stdio: 'ignore' });
if (probe.error) {
	console.error(`Python not found. Install Python 3 and make "${python}" available.`);
	process.exit(1);
}
if (probe.status !== 0) {
	console.log('Installing Python dependencies (PyYAML, jsonschema)...');
	if (run(['-m', 'pip', 'install', '--upgrade', 'PyYAML', 'jsonschema']).status !== 0) {
		process.exit(1);
	}
}

const targets = process.argv.length > 2 ? process.argv.slice(2) : ['src/yaml'];
process.exit(run([script, ...targets]).status ?? 1);
