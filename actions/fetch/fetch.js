// # fetch.js
import nodeFs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import handleUpload from './handle-upload.js';
import Permissions from './permissions.js';
import { urlToFileId } from './util.js';
import { SimtropolisError } from './errors.js';

// # fetch(opts)
// Main entrypoint for fetching the latest plugins released from the STEX.
export default async function fetchPackage(opts) {
	let {
		id,
		fs = nodeFs,
		cwd = process.env.GITHUB_WORKSPACE ?? process.cwd(),
		after,
		endpoint = 'https://community.simtropolis.com/stex/files-api.php',
		cache = false,
	} = opts;

	// Build up the url. Apparently we have to set mode to updated explicitly, 
	// even though the docs say this is the default.
	const url = new URL(endpoint);
	url.searchParams.set('key', process.env.STEX_API_KEY);
	url.searchParams.set('mode', 'updated');
	url.searchParams.set('desctype', 'html,urls');
	url.searchParams.set('images', 'main');
	url.searchParams.set('metadata', true);

	// If an id is given, then we will not check when we fetched the latest 
	// uploads from the api, but only request the specified file. Useful for 
	// manually retriggering files.
	let storeLastRun = true;
	if (id) {
		if (String(id).startsWith('https://')) {
			id = urlToFileId(id);
		}
		url.searchParams.set('id', id);

		// Now set "after" to somewhere very far in the past so that we don't 
		// accidentally filter out the specific file later on.
		storeLastRun = false;
		after = -Infinity;

	} else if (after) {
		let since = normalizeAfterDate(after);
		url.searchParams.set('since', since);
	} else {

		// If no explicit after date, neither id was set, then there's an error.
		throw new TypeError(
			'Either specify an upload id, or the date since you last fetched the uploads!',
		);

	}

	// Now call the STEX api to find any new files. This is also the date we'll 
	// use to store in the last run timestamp. Note: apparently the STEX api 
	// returns 404 if it couldn't find anything with the given parameters, 
	// meaning that if we use days=2, and nothing new was uploaded in that time 
	// frame, it will return 404! We have to handle this appropriately!
	let nextLastRun = new Date().toISOString();
	let res = await fetch(url);
	if (res.status >= 400 && res.status !== 404) {
		throw new SimtropolisError(res);
	}
	let json = await res.json();
	if (id && (!Array.isArray(json) || json.length === 0)) {
		throw new Error(`File ${id} was not found!`);
	} else if (res.status === 404) {
		json = [];
	}

	// Handle all files one by one to not flood Simtropolis.
	let packages = [];
	let notices = [];
	let warnings = [];
	let data = parse(
		await fs.promises.readFile(path.join(cwd, 'permissions.yaml'))+'',
	);
	let permissions = new Permissions(data);
	let handleOptions = {
		...opts,
		cwd,
		permissions,
		cache,
	};
	for (let upload of json) {

		// Check whether the creator is allowed to publish files on the STEX 
		// channel. We don't create a failing PR in this case, but we do log the 
		// results in the action so that we can inspect on GitHub what happened.
		try {
			permissions.assertUploadAllowed(upload);
		} catch (e) {
			warnings.push(e.message);
			continue;
		}

		// Cool, try to handle the file now. Again, errors will be logged, but 
		// no PR will be created for them.
		let result = await handleUpload(upload, handleOptions);
		if (result) {
			if (result.skipped) {
				if (result.type === 'notice') {
					notices.push(result.reason);
				} else if (result.type === 'warning') {
					notices.push(result.reason);
				}
			} else {
				packages.push({
					...result,
					url: upload.fileURL,
				});
			}
		}

	}

	// Update the timestamp that we last fetched the stex api, but only if not 
	// explicitly requesting a specific file!
	return {
		timestamp: (storeLastRun ? nextLastRun : false),
		packages,
		notices,
		warnings,
	};

}

// # normalizeAfterDate(after)
// Accepts either a date string, a date or a number and normalizes it to a 
// timestamp.
function normalizeAfterDate(after) {
	if (typeof after === 'string') {
		return new Date(after).toISOString();
	} else if (after instanceof Date) {
		return after.toISOString();
	} else {
		return new Date(after).toISOString();
	}
}
