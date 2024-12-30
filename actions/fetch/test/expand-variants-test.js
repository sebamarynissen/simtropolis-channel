// # expand-variants-test.js
import { expect } from 'chai';
import { kFileTags } from '../symbols.js';
import { expandVariants } from '../complete-metadata.js';

describe('#expandVariants()', function() {

	it('handles maxisnite and darknite variants', function() {

		let assets = [
			{
				assetId: 'maxisnite',
				[kFileTags]: ['maxisnite'],
			},
			{
				assetId: 'darknite',
				[kFileTags]: ['darknite'],
			},
		];
		let variants = expandVariants({ assets });
		expect(variants).to.eql([
			{
				variant: { nightmode: 'standard' },
				dependencies: undefined,
				assets: [
					{ assetId: 'maxisnite' },
				],
			},
			{
				variant: { nightmode: 'dark' },
				dependencies: ['simfox:day-and-nite-mod'],
				assets: [
					{ assetId: 'darknite' },
				],
			},
		]);

	});

	it('handles lhd and rhd variants', function() {

		let assets = [
			{
				assetId: 'rhd',
				[kFileTags]: ['rhd'],
			},
			{
				assetId: 'lhd',
				[kFileTags]: ['lhd'],
			},
		];
		let variants = expandVariants({ assets });
		expect(variants).to.eql([
			{
				variant: { driveside: 'right' },
				dependencies: undefined,
				assets: [
					{ assetId: 'rhd' },
				],
			},
			{
				variant: { driveside: 'left' },
				dependencies: undefined,
				assets: [
					{ assetId: 'lhd' },
				],
			},
		]);

	});

	it('handles cam variants', function() {

		let assets = [
			{
				assetId: 'normal',
				[kFileTags]: [],
			},
			{
				assetId: 'cam',
				[kFileTags]: ['cam'],
			},
		];
		let variants = expandVariants({ assets });
		expect(variants).to.eql([
			{
				variant: { CAM: 'no' },
				dependencies: undefined,
				assets: [
					{ assetId: 'normal' },
				],
			},
			{
				variant: { CAM: 'yes' },
				dependencies: undefined,
				assets: [
					{ assetId: 'cam' },
				],
			},
		]);

	});

});
