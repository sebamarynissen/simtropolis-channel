import path from 'node:path';
import traverse from './traverse-yaml.js';

let install = [];
await traverse('yaml/mattb325/**/*.yaml', (json) => {
	if (json.assetId) return;
	install.push(`mattb325:${json.name}`);
}, {
	cwd: path.resolve(import.meta.dirname, '../../sc4pac/src'),
});

await traverse('yaml/mattb325/*.yaml', (json) => {
	if (json.assetId) return;
	let name = `${json.group}:${json.name}`;
	install.push(name);
});

install.sort();
for (let pkg of install) {
	console.log(`    "${pkg}",`);
}
