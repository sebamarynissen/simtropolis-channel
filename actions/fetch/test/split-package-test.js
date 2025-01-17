// # split-package-test.js
import path from 'node:path';
import splitPackage from '../split-package.js';
import { kExtractedAsset } from '../symbols.js';

describe('#splitPackage()', function() {

	it('splits up a package in resources and lots', async function() {

		let [main, resource] = await splitPackage({
			package: {
				group: 'author',
				name: 'package',
				version: '1.0',
				subfolder: '200-commercial',
				info: {
					summary: 'Package',
					author: 'author',
					website: 'https://community.simtropolis.com/files/file/123-package',
				},
				assets: [
					{ assetId: 'author-package' },
				],
			},
			assets: [
				{
					assetId: 'author-package',
					[kExtractedAsset]: path.join(import.meta.dirname, 'detect-growables'),
				},
			],
		});

	});

});
