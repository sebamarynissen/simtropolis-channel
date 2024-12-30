// # patch-metadata-test.js
import fs from 'node:fs';
import { expect } from 'chai';
import { parseAllDocuments } from 'yaml';
import patchMetadata from '../patch-metadata.js';

describe('#patchMetadata()', function() {

	function read(file) {
		let contents = fs.readFileSync(new URL(file, import.meta.url)).toString();
		let docs = parseAllDocuments(contents).map(doc => doc.toJSON());
		return docs.length === 1 ? docs[0] : docs;
	}

	it('returns the main metadata as is without a patch', function() {

		let metadata = {
			package: {
				group: 'smf16',
				name: 'stex-package',
				info: {
					summary: 'STEX package',
				},
			},
		};
		let { packages } = patchMetadata(metadata, null);
		expect(packages).to.have.length(1);
		expect(packages[0]).to.eql(metadata.package);

	});

	it('overrides specific info', function() {

		let metadata = {
			package: {
				group: 'andreas',
				name: 'dependencies',
				subfolder: '150-mods',
				info: {
					author: 'Andreas Roth',
					description: 'This is the description',
					website: 'https://www.simtropolis.com/files/file/123-file',
				},
			},
		};
		let patch = read('group-override.yaml');
		let { packages } = patchMetadata(metadata, patch);
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

		let metadata = {
			package: {
				group: 'smf-16',
				name: 'reference-assets',
				info: {
					summary: 'Reference Assets',
					description: 'STEX description',
				},
			},
			assets: [
				{ assetId: 'smf-16-reference-assets' },
			],
		};

		let patch = read('interpolation.yaml');
		let { packages: [pkg] } = patchMetadata(metadata, patch);
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

		let metadata = {
			package: {
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
			assets: [
				{
					assetId: 'smf-16-some-building',
					url: 'https://www.simtropolis.com/files/file/123-smf-16-some-building',
				},
			],
		};

		let patch = read('resource-package.yaml');
		let { packages: [resources, main] } = patchMetadata(metadata, patch);
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

});
