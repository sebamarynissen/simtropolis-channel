// # parse-basic-metadata-test.js
import { expect } from 'chai';
import apiToMetadata from '../api-to-metadata.js';
import * as faker from './faker.js';

describe('#apiToMetadata', function() {

	it('handles underscores in the author name', function() {

		let meta = apiToMetadata({
			id: 36596,
			cid: 102,
			uid: 259789,
			author: 'smf_16',
			category: 'Commercial',
			title: 'Meadowbrook Plaza Fixed',
			release: '1.0.0',
			submitted: '2024-12-13 15:13:40',
			updated: '2024-12-13 15:13:40',
			views: 483,
			downloads: 41,
			reputation: 8,
			sizeTotal: '91.54 kB',
			files: [
				{
					id: 204658,
					name: 'Meadowbrook Plaza Fixed.zip',
					link: null,
					size: '91.54 kB',
				},
			],
			imageURL: 'https://www.simtropolis.com/objects/screens/monthly_2024_12/675c4df1b7f60_meadowbrookplazafixed.jpg.967b58ddf3b0a16aec48453deff3e741.jpg',
			thumbURL: 'https://www.simtropolis.com/objects/screens/monthly_2024_12/675c4f246ef59_meadowbrookplazafixed.thumb.jpg.8e1caf68eefc9dd251f907f167558dd2.jpg',
			aliasEntry: 'meadowbrook-plaza-fixed',
			aliasAuthor: 'smf_16',
			fileURL: 'https://community.simtropolis.com/files/file/36596-meadowbrook-plaza-fixed/',
		});
		let { package: pkg, assets } = meta;
		expect(pkg.group).to.equal('smf-16');
		expect(pkg.name).to.equal('meadowbrook-plaza-fixed');
		expect(pkg.subfolder).to.equal('300-commercial');
		expect(pkg.version).to.equal('1.0.0');
		expect(pkg.info.summary).to.equal('Meadowbrook Plaza Fixed');
		expect(pkg.info).to.have.property('description');
		expect(pkg.info.description).to.be.undefined;
		expect(pkg.info.author).to.equal('smf_16');
		expect(pkg.info.website).to.equal('https://community.simtropolis.com/files/file/36596-meadowbrook-plaza-fixed/');
		expect(pkg.info).to.have.property('images');
		expect(pkg.info.images).to.be.undefined;
		expect(assets).to.have.length(1);
		let [asset] = assets;
		expect(asset.assetId).to.equal('smf-16-meadowbrook-plaza-fixed');
		expect(asset.version).to.equal('1.0.0');
		expect(asset.lastModified).to.equal('2024-12-13T15:13:40Z');
		expect(asset.url).to.equal('https://community.simtropolis.com/files/file/36596-meadowbrook-plaza-fixed/?do=download&r=204658');

	});

	it('automatically handles DN and MN variants', function() {

		let meta = apiToMetadata({
			id: 36581,
			cid: 101,
			uid: 85340,
			author: 'Jasoncw',
			category: 'Residential',
			title: 'Newport House',
			release: '1.0.0',
			submitted: '2024-12-05 04:10:52',
			updated: '2024-12-05 04:10:52',
			views: 617,
			downloads: 177,
			reputation: 16,
			sizeTotal: '380.82 kB',
			files: [
				{
					id: 204586,
					name: 'Jasoncw - Newport House (MN).zip',
					link: null,
					size: '193.90 kB',
				},
				{
					id: 204587,
					name: 'Jasoncw - Newport House (DN).zip',
					link: null,
					size: '186.92 kB',
				},
			],
			imageURL: 'https://www.simtropolis.com/objects/screens/monthly_2024_12/NewportHouse00.jpg.30b56ac4131cf79c03240c8ae2adc444.jpg',
			thumbURL: 'https://www.simtropolis.com/objects/screens/monthly_2024_12/NewportHouse00.thumb.jpg.5ba159c59cb236600eca69863df8c581.jpg',
			aliasEntry: 'newport-house',
			aliasAuthor: 'jasoncw',
			fileURL: 'https://community.simtropolis.com/files/file/36581-newport-house/',
		});
		let { package: pkg, assets } = meta;
		expect(pkg.group).to.equal('jasoncw');
		expect(pkg.name).to.equal('newport-house');
		expect(pkg.subfolder).to.equal('200-residential');
		expect(pkg.version).to.equal('1.0.0');
		expect(pkg.info.summary).to.equal('Newport House');
		expect(pkg.info).to.have.property('description');
		expect(pkg.info.description).to.be.undefined;
		expect(pkg.info.author).to.equal('Jasoncw');
		expect(pkg.info.website).to.equal('https://community.simtropolis.com/files/file/36581-newport-house/');
		expect(pkg.info).to.have.property('images');
		expect(pkg.info.images).to.be.undefined;
		expect(assets).to.have.length(2);
		let [mn, dn] = assets;
		expect(mn.assetId).to.equal('jasoncw-newport-house-maxisnite');
		expect(mn.url).to.equal('https://community.simtropolis.com/files/file/36581-newport-house/?do=download&r=204586');
		expect(dn.assetId).to.equal('jasoncw-newport-house-darknite');
		expect(dn.url).to.equal('https://community.simtropolis.com/files/file/36581-newport-house/?do=download&r=204587');
		for (let asset of assets) {
			expect(asset.version).to.equal('1.0.0');
			expect(asset.lastModified).to.equal('2024-12-05T04:10:52Z');
		}

	});

	it('automatically handles CAMeLot assets', function() {

		let upload = faker.upload({
			author: 'Jasoncw',
			title: 'Guardian Building',
			files: [
				{
					name: 'Jasoncw - Guardian Building.zip',
				},
				{
					name: 'Jasoncw - Guardian Building (CAMeLots).zip',
				},
			],
		});
		let meta = apiToMetadata(upload);
		expect(meta.assets[0].assetId).to.equal('jasoncw-guardian-building');
		expect(meta.assets[1].assetId).to.equal('jasoncw-guardian-building-cam');

	});

	it('handles iso date formats', function() {

		let upload = faker.upload({
			submitted: '2024-12-05T04:10:52Z',
			updated: '2024-12-05T04:10:52Z',
		});
		let meta = apiToMetadata(upload);
		for (let asset of meta.assets) {
			expect(asset.lastModified).to.equal(upload.updated);
		}

	});

	it('slugifies $ to s', function() {

		let upload = faker.upload({
			title: 'R$$ Homes',
		});
		let meta = apiToMetadata(upload);
		expect(meta.package.name).to.equal('rss-homes');

	});

	it('doesn\'t end with a hyphen', function() {

		let upload = faker.upload({
			title: 'BSP Building (Updated)',
		});
		let meta = apiToMetadata(upload);
		expect(meta.package.name).to.equal('bsp-building-updated');

	});

	it('slugifies &', function() {

		let upload = faker.upload({
			title: 'Skidmore, Owings & Merrill',
		});
		let meta = apiToMetadata(upload);
		expect(meta.package.name).to.equal('skidmore-owings-and-merrill');

	});

	it('handles vol-01', function() {

		let upload = faker.upload({
			title: 'Prop Pack Vol. 01',
		});
		let meta = apiToMetadata(upload);
		expect(meta.package.name).to.equal('prop-pack-vol01');

	});

	it('handles vol-one', function() {

		let upload = faker.upload({
			title: 'Prop Pack Vol. One',
		});
		let meta = apiToMetadata(upload);
		expect(meta.package.name).to.equal('prop-pack-vol-one');

	});

	it('normalizes non-ascii characters', function() {

		let upload = faker.upload({
			title: 'Dóm sväteho Martina ',
		});
		let meta = apiToMetadata(upload);
		expect(meta.package.name).to.equal('dom-svateho-martina');

	});

});
