// # check-previous-version.js
import path from 'node:path';
import attempt from './attempt.js';
import { parseAllDocuments } from 'yaml';

// See #42. This function checks for a previous version of the file. If it 
// exists, then it makes sure the name of the package can't be changed 
// unintentionally by keeping the original name.
export default async function checkPreviousVersion(id, metadata, opts) {

	// Check if a previous version of the file exists by file id. We do this by 
	// checking the folder for the author.
	let pkg = metadata.find(pkg => pkg.group);
	let { cwd, srcPath, fs } = opts;
	let author = pkg.group;
	let dir = path.resolve(cwd, srcPath, author);
	const [error, contents] = await attempt(() => fs.promises.readdir(dir));
	if (error) {

		// If the author's directory does not even exist, we're good.
		if (error.code === 'ENOENT') return [];
		else throw error;
	}

	// Look for all files in the authors directory for the file id. If we can't 
	// find it, this is a new file and nothing needs to be done.
	let prev = contents.find(name => name.startsWith(`${id}-`));
	if (!prev) return [];

	// Cool, we now know that a previous version of metadata for this file 
	// upload existed. We'll read it in & parse it so that we can keep the 
	// metadata backwards compatible.
	let filePath = path.join(dir, prev);
	let yaml = await fs.promises.readFile(filePath);
	let packages = parseAllDocuments(String(yaml))
		.map(doc => doc.toJSON())
		.filter(doc => doc.group);

	// Note: there's a possible edge case. If the user manually wrote metadata 
	// for multiple packages, then we can't really know what the "main" package 
	// is. For example, when a package was split up in resources and lots, it 
	// can be hard to determine what the "main" package is. It's kind of an 
	// extreme case though, and we'll encourage users to explicitly specify the 
	// name in those case. We might even enforce this somehow.
	packages.sort((a, b) => {
		return (
			(+!!b.info?.website - +!!a.info?.website) ||
			(+!!b.info?.images - +!!a.info?.images)
		);
	});
	let [main] = packages;
	pkg.group = main.group;
	pkg.name = main.name;

	// Now return that the old file has to be deleted when creating a new PR. 
	// Note that if the name of the file doesn't change, this isn't a problem, 
	// it will be overwritten anyway by the new contents!
	return [`${srcPath}/${author}/${prev}`];

}
