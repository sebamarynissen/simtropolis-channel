// # integration-test.js
import { expect } from 'chai';
import { Document, parseAllDocuments } from 'yaml';
import yazl from 'yazl';
import action from '../fetch.js';
import { urlToFileId } from '../util.js';
import { Volume } from 'memfs';

describe('The fetch action', function() {

	before(function() {
		this.slow(1000);

		this.setup = async function(testOptions) {

			const { uploads } = testOptions;

			// We'll mock the global "fetch" method so that we can mock the api 
			// & download responses.
			globalThis.fetch = async function(url) {

				// Parse the url and check what type of request the action is 
				// making. Based on this we'll return a different result.
				let parsedUrl = new URL(url);
				let { pathname, searchParams } = parsedUrl;
				if (pathname.startsWith('/stex/files-api.php')) {
					return new Response(JSON.stringify(testOptions.uploads), {
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

						// Mock a .zip file with the contents as specified in 
						// the upload.
						let zipFile = new yazl.ZipFile();
						let { contents } = file;
						for (let [name, raw] of Object.entries(contents)) {
							if (typeof raw === 'object') {
								raw = jsonToYaml(raw);
							}
							zipFile.addBuffer(Buffer.from(raw), name);
						}
						zipFile.end();
						return new Response(
							zipFile.outputStream,
							{
								headers: {
									'Content-Type': 'application/zip',
								},
							},
						);

					} else {
						return new Response(`<html>
							<body>
								<div>
									<h2>About this file</h2>
									<section><div>${ upload.description }</div></section>
								</div>
							</body>
						</html>`);
					}
				}

				// By default the url is not found, return an error.
				return new Response('Not found', { status: 404 });

			};

		};

		this.run = async function(opts) {
			let fs = Volume.fromJSON();
			fs.writeFileSync('/permissions.yaml', '');
			let results = await action({
				fs,
				cwd: '/',
				...opts,
			});
			return {
				fs,
				read(file) {
					let contents = fs.readFileSync(file).toString();
					return parseAllDocuments(contents).map(doc => doc.toJSON());
				},
				results,
				result: results[0],
			};
		};

	});

	it('a package with an empty metadata.yaml', async function() {

		this.setup({
			uploads: [{
				id: 5364,
				uid: 259789,
				cid: 100,
				author: 'smf_16',
				title: 'SMF Tower',
				aliasEntry: 'smf-tower',
				release: '1.0.2',
				submitted: '2024-12-19 04:24:08',
				updated: '2024-12-19 04:24:08',
				fileURL: 'https://community.simtropolis.com/files/file/5364-smf-tower',
				description: 'This is the description',
				files: [
					{
						id: 12345,
						name: 'SMF Tower.zip',
						contents: {
							'metadata.yaml': '',
						},
					},
				],
			}],
		});

		let { read, result } = await this.run({ id: 5364 });
		expect(result.branch).to.equal('package/smf-16-smf-tower');
		expect(result.title).to.equal('smf-16:smf-tower@1.0.2');

		let metadata = read('/src/yaml/smf-16/smf-tower.yaml');
		expect(metadata[0]).to.eql({
			group: 'smf-16',
			name: 'smf-tower',
			version: '1.0.2',
			info: {
				summary: 'SMF Tower',
				description: 'This is the description',
				website: 'https://community.simtropolis.com/files/file/5364-smf-tower',
				images: [],
				author: 'smf_16',
			},
			assets: [
				{ assetId: 'smf-16-smf-tower' },
			],
		});
		expect(metadata[1]).to.eql({
			assetId: 'smf-16-smf-tower',
			lastModified: '2024-12-19T04:24:08Z',
			version: '1.0.2',
			url: 'https://community.simtropolis.com/files/file/5364-smf-tower/?do=download&r=12345',
		});

	});

	it('a package with custom dependencies', async function() {

		this.setup({
			uploads: [{
				id: 5364,
				uid: 259789,
				cid: 100,
				author: 'smf_16',
				title: 'SMF Tower',
				aliasEntry: 'smf-tower',
				release: '1.0.2',
				submitted: '2024-12-19 04:24:08',
				updated: '2024-12-19 04:24:08',
				fileURL: 'https://community.simtropolis.com/files/file/5364-smf-tower',
				description: 'This is the description',
				files: [
					{
						id: 12345,
						name: 'SMF Tower.zip',
						contents: {
							'metadata.yaml': {
								info: {
									description: 'Custom description',
								},
								dependencies: [
									'memo:submenus-dll',
									'bsc:mega-props-cp-vol01',
								],
							},
						},
					},
				],
			}],
		});

		let { read } = await this.run({ id: 5364 });
		let metadata = read('/src/yaml/smf-16/smf-tower.yaml');
		expect(metadata[0]).to.eql({
			group: 'smf-16',
			name: 'smf-tower',
			version: '1.0.2',
			info: {
				summary: 'SMF Tower',
				description: 'Custom description',
				website: 'https://community.simtropolis.com/files/file/5364-smf-tower',
				images: [],
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
			lastModified: '2024-12-19T04:24:08Z',
			version: '1.0.2',
			url: 'https://community.simtropolis.com/files/file/5364-smf-tower/?do=download&r=12345',
		});

	});

	it('a package with MN and DN variants', async function() {

		this.setup({
			uploads: [{
				id: 5364,
				uid: 259789,
				cid: 100,
				author: 'smf_16',
				title: 'SMF Tower',
				aliasEntry: 'smf-tower',
				release: '1.0.2',
				submitted: '2024-12-19 04:24:08',
				updated: '2024-12-19 04:24:08',
				fileURL: 'https://community.simtropolis.com/files/file/5364-smf-tower',
				description: 'This is the description',
				files: [
					{
						id: 12345,
						name: 'SMF Tower (MN).zip',
						contents: {
							'metadata.yaml': '',
						},
					},
					{
						id: 12346,
						name: 'SMF Tower (DN).zip',
						contents: {},
					},
				],
			}],
		});

		let { read } = await this.run({ id: 5364 });
		let metadata = read('/src/yaml/smf-16/smf-tower.yaml');
		expect(metadata[0]).to.eql({
			group: 'smf-16',
			name: 'smf-tower',
			version: '1.0.2',
			info: {
				summary: 'SMF Tower',
				description: 'This is the description',
				website: 'https://community.simtropolis.com/files/file/5364-smf-tower',
				images: [],
				author: 'smf_16',
			},
			variants: [
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
			],
		});
		expect(metadata[1]).to.eql({
			assetId: 'smf-16-smf-tower-maxisnite',
			lastModified: '2024-12-19T04:24:08Z',
			version: '1.0.2',
			url: 'https://community.simtropolis.com/files/file/5364-smf-tower/?do=download&r=12345',
		});
		expect(metadata[2]).to.eql({
			assetId: 'smf-16-smf-tower-darknite',
			lastModified: '2024-12-19T04:24:08Z',
			version: '1.0.2',
			url: 'https://community.simtropolis.com/files/file/5364-smf-tower/?do=download&r=12346',
		});

	});

	it('a package with driveside variants', async function() {

		this.setup({
			uploads: [{
				id: 5364,
				uid: 259789,
				cid: 100,
				author: 'smf_16',
				title: 'SMF Tower',
				aliasEntry: 'smf-tower',
				release: '1.0.2',
				submitted: '2024-12-19 04:24:08',
				updated: '2024-12-19 04:24:08',
				fileURL: 'https://community.simtropolis.com/files/file/5364-smf-tower',
				description: 'This is the description',
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
			}],
		});

		let { read } = await this.run({ id: 5364 });
		let metadata = read('/src/yaml/smf-16/smf-tower.yaml');
		expect(metadata[0]).to.eql({
			group: 'smf-16',
			name: 'smf-tower',
			version: '1.0.2',
			info: {
				summary: 'SMF Tower',
				description: 'This is the description',
				website: 'https://community.simtropolis.com/files/file/5364-smf-tower',
				images: [],
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

		this.setup({
			uploads: [{
				id: 5364,
				uid: 259789,
				cid: 100,
				author: 'smf_16',
				title: 'GitHub Tower',
				aliasEntry: 'github-tower',
				release: '1.0.2',
				submitted: '2024-12-19 04:24:08',
				updated: '2024-12-19 04:24:08',
				fileURL: 'https://community.simtropolis.com/files/file/5364-github-tower',
				description: 'This is the description',
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
			}],
		});

		let { read } = await this.run({ id: 5364 });
		let metadata = read('/src/yaml/github/smf-github-tower.yaml');
		expect(metadata[0]).to.eql({
			group: 'github',
			name: 'smf-github-tower',
			version: '1.0.2',
			info: {
				summary: 'GitHub Tower',
				description: 'This is the description',
				website: 'https://community.simtropolis.com/files/file/5364-github-tower',
				images: [],
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

		this.setup({
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
				description: 'This is the description',
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
			}],
		});

		let { read, result } = await this.run({ id: 5364 });
		expect(result.branch).to.equal('package/smf-16-st-residences');
		expect(result.title).to.equal('smf-16:st-residences@2.0.0');
		let metadata = read('/src/yaml/smf-16/st-residences.yaml');
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
				images: [],
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

});

function jsonToYaml(json) {
	return [json].flat().map((json, index) => {
		let doc = new Document(json);
		if (index > 0) doc.directives.docStart = true;
		return doc;
	}).join('\n');
}
