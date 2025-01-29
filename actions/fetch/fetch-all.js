// # fetch-all.js
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import Permissions from './permissions.js';
import { urlToFileId } from './util.js';
import apiToMetaData from './api-to-metadata.js';
import completeMetadata from './complete-metadata.js';
import Downloader from './downloader.js';
import generateVariants from './generate-variants.js';
import splitPackage from './split-package.js';

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

	let {
		cache = path.resolve(
			process.env.LOCALAPPDATA,
			'io.github.memo33/sc4pac/cache',
		),
	} = opts;
	let downloader = new Downloader({ cache });
	let result = [];
	for (let upload of json) {
		let cleaned = permissions.transform(upload);
		let metadata = apiToMetaData(cleaned, {
			darkniteOnly: opts.darkniteOnly,
		});
		for (let asset of metadata.assets) {
			await downloader.handleAsset(asset);
		}
		await completeMetadata(metadata, upload);
		await generateVariants(metadata);
		let packages = [metadata.package];
		if (opts.split) {
			packages = await splitPackage(metadata);
		}
		result.push({
			id: upload.id,
			metadata: [...packages, ...metadata.assets],
		});
	}
	return result;

}
