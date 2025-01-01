// # downloader.js
import path from 'node:path';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import ora from 'ora';
import tmp from 'tmp-promise';
import yauzl from 'yauzl';
import { parseAllDocuments } from 'yaml';
import { kExtractedAsset, kFileInfo } from './symbols.js';
import { SimtropolisError } from './errors.js';
import attempt from './attempt.js';

// # Downloader
// A helper class for downloading urls to a temp folder.
export default class Downloader {
	cache;

	// ## constructor(opts = {})
	constructor(opts = {}) {
		let { cache = '' } = opts;
		this.cache = cache;
		tmp.setGracefulCleanup();
	}

	// ## download(asset)
	// Downloads an asset url to a temp folder and returns some information 
	// about it. Subsequently it can be read with yauzl to find the 
	// metadata.yaml file for example.
	async download(asset) {
		const { url } = asset;
		const { destination, cleanup } = await this.getDestination(asset);

		// If we're downloading to the sc4pac cache, we won't download again 
		// after it has already been downloaded, unless explicitly specified.
		if (this.cache && await this.exists(destination)) {
			return {
				path: destination,
				type: 'application/zip',
				cleanup,
				cached: true,
			};
		}

		// If we reach this point, we perform a fresh download.
		const res = await fetch(url, {
			headers: {
				Cookie: process.env.SC4PAC_SIMTROPOLIS_COOKIE,
			},
		});
		if (res.status >= 400) {
			throw new SimtropolisError(res);
		}
		const ws = fs.createWriteStream(destination);
		await finished(Readable.fromWeb(res.body).pipe(ws));
		return {
			path: destination,
			type: res.headers.get('Content-Type') ?? 'application/zip',
			cleanup,
		};

	}

	// ## handleAsset(asset)
	// Downloads & extracts an asset, and then looks for a metadata.yaml file in 
	// its root. Note that we **will not** clean up the extracted asset 
	// automatically because the `completeMetadata` function might need the 
	// extracted files!
	async handleAsset(asset) {
		const spinner = ora(`Downloading ${asset.url}`).start();
		const [error, download] = await attempt(() => this.download(asset));
		if (error) {
			spinner.fail(error.message);
			throw error;
		}
		if (download.cached) {
			spinner.text = `${asset.url} found in cache.`;
		}

		// Now extract the asset to a temp folder and then read in all files, 
		try {
			let destination = await tmp.dir();
			await this.extract(download, destination.path);
			let [info] = await Promise.all([
				this.inspectAsset(destination.path),
				download.cleanup(),
			]);
			spinner.succeed();
			asset[kExtractedAsset] = destination.path;
			return {
				...info,
				async cleanup() {
					await fs.promises.rm(destination.path, { recursive: true });
				},
			};
		} catch {
			spinner.fail();
		}
	}

	// ## extract(download, destination)
	async extract(download, destination) {
		switch (download.type) {
			case 'application/zip':
				return await this.handleZip(download, destination);
			default:
				return null;
		}
	}

	// ## inspectAsset(dir)
	// Inspects an extracted asset and extracts information from it, such as all 
	// the files in it, as well as the metadata, if it exists.
	async inspectAsset(dir) {
		let metadata = null;
		let files = await fs.promises.readdir(dir);
		for (let file of files) {
			if (file === 'metadata.yaml') {
				metadata = await readMetadata(path.join(dir, file));
			}
		}
		return {
			metadata,
			files,
		};
	}

	// ## handleZip(download, destination)
	async handleZip(download, destination) {
		let closed = withResolvers();
		yauzl.open(download.path, { lazyEntries: true }, (err, zipFile) => {
			if (err) return closed.reject(err);
			zipFile.once('end', () => closed.resolve());
			zipFile.on('entry', async entry => {
				if (!entry.fileName.endsWith('/')) {
					let to = path.join(destination, entry.fileName);
					let dir = path.dirname(to);
					await fs.promises.mkdir(dir, { recursive: true });
					let ws = fs.createWriteStream(to);
					let rs = await new Promise((resolve) => {
						zipFile.openReadStream(entry, (err, rs) => {
							if (err) closed.reject(err);
							else resolve(rs);
						});
					});
					rs.pipe(ws);
					await finished(ws);
					zipFile.readEntry();
				}
			});
			zipFile.readEntry();
		});
		await closed.promise;
	}

	// ## getDestination(asset)
	// Returns the destination file we have to write the download to. We use a 
	// temp folder by default, but you might also want to specify the sc4pac 
	// cache dir so that we can directly save it to the cache dir. Saves us a 
	// download later on when we're going to actually install with sc4pac!
	async getDestination(asset) {
		if (this.cache) {
			const { protocol, hostname, pathname, search } = new URL(asset.url);
			const rest = pathname.replace(/^\//, '') + search;
			const parts = [
				protocol.replace(':', ''),
				encodeURIComponent(hostname),
				...rest.split('/').map(part => encodeURIComponent(part)),
			];
			const destination = path.join(this.cache, 'coursier', ...parts);
			const dir = path.dirname(destination);
			await fs.promises.mkdir(dir, { recursive: true });
			return {
				destination,
				cleanup: () => {},
			};
		} else {
			const info = asset[kFileInfo];
			const dir = await tmp.dir();
			const destination = path.join(dir.path, info.name);
			return {
				destination,
				cleanup: async () => {
					await fs.promises.unlink(destination);
					await dir.cleanup();
				},
			};
		}
	}

	// # exists(file)
	async exists(file) {
		const [error] = await attempt(() => fs.promises.stat(file));
		if (error) {
			if (error.code === 'ENOENT') return false;
			throw error;
		} else {
			return true;
		}
	}

}

// # readMetadata(file)
// Reads in the metadata.yaml file in a download if it's present.
async function readMetadata(file) {

	// Note that it's possible to have more than 1 metadata document, for 
	// example when splitting the package in both resources and and lots. 
	// However, assets should never be specified manually, we parse them from 
	// the STEX, so just ignore them.
	const contents = await fs.promises.readFile(file);
	let docs = parseAllDocuments(String(contents));
	let json = docs
		.filter(doc => !doc.empty)
		.map(doc => doc.toJSON())
		.filter(doc => !doc.assetId);
	if (json.length === 0) {
		return true;
	} else if (json.length === 1) {
		return json.at(0);
	} else {
		return json;
	}

}

// # withResolvers()
// Same as Promise.resolvers(), but actions run on Node 20, which doesn't have 
// Promise.withResolvers. We need Node 22 for this.
function withResolvers() {
	let reject, resolve;
	const promise = new Promise((_resolve, _reject) => {
		resolve = _resolve;
		reject = _reject;
	});
	return { promise, resolve, reject };
}
