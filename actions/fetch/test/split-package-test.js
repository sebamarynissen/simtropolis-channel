// # split-package-test.js
import path from 'node:path';
import fs from 'node:fs';
import tmp from 'tmp-promise';
import splitPackage from '../split-package.js';
import { kExtractedAsset } from '../symbols.js';
import * as faker from './faker.js';
import { DBPF, Exemplar, TGI, FileType, ExemplarProperty } from 'sc4/core';
import { expect } from 'chai';

const types = {
	lot: ExemplarProperty.ExemplarType.LotConfigurations,
	prop: ExemplarProperty.ExemplarType.Prop,
	flora: ExemplarProperty.ExemplarType.Flora,
	building: ExemplarProperty.ExemplarType.Buildings,
};

describe('#splitPackage()', function() {

	before(function() {
		let i = 0;
		this.files = function(files) {
			i++;
			let { name: folder } = tmp.dirSync();
			for (let name of Object.keys(files)) {
				let fullPath = path.join(folder, name);
				let labels = [files[name]].flat();
				let dbpf = new DBPF();
				for (let label of labels) {
					if (label === 'model') {
						let tgi = TGI.random(FileType.S3D);
						dbpf.add(tgi, new Uint8Array());
					} else if (label === 'texture') {
						let tgi = TGI.random(FileType.FSH);
						dbpf.add(tgi, new Uint8Array());
					} else {
						let tgi = TGI.random(FileType.Exemplar);
						let exemplar = new Exemplar();
						exemplar.addProperty('ExemplarType', types[label]);
						dbpf.add(tgi, exemplar);
					}
				}
				fs.mkdirSync(path.dirname(fullPath), { recursive: true });
				fs.writeFileSync(fullPath, dbpf.toBuffer());
			}
			this.test.ctx.cleanup = () => {
				fs.rmSync(folder, { recursive: true, force: true });
			};
			return {
				assetId: `asset-${i}`,
				[kExtractedAsset]: folder,
			};
		};
	});

	afterEach(async function() {
		const { cleanup } = this.test.ctx;
		await cleanup?.();
	});

	it('splits up a package in resources and lots', async function() {

		let asset = this.files({
			'ploppable.SC4Lot': 'lot',
			'growable.SC4Lot': 'lot',
			'growable.SC4Desc': 'building',
			'building.SC4Model': 'model',
		});

		let pkg = faker.pkg({ subfolder: '300-commercial' });
		let [main, resource] = await splitPackage([
			{
				...pkg,
				assets: [{ assetId: asset.assetId }],
			},
			asset,
		]);
		expect(main.group).to.equal(pkg.group);
		expect(main.name).to.equal(pkg.name);
		expect(main.assets[0].include).to.eql(['\\.SC4Lot$']);
		expect(main.dependencies).to.include(`${pkg.group}:${pkg.name}-resources`);

		expect(resource.group).to.equal(pkg.group);
		expect(resource.name).to.equal(`${pkg.name}-resources`);
		expect(resource.subfolder).to.equal(`100-props-textures`);
		expect(resource.assets[0].include).to.eql(['\\.SC4Desc$', '\\.SC4Model$']);

	});

	it('splits up a DN/MN package in resources and lots', async function() {

		let mn = this.files({
			'ploppable.SC4Lot': 'lot',
			'growable.SC4Lot': 'lot',
			'growable.SC4Desc': 'building',
			'building.SC4Model': 'model',
		});
		let dn = this.files({
			'ploppable.SC4Lot': 'lot',
			'growable.SC4Lot': 'lot',
			'growable.SC4Desc': 'building',
			'building.SC4Model': 'model',
		});

		let pkg = faker.pkg({ subfolder: '300-commercial' });
		let [main, resource] = await splitPackage([
			{
				...pkg,
				variants: [
					{
						variant: { nightmode: 'standard' },
						assets: [{ assetId: mn.assetId }],
					},
					{
						variant: { nightmode: 'dark' },
						dependencies: ['simfox:day-and-nite-mod'],
						assets: [{ assetId: dn.assetId }],
					},
				],
			},
			mn,
			dn,
		]);
		expect(main.group).to.equal(pkg.group);
		expect(main.name).to.equal(pkg.name);
		expect(main.variants[0].assets[0].include).to.eql(['\\.SC4Lot$']);
		expect(main.variants[1].assets[0].include).to.eql(['\\.SC4Lot$']);
		expect(main.variants[1].dependencies).to.eql(['simfox:day-and-nite-mod']);
		expect(main.dependencies).to.include(`${pkg.group}:${pkg.name}-resources`);

		expect(resource.group).to.equal(pkg.group);
		expect(resource.name).to.equal(`${pkg.name}-resources`);
		expect(resource.subfolder).to.equal(`100-props-textures`);
		expect(resource.variants[0].assets[0].include).to.eql(['\\.SC4Desc$', '\\.SC4Model$']);
		expect(resource.variants[1].assets[0].include).to.eql(['\\.SC4Desc$', '\\.SC4Model$']);
		expect(resource.variants[1].dependencies).to.eql(['simfox:day-and-nite-mod']);

	});

	it('splits up a package in props and flora', async function() {

		let asset = this.files({
			'trees/oak.SC4Model': 'model',
			'trees/oak.SC4Desc': 'prop',
			'trees/birch.SC4Model': 'model',
			'trees/birch.SC4Desc': 'prop',
			'flora.dat': ['flora', 'flora'],
		});

		let pkg = faker.pkg({ subfolder: '180-flora' });
		let [main, resource] = await splitPackage([
			{
				...pkg,
				assets: [{ assetId: asset.assetId }],
			},
			asset,
		]);
		expect(main.group).to.equal(pkg.group);
		expect(main.name).to.equal(pkg.name);
		expect(main.assets[0].include).to.eql(['\\.dat$']);
		expect(main.dependencies).to.include(`${pkg.group}:${pkg.name}-resources`);

		expect(resource.assets[0].include).to.not.include('\\.dat$');
		expect(resource.assets[0].include).to.include('\\.SC4Model$');
		expect(resource.assets[0].include).to.include('\\.SC4Desc$');

	});

	it('explicitly lists the files if unable to separate by extension', async function() {

		let asset = this.files({
			'props/oak.SC4Model': 'model',
			'props/oak.SC4Desc': 'prop',
			'props/birch.SC4Model': 'model',
			'props/birch.SC4Desc': 'prop',
			'flora/oak.SC4Desc': 'flora',
			'flora/birch.SC4Desc': 'flora',
		});

		let pkg = faker.pkg({ subfolder: '180-flora' });
		let [main, resource] = await splitPackage([
			{
				...pkg,
				assets: [{ assetId: asset.assetId }],
			},
			asset,
		]);
		expect(main.group).to.equal(pkg.group);
		expect(main.name).to.equal(pkg.name);
		expect(main.assets[0].include).to.not.include('\\.SC4Desc');
		expect(main.assets[0].include).to.include('flora/oak.SC4Desc');
		expect(main.assets[0].include).to.include('flora/birch.SC4Desc');
		expect(main.dependencies).to.include(`${pkg.group}:${pkg.name}-resources`);

		expect(resource.assets[0].include).to.not.include('\\.SC4Desc');
		expect(resource.assets[0].include).to.include('\\.SC4Model$');
		expect(resource.assets[0].include).to.include('props/oak.SC4Desc');
		expect(resource.assets[0].include).to.include('props/birch.SC4Desc');

	});

});
