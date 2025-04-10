// # downloader.js
import path from 'node:path';
import fs from 'node:fs';
import { PassThrough, Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import crypto, { createHash } from 'node:crypto';
import cp from 'node:child_process';
import { Glob } from 'glob';
import ora from 'ora';
import tmp from 'tmp-promise';
import cd from 'content-disposition';
import { parseAllDocuments } from 'yaml';
import { kExtractedAsset, kFileNames, kFileInfo } from './symbols.js';
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
	// about it.
	async download(asset) {
		const { url } = asset;
		const {
			destination,
			cleanup,
			assetInfoFile,
		} = await this.getDestination(asset);

		// If we're downloading to the sc4pac cache, we won't download again 
		// after it has already been downloaded, unless explicitly specified.
		if (this.cache && await this.exists(destination)) {
			return {
				path: destination,
				assetInfoFile,
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
		if (res.status === 404) {
			throw new Error(`${url} not found`);
		}
		if (res.status >= 400) {
			throw new SimtropolisError(res);
		}
		const hash = createHash('sha256');
		const ws = fs.createWriteStream(destination);
		const dummy = new PassThrough();
		dummy.pipe(ws);
		dummy.pipe(hash);
		Readable.fromWeb(res.body).pipe(dummy);
		await Promise.all([
			finished(ws),
			new Promise(resolve => hash.on('finish', () => resolve())),
		]);
		const sha256 = hash.digest('hex');

		// Now build up the .checked file. We'll store both the filename and the 
		// checksum in it. Note that the checksum needs to be built up in a 
		// streamified way as assets can potentially be huge of course.
		const cdHeader = cd.parse(res.headers.get('Content-Disposition'));
		const { filename = null } = cdHeader.parameters;
		const assetInfo = {
			filename: [filename],
			checksum: { sha256 },
		};
		await fs.promises.writeFile(assetInfoFile, JSON.stringify(assetInfo));
		return {
			path: destination,
			assetInfoFile,
			cleanup,
		};

	}

	// ## handleAsset(asset)
	// Downloads & extracts an asset, and then looks for a metadata.yaml file in 
	// its root. Note that we **will not** clean up the extracted asset 
	// automatically because the `completeMetadata` function might need the 
	// extracted files!
	async handleAsset(asset) {
		let spinner;
		if (process.env.NODE_ENV !== 'test') {
			spinner = ora(`Downloading ${asset.url}`).start();
		}
		const [error, download] = await attempt(() => this.download(asset));
		if (error) {
			spinner?.fail(error.message);
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
			spinner?.succeed();
			asset[kExtractedAsset] = destination.path;
			asset[kFileNames] = info.files;
			return {
				...info,
				async cleanup() {
					await fs.promises.rm(destination.path, { recursive: true });
				},
			};
		} catch {
			spinner?.fail();
		}
	}

	// ## extract(download, destination)
	// Extracts the downloaded asset using the sc4pac extract command.
	async extract(download, destination) {

		// The `sc4pac extract` command needs the filename to properly work, so 
		// we have to read this from the .checked file.
		const assetInfo = JSON.parse(
			String(await fs.promises.readFile(download.assetInfoFile)),
		);

		// Copy the downloaded asset to the temp folder with the correct name.
		const assetDir = path.join(destination, 'asset');
		const assetPath = path.join(assetDir, assetInfo.filename[0]);
		await fs.promises.mkdir(assetDir);
		await fs.promises.copyFile(
			download.path,
			path.join(assetPath),
		);
		const sevenZip = process.env['7Z_EXECUTABLE'] ?? '7z';
		cp.execSync(`"${sevenZip}" x "${assetPath}" -o"${destination}"`);
		await fs.promises.unlink(assetPath);

	}

	// ## inspectAsset(dir)
	// Inspects an extracted asset and extracts information from it, such as all 
	// the files in it, as well as the metadata, if it exists.
	async inspectAsset(dir) {
		let metadata = [];
		let checksums = [];
		let glob = new Glob('**/*', { cwd: dir, nodir: true });
		let files = [];
		for (let file of glob) {
			files.push(file);
			let basename = path.basename(file);
			if (basename === 'metadata.yaml') {
				metadata.push(await readMetadata(path.join(dir, file)));
			} else if (path.extname(file) === '.dll') {

				// If this is a dll, we'll generate the checksum for it as well. 
				// Note that it is purely information for now, it's the 
				// `handleUpload()` function that determines whether we'll 
				// actually use that dll or not!
				let contents = await fs.promises.readFile(path.join(dir, file));
				let sha256 = crypto.createHash('sha256')
					.update(contents)
					.digest('hex');
				checksums.push({
					include: `/${file}`,
					sha256,
				});

			}

		}
		return {
			metadata,
			checksums,
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
				assetInfoFile: path.join(
					dir,
					`.${path.basename(destination)}.checked`,
				),
				cleanup: () => {},
			};
		} else {
			const info = asset[kFileInfo];
			const dir = await tmp.dir();
			const destination = path.join(dir.path, info.name);
			return {
				destination,
				assetInfoFile: path.join(
					dir.path,
					`.${info.name}.checked`,
				),
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
	return docs
		.filter(doc => !doc.empty)
		.map(doc => doc.toJSON())
		.filter(doc => !doc.assetId);

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
