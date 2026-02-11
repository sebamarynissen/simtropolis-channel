// # patch-metadata-test.js
import fs from 'node:fs';
import { expect } from 'chai';
import { parseAllDocuments } from 'yaml';
import patchMetadata from '../patch-metadata.js';

describe('#patchMetadata()', function() {

	function read(file) {
		let contents = fs.readFileSync(new URL(file, import.meta.url)).toString();
		return parseAllDocuments(contents).map(doc => doc.toJSON());
	}

	it('returns the main metadata as is without a patch', function() {

		let metadata = [{
			group: 'smf16',
			name: 'stex-package',
			info: {
				summary: 'STEX package',
			},
		}];
		let { metadata: [pkg] } = patchMetadata(metadata, []);
		expect(pkg).to.eql(metadata[0]);

	});

	it('overrides specific info', function() {

		let metadata = [{
			group: 'andreas',
			name: 'dependencies',
			subfolder: '150-mods',
			info: {
				author: 'Andreas Roth',
				description: 'This is the description',
				website: 'https://www.simtropolis.com/files/file/123-file',
			},
		}];
		let patch = read('group-override.yaml');
		let { metadata: [...packages] } = patchMetadata(metadata, patch);
		expect(packages).to.have.length(1);
		let [pkg] = packages;
		expect(pkg.group).to.equal('sfbt');
		expect(pkg.name).to.equal('dependencies');
		expect(pkg.subfolder).to.equal('900-overrides');
		expect(pkg.info.description).to.equal('This is the description');
		expect(pkg.info.website).to.equal('https://www.sfbt.com');
		expect(pkg.info.author).to.equal('SFBT Team');

	});

	it('interpolates asset ids', function() {

		let metadata = [
			{
				group: 'smf-16',
				name: 'reference-assets',
				info: {
					summary: 'Reference Assets',
					description: 'STEX description',
				},
			},
			{ assetId: 'smf-16-reference-assets' },
		];

		let patch = read('interpolation.yaml');
		let { metadata: [pkg] } = patchMetadata(metadata, patch);
		expect(pkg).to.eql({
			group: 'smf-16',
			name: 'reference-assets',
			info: {
				summary: 'Reference Assets',
				description: 'I want a custom description for Reference Assets',
			},
			assets: [
				{
					assetId: 'smf-16-reference-assets',
					include: [
						'.sc4lot$',
					],
				},
			],
		});

	});

	it('patches from multiple packages', function() {

		let metadata = [
			{
				group: 'smf-16',
				name: 'some-building',
				subfolder: '200-residential',
				info: {
					summary: 'Some Building',
				},
				dependencies: [
					'memo:submenus-dll',
				],
			},
			{
				assetId: 'smf-16-some-building',
				url: 'https://www.simtropolis.com/files/file/123-smf-16-some-building',
			},
		];

		let patch = read('resource-package.yaml');
		let { metadata: [resources, main] } = patchMetadata(metadata, patch);
		expect(resources).to.eql({
			group: 'smf-16',
			name: 'some-building-resources',
			subfolder: '100-props-textures',
			info: {
				summary: 'Some Building Resources',
				description: 'Resource package for `pkg=smf-16:some-building`',
			},
			assets: [
				{
					assetId: 'smf-16-some-building',
					exclude: ['.sc4lot$'],
				},
			],
		});
		expect(main).to.eql({
			group: 'smf-16',
			name: 'some-building',
			subfolder: '200-residential',
			info: {
				summary: 'Some Building',
			},
			assets: [
				{
					assetId: 'smf-16-some-building',
					include: ['.sc4lot$'],
				},
			],
			dependencies: [
				'memo:submenus-dll',
			],
		});

	});

	it('removes check checksum from external assets', function() {

		let metadata = [
			{
				group: 'smf-16',
				name: 'some-dll',
				subfolder: '200-residential',
				info: {
					summary: 'Some Building',
				},
				dependencies: [
					'memo:submenus-dll',
				],
			},
			{
				assetId: 'smf-16-some-dll',
				lastModified: '2025-01-01T00:00:00Z',
				url: 'https://www.simtropolis.com/files/file/123-smf-16-some-dll?do=download',
				withChecksum: [
					{
						include: '/cheats.dll',
						sha256: '54a256',
					},
				],
			},
		];

		let { metadata: [, asset] } = patchMetadata(metadata, [{
			url: 'https://github.com/smf16/dlls/releases/1.0.0/asset.zip',
		}]);
		expect(asset).to.eql({
			assetId: 'smf-16-some-dll',
			lastModified: '2025-01-01T00:00:00Z',
			url: 'https://github.com/smf16/dlls/releases/1.0.0/asset.zip',
			nonPersistentUrl: 'https://www.simtropolis.com/files/file/123-smf-16-some-dll?do=download',
		});

	});

	it('bypasses the entire metadata generation if specified, while still supporting interpolation', function() {

		let autoMetadata = [
			{
				group: 'smf-16',
				name: 'everseasonal-flora',
				subfolder: '150-mods',
				info: {
					summary: 'Everseasonal Flora',
					description: 'Some long description',
				},
			},
			{
				assetId: 'smf-16-everseasonal-flora',
				lastModified: '2026-01-01T00:00:00Z',
				url: 'https://www.simtropolis.com/files/file/123-smf-16-everseasonal-flora',
			},
		];
		let userMetadata = [
			{
				config: {
					algorithm: 'interpolate',
				},
			},
			{
				group: '${{ package.group }}',
				name: '${{ package.name }}',
				info: {
					summary: '${{ package.info.summary }}',
					description: 'Some custom description for sc4pac',
				},
				some: {
					very: {
						complex: 'metadata',
					},
				},
			},
		];
		const { metadata: [pkg, asset], main, basename } = patchMetadata(autoMetadata, userMetadata);
		expect(pkg).to.eql({
				group: 'smf-16',
				name: 'everseasonal-flora',
				info: {
					summary: 'Everseasonal Flora',
					description: 'Some custom description for sc4pac',
				},
				some: {
					very: {
						complex: 'metadata',
					},
				},
			});
		expect(asset).to.eql({
			assetId: 'smf-16-everseasonal-flora',
			lastModified: '2026-01-01T00:00:00Z',
			url: 'https://www.simtropolis.com/files/file/123-smf-16-everseasonal-flora',
		});
		expect(main).to.equal(pkg);
		expect(basename).to.equal('everseasonal-flora');

	});

});
