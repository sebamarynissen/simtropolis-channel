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
		let [main, resource] = await splitPackage({
			package: {
				...pkg,
				assets: [{ assetId: asset.assetId }],
			},
			assets: [asset],
		});
		expect(main.group).to.equal(pkg.group);
		expect(main.name).to.equal(pkg.name);
		expect(main.assets[0].include).to.eql(['\\.SC4Lot$']);

		expect(resource.group).to.equal(pkg.group);
		expect(resource.name).to.equal(`${pkg.name}-resources`);
		expect(resource.assets[0].include).to.eql(['\\.SC4Desc$', '\\.SC4Model$']);

	});

});
