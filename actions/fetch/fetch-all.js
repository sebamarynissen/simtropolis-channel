// # fetch-all.js
import fs from 'node:fs';
import { parse } from 'yaml';
import Permissions from './permissions.js';
import { urlToFileId } from './util.js';
import apiToMetaData from './api-to-metadata.js';
import completeMetadata from './complete-metadata.js';

// # fetchAll()
// Function that fetches an array of urls from Simtropolis and generates all the 
// default metadata from it.
export default async function fetchAll(urls, opts = {}) {

	// Don't call the api if there are no urls.
	if (urls.length === 0) return [];
	let {
		permissions: permissionsFile = import.meta.resolve('simtropolis-channel/permissions.yaml'),
	} = opts;
	const data = parse(String(await fs.promises.readFile(new URL(permissionsFile))));
	const permissions = new Permissions(data);
	let ids = urls.map(url => {
		return urlToFileId(url);
	});

	let url = new URL('https://community.simtropolis.com/stex/files-api.php');
	url.searchParams.set('key', process.env.STEX_API_KEY);
	url.searchParams.set('id', ids.join(','));
	let res = await fetch(url);
	let json = await res.json();

	let result = [];
	for (let upload of json) {
		let cleaned = permissions.transform(upload);
		let metadata = apiToMetaData(cleaned);
		await completeMetadata(metadata, upload);
		result.push({
			id: upload.id,
			metadata: [metadata.package, ...metadata.assets],
		});
	}
	return result;

}