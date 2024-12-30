// # downloader.js
import path from 'node:path';
import nodeFs from 'node:fs';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import ora from 'ora';
import tmp from 'tmp-promise';
import yauzl from 'yauzl';
import { parseAllDocuments } from 'yaml';
import { kFileInfo } from './symbols.js';
import { SimtropolisError } from './errors.js';
import attempt from './attempt.js';

// # Downloader
// A helper class for downloading urls to a temp folder.
export default class Downloader {
	fs;
	cache;

	// ## constructor(opts = {})
	constructor(opts = {}) {
		let {
			fs = nodeFs,
			cache = '',
		} = opts;
		this.fs = fs;
		this.cache = cache;
		tmp.setGracefulCleanup();
	}

	// ## download(asset)
	// Downloads an asset url to a temp folder and returns some information 
	// about it. Subsequently it can be read with yauzl to find the 
	// metadata.yaml file for example.
	async download(asset) {
		const { fs } = this;
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
	// Process a downloaded asset. It's here that we will look for a 
	// metadata.yaml file in any of the assets and generate DLL checksums 
	// automatically.
	async handleAsset(asset) {
		const spinner = ora(`Downloading ${asset.url}`).start();
		const [error, download] = await attempt(() => this.download(asset));
		if (error) {
			spinner.fail(error.message);
			throw error;
		}
		let assetInfo;
		try {
			assetInfo = await this.handleDownload(download);
			let text = spinner.text;
			if (download.cached) {
				text = `${asset.url} found in cache.`;
			}
			spinner.succeed(text);
		} catch (e) {
			console.error(e);
			spinner.fail();
		} finally {
			await download.cleanup();
		}
		return {
			metadata: null,
			files: [],
			...assetInfo,
		};
	}

	// ## handleDownload(download)
	// Determines what strategy we'll use to look for metadata in this asset.
	async handleDownload(download) {
		switch (download.type) {
			case 'application/zip':
				return await this.handleZip(download);
			default:
				return null;
		}
	}

	// ## handleZip(download)
	async handleZip(download) {
		let metadata;
		let files = [];
		const tasks = [];
		const closed = withResolvers();
		yauzl.open(download.path, { lazyEntries: false }, (err, zipFile) => {
			if (err) return closed.reject(err);
			zipFile.once('end', () => closed.resolve());
			zipFile.on('entry', async entry => {
				if (!entry.fileName.endsWith('/')) {
					files.push(entry.fileName);
				}

				// If we find a metadata.yaml at the root, read it in.
				if (/^metadata\.ya?ml$/i.test(entry.fileName)) {
					let task = readMetadata(zipFile, entry).then(_metadata => {
						metadata = _metadata;
					});
					tasks.push(task);
				}

			});
		});
		await closed.promise;
		await Promise.all(tasks);
		return {
			metadata,
			files,
		};
	}

	// ## getDestination(asset)
	// Returns the destination file we have to write the download to. We use a 
	// temp folder by default, but you might also want to specify the sc4pac 
	// cache dir so that we can directly save it to the cache dir. Saves us a 
	// download later on when we're going to actually install with sc4pac!
	async getDestination(asset) {
		if (this.cache) {
			const { fs } = this;
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
					await nodeFs.promises.unlink(destination);
					await dir.cleanup();
				},
			};
		}
	}

	// # exists(file)
	async exists(file) {
		const [error] = await attempt(() => this.fs.promises.stat(file));
		if (error) {
			if (error.code === 'ENOENT') return false;
			throw error;
		} else {
			return true;
		}
	}

}

// # readMetadata(zipFile, entry)
// Reads in the metadata.yaml file in a download if it's present.
async function readMetadata(zipFile, entry) {

	// Note that it's possible to have more than 1 metadata document, for 
	// example when splitting the package in both resources and and lots. 
	// However, assets should never be specified manually, we parse them from 
	// the STEX, so just ignore them.
	const contents = await read(zipFile, entry);
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

// # read()
async function read(zipFile, entry) {
	const { promise, reject, resolve } = withResolvers();
	zipFile.openReadStream(entry, (err, rs) => {
		if (err) return reject(err);
		resolve(rs);
	});
	let rs = await promise;
	let chunks = [];

	// For some reason we can't use the readable stream with for await, or with 
	// stream/consumers. Weird, so we resort to the good old data approach.
	return new Promise((resolve, reject) => {
		rs.on('data', chunk => {
			chunks.push(chunk);
		});
		rs.on('end', () => {
			resolve(Buffer.concat(chunks));
		});
		rs.on('error', err => reject(err));
	});

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
