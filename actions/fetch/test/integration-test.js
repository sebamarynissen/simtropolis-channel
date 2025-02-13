// # integration-test.js
import { expect } from 'chai';
import { Document, parseAllDocuments, parseDocument, stringify } from 'yaml';
import mime from 'mime';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import yazl from 'yazl';
import { Volume } from 'memfs';
import action from '../fetch.js';
import { urlToFileId } from '../util.js';
import * as faker from './faker.js';

// # reject(fn)
async function reject(fn) {
	try {
		let result = fn();
		await result;
	} catch (e) {
		return e;
	}
	throw new Error(`Expected promise to be rejected!`);
}

describe('The fetch action', function() {

	before(function() {
		process.env.NODE_ENV = 'test';

		this.slow(1000);

		this.setup = function(testOptions) {

			const ctx = this;
			const {
				handler = () => void 0,
				permissions = null,
				upload,
				uploads = [upload],
				lastRun,
				now = Date.now(),
			} = testOptions;

			// Setup a virtual file system where the files reside.
			let fs = Volume.fromJSON();
			fs.writeFileSync('/permissions.yaml', permissions ? stringify(permissions) : '');

			// Populate the file where we store when the last file was fetched.
			if (lastRun) {
				fs.writeFileSync('/LAST_RUN', lastRun);
			}

			// We'll mock the global "fetch" method so that we can mock the api 
			// & download responses.
			globalThis.fetch = async function(url, options) {

				// We will check first of all whether this request should be 
				// handled by a custom handler, which allows us to simulate 
				// error codes returned by Simtropolis.
				let req = new Request(url, options);
				let res = handler(req);
				if (res) return res;

				// Parse the url and check what type of request the action is 
				// making. Based on this we'll return a different result.
				let parsedUrl = new URL(url);
				let { pathname, searchParams } = parsedUrl;
				if (pathname.startsWith('/stex/files-api')) {

					// If a days parameter was specified, we have to filter out 
					// the files updated before that threshold.
					let after = -Infinity;
					if (searchParams.has('days')) {
						let days = +searchParams.get('days');
						let ms = days * 24*3600e3;
						after = +now - ms;
					}
					let id = searchParams.has('id') ? +searchParams.get('id') : undefined;
					let filtered = uploads.filter(upload => {
						if (id && upload.id !== id) return false;
						let iso = upload.updated.replace(' ', 'T')+'Z';
						return Date.parse(iso) > after;
					});
					return new Response(JSON.stringify(filtered), {
						headers: {
							'Content-Type': 'application/json',
						},
					});

				}

				// Check if this is a scraping request, or a file download 
				// request.
				if (pathname.startsWith('/files/file/')) {
					let fileId = urlToFileId(parsedUrl);
					let upload = uploads.find(upload => upload.id === fileId);
					if (!upload) {
						return new Response('Not found', { status: 404 });
					}

					// If the search params include the download reference, 
					// handle it.
					if (searchParams.get('do', 'download')) {
						let id = +searchParams.get('r');
						let file = upload.files.find(file => file.id === id);
						if (!file) {
							return new Response('Not found', { status: 404 });
						}

						// If the file is not a .zip file, return with another 
						// mime type.
						let { contents } = file;
						let type = mime.getType(path.extname(file.name));
						if (type !== 'application/zip' || contents instanceof Error) {
							return new Response(contents, {
								headers: {
									'Content-Type': type,
								},
							});
						}

						// Mock a .zip file with the contents as specified in 
						// the upload.
						let zip = ctx.zip(contents);
						return new Response(
							zip,
							{
								headers: {
									'Content-Type': 'application/zip',
								},
							},
						);

					}
				}

				// By default the url is not found, return an error.
				return new Response('Not found', { status: 404 });

			};

			async function run(opts) {
				let { packages, timestamp, notices, warnings } = await action({
					fs,
					cwd: '/',
					...opts,
				});
				return {
					fs,
					read(file) {
						if (!file.startsWith('/')) file = `/${file}`;
						let contents = fs.readFileSync(file).toString();
						return parseAllDocuments(contents).map(doc => doc.toJSON());
					},
					timestamp,
					packages,
					notices,
					warnings,
					result: packages[0],
				};
			};

			return { fs, run };

		};

		// Helper function for generating a zip stream that can be used in a 
		// response.
		this.zip = function(contents) {
			if (Array.isArray(contents)) {
				contents = Object.fromEntries(contents.map(name => [name, '']));
			}
			let zipFile = new yazl.ZipFile();
			for (let [name, raw] of Object.entries(contents)) {
				if (typeof raw === 'object' && !(raw instanceof Uint8Array)) {
					raw = jsonToYaml(raw);
				}
				zipFile.addBuffer(Buffer.from(raw), name);
			}
			zipFile.end();
			return zipFile.outputStream;
		};

		this.date = function(date) {
			return date.replace(' ', 'T')+'Z';
		};

	});

	it('a package with an empty metadata.yaml', async function() {

		let description = '# Description\n\n## Foo\n\nIn markdown. Cool, right?';
		let upload = faker.upload({
			id: 111,
			cid: 101,
			author: 'smf_16',
			title: 'SMF Tower',
			release: '1.0.2',
			descriptor: 'Residential',
			description,
		});
		const { run } = this.setup({ uploads: [upload] });

		let { read, result } = await run({ id: upload.id });
		expect(result.additions).to.eql([
			`src/yaml/smf-16/${upload.id}-smf-tower.yaml`,
		]);
		expect(result.branchId).to.equal('111');

		let metadata = read(result.additions.at(0));
		expect(metadata[0]).to.eql({
			group: 'smf-16',
			name: 'smf-tower',
			version: upload.release,
			subfolder: '200-residential',
			info: {
				summary: upload.title,
				description,
				website: upload.fileURL,
				images: upload.images,
				author: 'smf_16',
			},
			assets: [
				{ assetId: 'smf-16-smf-tower' },
			],
		});
		expect(metadata[1]).to.eql({
			assetId: 'smf-16-smf-tower',
			lastModified: upload.updated.replace(' ', 'T')+'Z',
			version: upload.release,
			url: `${upload.fileURL}/?do=download&r=${upload.files[0].id}`,
		});

	});

	it('a package with a nested metadata.yaml', async function() {

		let upload = faker.upload({
			files: [
				{
					contents: {
						'subfolder/metadata.yaml': {
							name: 'this-name',
						},
					},
				},
			],
		});
		const { run } = this.setup({ upload });
		const { result } = await run({ id: upload.id });
		expect(result.metadata[0].name).to.equal('this-name');

	});

	it('a package with a metadata field in the json', async function() {

		let upload = faker.upload({
			metadata: 'name: this-name',
			files: [
				{ contents: {} },
			],
		});
		const { run } = this.setup({ upload });
		const { result } = await run({ id: upload.id });
		expect(result.metadata[0].name).to.equal('this-name');

	});

	it('a package with custom dependencies', async function() {

		let upload = faker.upload({
			cid: 104,
			author: 'smf_16',
			title: 'SMF Tower',
			files: [
				{
					metadata: {
						info: {
							description: 'Custom description',
						},
						dependencies: [
							'memo:submenus-dll',
							'bsc:mega-props-cp-vol01',
						],
					},
				},
			],
			descriptor: 'Agricultural',
		});
		const { run } = this.setup({ uploads: [upload] });

		let { read } = await run({ id: upload.id });
		let metadata = read(`/src/yaml/smf-16/${upload.id}-smf-tower.yaml`);
		expect(metadata[0]).to.eql({
			group: 'smf-16',
			name: 'smf-tower',
			version: upload.release,
			subfolder: '410-agriculture',
			info: {
				summary: upload.title,
				description: 'Custom description',
				website: upload.fileURL,
				images: upload.images,
				author: 'smf_16',
			},
			dependencies: [
				'memo:submenus-dll',
				'bsc:mega-props-cp-vol01',
			],
			assets: [
				{ assetId: 'smf-16-smf-tower' },
			],
		});
		expect(metadata[1]).to.eql({
			assetId: 'smf-16-smf-tower',
			lastModified: upload.updated.replace(' ', 'T')+'Z',
			version: upload.release,
			url: `${upload.fileURL}/?do=download&r=${upload.files[0].id}`,
		});

	});

	it('a package with MN and DN variants in separate uploads', async function() {

		let upload = faker.upload({
			cid: 102,
			author: 'smf_16',
			title: 'SMF Tower',
			files: [
				'SMF Tower (MN).zip',
				'SMF Tower (DN).zip',
			],
			descriptor: 'Commercial',
		});

		const { run } = this.setup({ uploads: [upload] });

		let { read } = await run({ id: upload.fileURL });
		let metadata = read(`/src/yaml/smf-16/${upload.id}-smf-tower.yaml`);
		expect(metadata[0].variants).to.eql([
			{
				variant: { nightmode: 'standard' },
				assets: [
					{
						assetId: 'smf-16-smf-tower-maxisnite',
					},
				],
			},
			{
				variant: { nightmode: 'dark' },
				dependencies: [
					'simfox:day-and-nite-mod',
				],
				assets: [
					{
						assetId: 'smf-16-smf-tower-darknite',
					},
				],
			},
		]);
		expect(metadata[1]).to.eql({
			assetId: 'smf-16-smf-tower-maxisnite',
			lastModified: this.date(upload.updated),
			version: upload.release,
			url: `${upload.fileURL}/?do=download&r=${upload.files[0].id}`,
		});
		expect(metadata[2]).to.eql({
			assetId: 'smf-16-smf-tower-darknite',
			lastModified: this.date(upload.updated),
			version: upload.release,
			url: `${upload.fileURL}/?do=download&r=${upload.files[1].id}`,
		});

	});

	it('a package with MN and DN variants in the same upload', async function() {

		let upload = faker.upload({
			author: 'smf-16',
			title: 'Building',
			files: [
				{
					name: 'Kia Lexington.zip',
					contents: [
						'metadata.yaml',
						'lot.SC4Lot',
						'building.SC4Desc',
						'Model files (KEEP ONLY ONE)/MaxisNite/model.SC4Model',
						'Model files (KEEP ONLY ONE)/DarkNite/model.SC4Model',
					],
				},
			],
		});
		const { run } = this.setup({ upload });

		let { result } = await run({ id: upload.id });
		expect(result.metadata[0].variants).to.eql([
			{
				variant: { nightmode: 'standard' },
				assets: [
					{
						assetId: 'smf-16-building',
						exclude: ['/DarkNite/'],
					},
				],
			},
			{
				variant: { nightmode: 'dark' },
				dependencies: ['simfox:day-and-nite-mod'],
				assets: [
					{
						assetId: 'smf-16-building',
						exclude: ['/MaxisNite/'],
					},
				],
			},
		]);

	});

	it('a package with MN and DN variants in the same upload (2)', async function() {

		let upload = faker.upload({
			author: 'gutterclub',
			title: 'Hawker Studios',
			files: [
				{
					name: 'Hawker Studios.zip',
					contents: [
						'metadata.yaml',
						'JPS - Hawker Studios DN/model.SC4Model',
						'JPS - Hawker Studios DN/lot.SC4Lot',
						'JPS - Hawker Studios DN/building.SC4Desc',
						'JPS - Hawker Studios MN/model.SC4Model',
						'JPS - Hawker Studios MN/lot.SC4Lot',
						'JPS - Hawker Studios MN/building.SC4Desc',
					],
				},
			],
		});
		const { run } = this.setup({ upload });

		let { result } = await run({ id: upload.id });
		expect(result.metadata[0].variants).to.eql([
			{
				variant: { nightmode: 'standard' },
				assets: [
					{
						assetId: 'gutterclub-hawker-studios',
						exclude: ['/JPS - Hawker Studios DN/'],
					},
				],
			},
			{
				variant: { nightmode: 'dark' },
				dependencies: ['simfox:day-and-nite-mod'],
				assets: [
					{
						assetId: 'gutterclub-hawker-studios',
						exclude: ['/JPS - Hawker Studios MN/'],
					},
				],
			},
		]);

	});

	it('a package with MN and DN variants in the same upload (3)', async function() {

		let upload = faker.upload({
			author: 'mattb325',
			title: 'Standard Federal Savings',
			files: [
				{
					name: 'Standard Federal Savings.zip',
					contents: [
						'metadata.yaml',
						'Standard Federal Savings DARK NITE/model.SC4Model',
						'Standard Federal Savings DARK NITE/lot.SC4Lot',
						'Standard Federal Savings DARK NITE/building.SC4Desc',
						'Standard Federal Savings MAXIS NITE/model.SC4Model',
						'Standard Federal Savings MAXIS NITE/lot.SC4Lot',
						'Standard Federal Savings MAXIS NITE/building.SC4Desc',
					],
				},
			],
		});
		const { run } = this.setup({ upload });

		let { result } = await run({ id: upload.id });
		expect(result.metadata[0].variants).to.eql([
			{
				variant: { nightmode: 'standard' },
				assets: [
					{
						assetId: 'mattb325-standard-federal-savings',
						exclude: ['/Standard Federal Savings DARK NITE/'],
					},
				],
			},
			{
				variant: { nightmode: 'dark' },
				dependencies: ['simfox:day-and-nite-mod'],
				assets: [
					{
						assetId: 'mattb325-standard-federal-savings',
						exclude: ['/Standard Federal Savings MAXIS NITE/'],
					},
				],
			},
		]);

	});

	it('a package with MN and DN variants in the same upload (4)', async function() {

		let upload = faker.upload({
			author: 'mattb325',
			title: 'Standard Federal Savings',
			files: [
				{
					name: 'Standard Federal Savings.zip',
					contents: [
						'metadata.yaml',
						'Standard Federal Savings_DN/model.SC4Model',
						'Standard Federal Savings_DN/lot.SC4Lot',
						'Standard Federal Savings_DN/building.SC4Desc',
						'Standard Federal Savings_MN/model.SC4Model',
						'Standard Federal Savings_MN/lot.SC4Lot',
						'Standard Federal Savings_MN/building.SC4Desc',
					],
				},
			],
		});
		const { run } = this.setup({ upload });

		let { result } = await run({ id: upload.id });
		expect(result.metadata[0].variants).to.eql([
			{
				variant: { nightmode: 'standard' },
				assets: [
					{
						assetId: 'mattb325-standard-federal-savings',
						exclude: ['/Standard Federal Savings_DN/'],
					},
				],
			},
			{
				variant: { nightmode: 'dark' },
				dependencies: ['simfox:day-and-nite-mod'],
				assets: [
					{
						assetId: 'mattb325-standard-federal-savings',
						exclude: ['/Standard Federal Savings_MN/'],
					},
				],
			},
		]);

	});

	it('a package with MN and DN variants in the same upload with nested folders', async function() {

		let upload = faker.upload({
			author: 'smf-16',
			title: 'Building',
			files: [
				{
					name: 'Kia Lexington.zip',
					contents: [
						'metadata.yaml',
						'MaxisNite/models/model.SC4Model',
						'MaxisNite/lots/lot.SC4Lot',
						'DarkNite/models/model.SC4Model',
						'DarkNite/lots/lot.SC4Lot',
					],
				},
			],
		});
		const { run } = this.setup({ upload });

		let { result } = await run({ id: upload.id });
		expect(result.metadata[0].variants).to.eql([
			{
				variant: { nightmode: 'standard' },
				assets: [
					{
						assetId: 'smf-16-building',
						exclude: ['/DarkNite/'],
					},
				],
			},
			{
				variant: { nightmode: 'dark' },
				dependencies: ['simfox:day-and-nite-mod'],
				assets: [
					{
						assetId: 'smf-16-building',
						exclude: ['/MaxisNite/'],
					},
				],
			},
		]);

	});

	it('a package with driveside variants', async function() {

		const { run } = this.setup({
			uploads: [{
				id: 5364,
				uid: 259789,
				cid: 102,
				author: 'smf_16',
				title: 'SMF Tower',
				aliasEntry: 'smf-tower',
				release: '1.0.2',
				submitted: '2024-12-19 04:24:08',
				updated: '2024-12-19 04:24:08',
				fileURL: 'https://community.simtropolis.com/files/file/5364-smf-tower',
				descHTML: '<p>This is the description</p>',
				files: [
					{
						id: 12345,
						name: 'SMF Tower (RHD).zip',
						contents: {
							'metadata.yaml': '',
						},
					},
					{
						id: 12346,
						name: 'SMF Tower (LHD).zip',
						contents: {},
					},
				],
				descriptor: 'Commercial',
			}],
		});

		let { read } = await run({ id: 5364 });
		let metadata = read(`/src/yaml/smf-16/5364-smf-tower.yaml`);
		expect(metadata[0]).to.eql({
			group: 'smf-16',
			name: 'smf-tower',
			version: '1.0.2',
			subfolder: '300-commercial',
			info: {
				summary: 'SMF Tower',
				description: 'This is the description',
				website: 'https://community.simtropolis.com/files/file/5364-smf-tower',
				author: 'smf_16',
			},
			variants: [
				{
					variant: { driveside: 'right' },
					assets: [
						{
							assetId: 'smf-16-smf-tower-rhd',
						},
					],
				},
				{
					variant: { driveside: 'left' },
					assets: [
						{
							assetId: 'smf-16-smf-tower-lhd',
						},
					],
				},
			],
		});
		expect(metadata[1]).to.eql({
			assetId: 'smf-16-smf-tower-rhd',
			lastModified: '2024-12-19T04:24:08Z',
			version: '1.0.2',
			url: 'https://community.simtropolis.com/files/file/5364-smf-tower/?do=download&r=12345',
		});
		expect(metadata[2]).to.eql({
			assetId: 'smf-16-smf-tower-lhd',
			lastModified: '2024-12-19T04:24:08Z',
			version: '1.0.2',
			url: 'https://community.simtropolis.com/files/file/5364-smf-tower/?do=download&r=12346',
		});

	});

	it('a package which interpolates variables', async function() {

		const { run } = this.setup({
			uploads: [{
				id: 5364,
				uid: 259789,
				cid: 101,
				author: 'smf_16',
				title: 'GitHub Tower',
				aliasEntry: 'github-tower',
				release: '1.0.2',
				submitted: '2024-12-19 04:24:08',
				updated: '2024-12-19 04:24:08',
				fileURL: 'https://community.simtropolis.com/files/file/5364-github-tower',
				descHTML: '<p>This is the description</p>',
				files: [
					{
						id: 12345,
						name: 'GitHub Tower.zip',
						contents: {
							'metadata.yaml': {
								group: 'github',
								name: 'smf-${{ package.name }}',
							},
						},
					},
				],
				descriptor: 'Residential',
			}],
		});

		let { read } = await run({ id: 5364 });
		let metadata = read('/src/yaml/smf-16/5364-smf-github-tower.yaml');
		expect(metadata[0]).to.eql({
			group: 'github',
			name: 'smf-github-tower',
			version: '1.0.2',
			subfolder: '200-residential',
			info: {
				summary: 'GitHub Tower',
				description: 'This is the description',
				website: 'https://community.simtropolis.com/files/file/5364-github-tower',
				author: 'smf_16',
			},
			assets: [
				{ assetId: 'smf-16-github-tower' },
			],
		});
		expect(metadata[1]).to.eql({
			assetId: 'smf-16-github-tower',
			lastModified: '2024-12-19T04:24:08Z',
			version: '1.0.2',
			url: 'https://community.simtropolis.com/files/file/5364-github-tower/?do=download&r=12345',
		});

	});

	it('a package that is split in resources and lots', async function() {

		const { run } = this.setup({
			uploads: [{
				id: 2145,
				uid: 145,
				cid: 101,
				author: 'smf_16',
				title: 'ST Residences',
				aliasEntry: 'st-residences',
				release: '2.0.0',
				submitted: '2024-12-19 04:24:08',
				updated: '2024-12-19 04:24:08',
				fileURL: 'https://community.simtropolis.com/files/file/2145-st-residences',
				descHTML: '<p>This is the description</p>',
				images: ['www.image.com', 'www.simtropolis.com'],
				files: [
					{
						id: 12345,
						name: 'ST residences.zip',
						contents: {
							'metadata.yaml': [
								{
									assets: [
										{
											assetId: '${{ assets.0.assetId }}',
											include: ['*.sc4lot'],
										},
									],
								},
								{
									name: '${{ package.name }}-resources',
									subfolder: '100-props-textures',
									info: {
										summary: '${{ package.info.summary }} Resources',
										description: 'Resource package for `pkg=${{ package.group }}:${{ package.name }}`',
									},
									assets: [
										{
											assetId: '${{ assets.0.assetId }}',
											exclude: ['*.sc4lot'],
										},
									],
								},
							],
						},
					},
				],
				descriptor: 'Residential',
			}],
		});

		let { read, result } = await run({ id: 2145 });
		expect(result.additions).to.eql([
			'src/yaml/smf-16/2145-st-residences.yaml',
		]);
		let metadata = read('/src/yaml/smf-16/2145-st-residences.yaml');
		expect(metadata[0]).to.eql({
			group: 'smf-16',
			name: 'st-residences',
			version: '2.0.0',
			subfolder: '200-residential',
			info: {
				summary: 'ST Residences',
				description: 'This is the description',
				author: 'smf_16',
				website: 'https://community.simtropolis.com/files/file/2145-st-residences',
				images: ['www.simtropolis.com', 'www.image.com'],
			},
			assets: [
				{
					assetId: 'smf-16-st-residences',
					include: ['*.sc4lot'],
				},
			],
		});
		expect(metadata[1]).to.eql({
			group: 'smf-16',
			name: 'st-residences-resources',
			version: '2.0.0',
			subfolder: '100-props-textures',
			info: {
				summary: 'ST Residences Resources',
				description: 'Resource package for `pkg=smf-16:st-residences`',
				author: 'smf_16',
			},
			assets: [
				{
					assetId: 'smf-16-st-residences',
					exclude: ['*.sc4lot'],
				},
			],
		});

	});

	it('automatically quotes boolean-like values', async function() {

		let upload = faker.upload({
			files: [
				{
					contents: {
						'metadata.yaml': {
							variants: [
								{ variant: { 'some-feature': 'on' } },
								{ variant: { 'some-feature': 'off' } },
							],
						},
					},
				},
			],
		});
		const { run } = this.setup({ upload });
		let { fs, result } = await run();
		let raw = fs.readFileSync(`/${result.additions[0]}`).toString();
		let doc = parseDocument(raw);
		for (let i = 0; i < 2; i++) {
			let prop = doc.getIn(['variants', i, 'variant', 'some-feature'], true);
			expect(prop.type).to.equal('QUOTE_DOUBLE');
		}
		let desc = doc.getIn(['info'], true).items.find(item => item.key.value === 'description').key;
		expect(desc.type).to.equal('PLAIN');

	});

	it('a package without metadata that results in notices', async function() {

		let upload = faker.upload({
			files: [
				{
					contents: {},
				},
			],
		});
		const { run } = this.setup({ uploads: [upload] });
		const { packages, notices } = await run({ id: upload.id });
		expect(packages).to.have.length(0);
		expect(notices).to.have.length(1);

	});

	it('does not process the package if the metadata field is nullish', async function() {

		let upload = faker.upload({
			metadata: '   ',
			files: [
				{ contents: {} },
			],
		});
		const { run } = this.setup({ upload });
		const { packages, notices } = await run({ id: upload.id });
		expect(packages).to.have.length(0);
		expect(notices).to.have.length(1);

	});

	it('handles uses with periods in their username', async function() {

		let upload = faker.upload({
			author: 'some.user',
		});
		const { run } = this.setup({ uploads: [upload] });
		const { result } = await run({ id: upload.id });
		expect(result.metadata[0].group).to.equal('some-user');

	});

	it('handles titles with exotic structure', async function() {

		let upload = faker.upload({
			title: 'Jast, O\'Conner and Cremin',
		});
		const { run } = this.setup({ uploads: [upload] });
		const { result } = await run({ id: upload.id });
		expect(result.metadata[0].name).to.equal('jast-oconner-and-cremin');

	});

	it('fetches all files from the STEX api since the last fetch date if no id was specified', async function() {

		let uploads = faker.uploads([
			'2024-12-21T14:00:00Z',
			'2024-12-21T11:00:00Z',
			'2024-12-20T12:00:00Z',
			'2024-11-30T17:00:00Z',
		]);
		let after = '2024-12-21T12:00:00Z';
		const { run } = this.setup({ uploads });

		const { packages, timestamp } = await run({ after });
		expect(packages).to.have.length(1);
		expect(packages[0].metadata[0].info.website).to.equal(uploads[0].fileURL);

		expect(Date.parse(timestamp)).to.be.above(Date.parse(after));

	});

	it('fetches all files from the STEX api since the last fetch date from LAST_RUN if no id was specified', async function() {

		let uploads = faker.uploads([
			'2024-12-21T14:00:00Z',
			'2024-12-21T11:00:00Z',
			'2024-12-20T12:00:00Z',
			'2024-11-30T17:00:00Z',
		]);
		let lastRun = '2024-12-21T12:00:00Z';
		const { run } = this.setup({
			uploads,
			lastRun,
		});

		const { packages, timestamp } = await run();
		expect(packages).to.have.length(1);
		expect(packages[0].metadata[0].info.website).to.equal(uploads[0].fileURL);

		expect(Date.parse(timestamp)).to.be.above(Date.parse(lastRun));

	});

	it('does not set the timestamp when fetching a specific package', async function() {

		let uploads = faker.uploads(3);
		const { run } = this.setup({
			uploads,
		});

		const { packages, timestamp } = await run({ id: uploads[1].id });
		expect(timestamp).to.be.false;
		expect(packages).to.have.length(1);

	});

	it('throws when the last run cannot be parsed', async function() {

		let uploads = faker.uploads(3);
		const { run } = this.setup({
			uploads,
			lastRun: 'An invalid date somehow',
		});

		let error, success;
		try {
			await run();
			success = true;
		} catch (e) {
			error = e;
			success = false;
		}
		expect(error).to.be.an.instanceof(Error);
		expect(success).to.be.false;

	});

	it('ignores non-zip archives', async function() {

		let upload = faker.upload({
			files: ['package.rar'],
		});
		const { run } = this.setup({
			uploads: [upload],
		});

		const { packages } = await run({ id: upload.id });
		expect(packages).to.have.length(0);

	});

	it('ignores errors during unzipping', async function() {

		let upload = faker.upload({
			files: [
				{
					name: 'package.zip',
					contents: new Error(),
				},
			],
		});
		const { run } = this.setup({
			uploads: [upload],
		});

		const { packages } = await run({ id: upload.id });
		expect(packages).to.have.length(0);

	});

	it('uses the file descriptor to generate the subfolder', async function() {

		let upload = faker.upload({
			descriptor: 'Civics - Landmarks',
		});
		const { run } = this.setup({ uploads: [upload] });

		const { result } = await run({ id: upload.id });
		expect(result.metadata[0].subfolder).to.equal('360-landmark');

	});

	it('picks the best subfolder in case there are multiple descriptors', async function() {

		let upload = faker.upload({
			descriptor: 'Mod,Services - Education',
		});
		const { run } = this.setup({ uploads: [upload] });

		const { result } = await run({ id: upload.id });
		expect(result.metadata[0].subfolder).to.equal('620-education');

	});

	it('picks a subfolder based on what matches best', async function() {
		let upload = faker.upload({
			descriptor: 'Residential re-lot for real',
		});
		const { run } = this.setup({ uploads: [upload] });
		const { result } = await run({ id: upload.id });
		expect(result.metadata[0].subfolder).to.equal('200-residential');
	});

	it('throws when the STEX api returns 429', async function() {

		const { run } = this.setup({
			handler(req) {
				let url = new URL(req.url);
				if (url.pathname.startsWith('/stex/files-api')) {
					return new Response('Too many requests', { status: 429 });
				}
			},
			uploads: faker.uploads(),
		});
		let e = await reject(() => run());
		expect(e.code).to.equal('simtropolis_error');

	});

	it('throws when Simtropolis is in maintenance 503', async function() {

		const uploads = faker.uploads();
		const { run } = this.setup({
			handler(req) {
				let url = new URL(req.url);
				if (url.pathname.startsWith('/files/file')) {
					return new Response('Maintenance mode', { status: 503 });
				}
			},
			uploads,
		});
		let e = await reject(() => run({ id: uploads[0].id }));
		if (e.code !== 'simtropolis_error') {
			console.log(e);
		}
		expect(e.code).to.equal('simtropolis_error');
		expect(e.status).to.equal(503);

	});

	it('returns warnings when a user is blocked from the channel', async function() {

		const upload = faker.upload({
			uid: 5624,
		});
		const { run } = this.setup({
			uploads: [upload],
			permissions: {
				authors: [
					{
						id: 5624,
						blocked: true,
					},
				],
			},
		});
		const { packages, warnings } = await run({ id: upload.id });
		expect(packages).to.have.length(0);
		expect(warnings).to.have.length(1);

	});

	it('generates DLL checksums automatically', async function() {

		const url = 'https://github.com/dll-creator/my-dll/releases/0.0.1/my-dll.zip';
		const contents = crypto.getRandomValues(new Uint8Array(250));
		const malicious = new Uint8Array(contents);
		malicious[0] += 1;
		const sha256 = crypto.createHash('sha256').update(contents).digest('hex');
		const upload = faker.upload({
			uid: 176422,
			files: [
				{
					name: 'extra-cheats.zip',
					contents: {
						'metadata.yaml': {
							url,
						},
						'extra-cheats.dll': malicious,
					},
				},
			],
		});
		const { run } = this.setup({
			uploads: [upload],
			permissions: {
				authors: [
					{
						id: 176422,
						github: 'dll-creator',
					},
				],
			},
			handler: (req) => {
				let parsed = new URL(req.url);
				if (parsed.hostname === 'github.com') {
					return new Response(
						this.zip({
							'extra-cheats.dll': contents,
						}),
						{
							headers: {
								'Content-Type': 'application/zip',
							},
						},
					);
				}
			},
		});
		const { result } = await run({ id: upload.id });
		expect(result.errors).to.be.undefined;
		let [asset] = result.metadata.slice(1);
		expect(asset.url).to.equal(url);
		expect(asset.nonPersistentUrl).to.include('simtropolis.com');
		expect(asset.withChecksum).to.eql([{
			include: '/extra-cheats.dll',
			sha256,
		}]);

	});

	it('generates an error if the user has not specified an external url for dlls', async function() {

		const contents = crypto.getRandomValues(new Uint8Array(250));
		const upload = faker.upload({
			files: [
				{
					name: 'extra-cheats.zip',
					contents: {
						'metadata.yaml': '',
						'extra-cheats.dll': contents,
					},
				},
			],
		});
		const { run } = this.setup({
			uploads: [upload],
		});
		const { result } = await run({ id: upload.id });
		expect(result.errors).to.have.length(1);

	});

	it('generates an error if the GitHub url does not match the user\'s GitHub name', async function() {

		const url = 'https://github.com/dll-creator/my-dll/releases/0.0.1/my-dll.zip';
		const contents = crypto.getRandomValues(new Uint8Array(250));
		const upload = faker.upload({
			files: [
				{
					name: 'extra-cheats.zip',
					contents: {
						'metadata.yaml': {
							url,
						},
						'extra-cheats.dll': contents,
					},
				},
			],
		});
		const { run } = this.setup({
			uploads: [upload],
			handler: (req) => {
				if (!new URL(req.url).hostname.includes('github.com')) return;
				return new Response(
					this.zip({
						'extra-cheats.dll': contents,
					}),
					{
						headers: {
							'Content-Type': 'application/zip',
						},
					},
				);
			},
		});
		const { result } = await run({ id: upload.id });
		expect(result.errors).to.have.length(1);

	});

	it('sends the Simtropolis cookie when downloading', async function() {

		process.env.SC4PAC_SIMTROPOLIS_COOKIE = 'cookie';

		const upload = faker.upload({});
		const { run } = this.setup({
			uploads: [upload],
			handler(req) {
				let url = new URL(req.url);
				if (url.searchParams.get('do') === 'download') {
					let cookie = req.headers.get('cookie');
					expect(cookie).to.equal('cookie');
				}
			},
		});
		await run({ id: upload.id });

	});

	it('does not throw when the STEX api returns 404', async function() {

		const { run } = this.setup({
			handler() {
				return new Response(JSON.stringify({
					message: 'No STEX files were found for the specified query',
					code: '404',
				}), { status: 404 });
			},
		});
		let result = await run({});
		expect(result.packages).to.eql([]);
		expect(result.timestamp).to.be.ok;

	});

	it('includes an error in the result when the user is not allowed to upload under that group', async function() {

		const upload = faker.upload({
			author: 'sfbt',
			files: [
				{
					contents: {
						'metadata.yaml': {
							group: 'nybt',
						},
					},
				},
			],
		});
		const { run } = this.setup({
			upload,
		});
		let { result } = await run();
		expect(result.errors).to.have.length(1);

	});

	it('skips tools', async function() {

		const upload = faker.upload({
			cid: 115,
			category: 'Tools',
		});
		const { run } = this.setup({ uploads: [upload] });
		let { packages, notices } = await run({ id: upload.id });
		expect(packages).to.have.length(0);
		expect(notices).to.have.length(1);

	});

	it('skips maps', async function() {

		const upload = faker.upload({
			cid: 116,
			category: 'Maps',
		});
		const { run } = this.setup({ uploads: [upload] });
		let { packages, notices } = await run({ id: upload.id });
		expect(packages).to.have.length(0);
		expect(notices).to.have.length(1);

	});

	it('skips regions', async function() {

		const upload = faker.upload({
			cid: 117,
			category: 'Region',
		});
		const { run } = this.setup({ uploads: [upload] });
		let { packages, notices } = await run({ id: upload.id });
		expect(packages).to.have.length(0);
		expect(notices).to.have.length(1);

	});

	it('does not change the name of a package if it existed before (#42)', async function() {

		const upload = faker.upload({
			id: 42592,
			uid: 5642,
			author: 'smf_16',
			title: 'New Title',
		});
		const { fs, run } = this.setup({
			uploads: [upload],
		});
		let existing = [
			{
				group: 'smf-16',
				name: 'old-title',
				version: '1.0.0',
			},
			{
				assetId: 'smf-16-old-title',
				url: 'https://www.old-url.com',
			},
		];
		let src = existing.map(js => stringify(js)).join('\n---\n');
		await fs.promises.mkdir('/src/yaml/smf-16', { recursive: true });
		fs.writeFileSync('/src/yaml/smf-16/42592-old-title.yaml', src);

		let { read, result } = await run({ id: upload.id });
		expect(result.fileId).to.equal('42592');
		let metadata = await read('src/yaml/smf-16/42592-new-title.yaml');
		expect(metadata[0].group).to.equal('smf-16');
		expect(metadata[0].name).to.equal('old-title');

	});

	it('changes the filename of an uploaded package with custom metadata without a name (#42)', async function() {

		const upload = faker.upload({
			id: 42592,
			uid: 5642,
			author: 'smf_16',
			title: 'New Title',
			files: [
				{
					contents: {
						'metadata.yaml': {
							info: {
								description: 'Blablabla',
							},
						},
					},
				},
			],
		});
		const { fs, run } = this.setup({
			uploads: [upload],
		});
		let existing = [
			{
				group: 'smf-16',
				name: 'old-title',
				version: '1.0.0',
			},
			{
				assetId: 'smf-16-old-title',
				url: 'https://www.old-url.com',
			},
		];
		let src = existing.map(js => stringify(js)).join('\n---\n');
		await fs.promises.mkdir('/src/yaml/smf-16', { recursive: true });
		fs.writeFileSync('/src/yaml/smf-16/42592-old-title.yaml', src);

		let { read, result } = await run({ id: upload.id });
		expect(result.fileId).to.equal('42592');
		let metadata = await read('/src/yaml/smf-16/42592-new-title.yaml');
		expect(metadata[0].group).to.equal('smf-16');
		expect(metadata[0].name).to.equal('old-title');

	});

	it('changes the filename of an uploaded package with custom metadata with a name (#42)', async function() {

		const upload = faker.upload({
			id: 42593,
			uid: 5642,
			author: 'smf_16',
			title: 'New Title',
			files: [
				{
					contents: {
						'metadata.yaml': {
							name: 'custom-new-title',
							info: {
								description: 'Blablabla',
							},
						},
					},
				},
			],
		});
		const { fs, run } = this.setup({
			uploads: [upload],
		});
		let existing = [
			{
				group: 'smf-16',
				name: 'old-title',
				version: '1.0.0',
			},
			{
				assetId: 'smf-16-old-title',
				url: 'https://www.old-url.com',
			},
		];
		let src = existing.map(js => stringify(js)).join('\n---\n');
		await fs.promises.mkdir('/src/yaml/smf-16', { recursive: true });
		fs.writeFileSync('/src/yaml/smf-16/42592-old-title.yaml', src);

		let { read, result } = await run({ id: upload.id });
		expect(result.fileId).to.equal('42593');
		let metadata = await read('/src/yaml/smf-16/42593-custom-new-title.yaml');
		expect(metadata[0].group).to.equal('smf-16');
		expect(metadata[0].name).to.equal('custom-new-title');

	});

	it('strips known prefixes from the upload title', async function() {

		const upload = faker.upload({
			uid: 444001,
			author: 'Simmer2',
			title: 'SM2 Some package',
		});
		const { run } = this.setup({
			uploads: [upload],
			permissions: {
				authors: [{
					name: 'Simmer2',
					id: 444001,
					prefixes: [
						'sm2',
					],
				}],
			},
		});
		const { result } = await run({ id: upload.id });
		expect(result.metadata[0].group).to.equal('simmer2');
		expect(result.metadata[0].name).to.equal('some-package');
		expect(result.metadata[0].info.summary).to.equal('Some package');

	});

	it('strips known prefixes with hyphens from the upload title', async function() {

		const upload = faker.upload({
			uid: 444001,
			author: 'Barroco Hispano',
			title: 'AGC - Some package DLC',
		});
		const { run } = this.setup({
			uploads: [upload],
			permissions: {
				authors: [{
					name: 'Barroco Hispano',
					alias: 'agc',
					id: 444001,
					prefixes: [
						'agc',
					],
				}],
			},
		});
		const { result } = await run({ id: upload.id });
		expect(result.metadata[0].group).to.equal('agc');
		expect(result.metadata[0].name).to.equal('some-package-dlc');
		expect(result.metadata[0].info.summary).to.equal('Some package DLC');

	});

	it('parses iframes from the html description', async function() {

		const upload = faker.upload({
			description: `
			Here are some of my packages:

			<iframe src="https://community.simtropolis.com/files/file/1-one"></iframe>
			<iframe src="https://community.simtropolis.com/files/file/2-two"></iframe>
			`.trim().split('\n').map(x => x.trim()).join('\n'),
		});
		const { run } = this.setup({
			uploads: [upload],
		});
		const { result } = await run({ id: upload.id });
		expect(result.metadata[0].info.description).to.include('[https://community.simtropolis.com/files/file/1-one](https://community.simtropolis.com/files/file/1-one)');
		expect(result.metadata[0].info.description).to.include('[https://community.simtropolis.com/files/file/2-two](https://community.simtropolis.com/files/file/2-two)');

	});

	it('a package with a CAM variant', async function() {

		this.timeout(5000);
		const file = async (name) => await fs.promises.readFile(
			path.join(import.meta.dirname, name),
		);

		const upload = faker.upload({
			title: 'Tower',
			author: 'author',
			files: [
				{
					name: 'Tower.zip',
					contents: {
						'metadata.yaml': '',
						'growables/growable C$$.SC4Desc': await file('detect-growables/growable.SC4Desc'),
						'growables/growable.SC4Lot': await file('detect-growables/growable.SC4Lot'),
						'ploppable.SC4Lot': await file('detect-growables/ploppable.SC4Lot'),
					},
				},
				{
					name: 'Tower (CAM).zip',
					contents: {
						'cam.SC4Desc': '',
						'cam.SC4Lot': '',
					},
				},
			],
		});
		const { run } = this.setup({ upload });
		const { result } = await run({ id: upload.id });
		let { variants } = result.metadata[0];
		expect(variants).to.eql([
			{
				variant: { CAM: 'no' },
				assets: [
					{
						assetId: 'author-tower',
					},
				],
			},
			{
				variant: { CAM: 'yes' },
				assets: [
					{
						assetId: 'author-tower',
						exclude: [
							'/growables\\/growable C\\$\\$\\.SC4Desc$',
							'/growables/growable.SC4Lot',
						],
					},
					{ assetId: 'author-tower-cam' },
				],
			},
		]);

	});

	it('a darnkite-only package', async function() {

		const upload = faker.upload({
			author: 'author',
			title: 'tower',
			files: [
				{
					name: 'Tower_DN.zip',
				},
			],
		});
		const { run } = this.setup({ upload });
		const { result } = await run({ id: upload.id });
		let { variants } = result.metadata[0];
		expect(variants).to.eql([
			{
				variant: { nightmode: 'standard' },
				assets: [
					{ assetId: 'author-tower-darknite' },
				],
			},
			{
				variant: { nightmode: 'dark' },
				dependencies: ['simfox:day-and-nite-mod'],
				assets: [
					{ assetId: 'author-tower-darknite' },
				],
			},
		]);

	});

	it('ensures uniqueness of the assets', async function() {

		const upload = faker.upload({
			author: 'author',
			title: 'World Trade Center',
			files: [
				'North Tower (MN).zip',
				'North Tower (DN).zip',
				'South Tower (MN).zip',
				'South Tower (DN).zip',
			],
		});
		const { run } = this.setup({ upload });
		const { result } = await run({ id: upload.id });
		let [, ...assets] = result.metadata;
		expect(assets[0].assetId).to.equal('author-world-trade-center-maxisnite-part-1');
		expect(assets[1].assetId).to.equal('author-world-trade-center-darknite-part-1');
		expect(assets[2].assetId).to.equal('author-world-trade-center-maxisnite-part-2');
		expect(assets[3].assetId).to.equal('author-world-trade-center-darknite-part-2');

	});

	it('attaches the GitHub username if known', async function() {

		const upload = faker.upload({
			uid: 123,
		});
		const { run } = this.setup({
			upload,
			permissions: {
				authors: [
					{
						id: 123,
						github: 'sebamarynissen',
					},
				],
			},
		});
		const { result } = await run({ id: upload.id });
		expect(result.githubUsername).to.equal('sebamarynissen');

	});

	it('doesn\'t choke on obsolete packages where the file have been deleted', async function() {

		const upload = faker.upload({
			files: [
				{
					name: null,
				},
			],
		});
		const { run } = this.setup({ upload });
		const { packages, notices } = await run({ id: upload.id });
		expect(packages).to.have.length(0);
		expect(notices).to.have.length(1);

	});

	it('handles mutiple metadata.yaml files in the same asset', async function() {

		const upload = faker.upload({
			files: [
				{
					contents: {
						'metadata.yaml': {
							name: 'this-one',
						},
						'subfolder/metadata.yaml': {
							name: 'no-this-one',
						},
					},
				},
			],
		});
		const { run } = this.setup({ upload });
		const { result } = await run({ id: upload.id });
		expect(result.errors).to.have.length(1);

	});

	it('handles mutiple metadata.yaml files in different assets', async function() {

		const upload = faker.upload({
			files: [
				{
					contents: {
						'metadata.yaml': {
							name: 'this-one',
						},
					},
				},
				{
					contents: {
						'metadata.yaml': {
							name: 'no-this-one',
						},
					},
				},
			],
		});
		const { run } = this.setup({ upload });
		const { result } = await run({ id: upload.id });
		expect(result.errors).to.have.length(1);

	});

	it('supports author aliases', async function() {

		const upload = faker.upload({
			uid: 415798,
		});
		const { run } = this.setup({
			upload,
			permissions: {
				authors: [
					{
						id: 415798,
						alias: 'agc',
					},
				],
			},
		});
		const { result } = await run({ id: upload.id });
		expect(result.metadata[0].group).to.equal('agc');
		expect(result.metadata[0].info.author).to.equal(upload.author);

	});

});

function jsonToYaml(json) {
	return [json].flat().map((json, index) => {
		let doc = new Document(json);
		if (index > 0) doc.directives.docStart = true;
		return doc;
	}).join('\n');
}
