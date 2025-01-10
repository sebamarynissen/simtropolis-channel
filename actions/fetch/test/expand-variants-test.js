// # expand-variants-test.js
import { expect } from 'chai';
import { kFileTags } from '../symbols.js';
import { expandVariants } from '../complete-metadata.js';

describe('#expandVariants()', function() {

	it('handles maxisnite and darknite variants', async function() {

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
		let variants = await expandVariants({ assets });
		expect(variants).to.eql([
			{
				variant: { nightmode: 'standard' },
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

	it('handles lhd and rhd variants', async function() {

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
		let variants = await expandVariants({ assets });
		expect(variants).to.eql([
			{
				variant: { driveside: 'right' },
				assets: [
					{ assetId: 'rhd' },
				],
			},
			{
				variant: { driveside: 'left' },
				assets: [
					{ assetId: 'lhd' },
				],
			},
		]);

	});

	it('handles HD variants without explicit SD variant', async function() {

		let assets = [
			{
				assetId: 'normal',
				[kFileTags]: [],
			},
			{
				assetId: 'hd',
				[kFileTags]: ['hd'],
			},
		];
		let variants = await expandVariants({ assets });
		expect(variants).to.eql([
			{
				variant: { resolution: 'sd' },
				assets: [
					{ assetId: 'normal' },
				],
			},
			{
				variant: { resolution: 'hd' },
				assets: [
					{
						assetId: 'normal',
						exclude: ['.SC4Model$'],
					},
					{ assetId: 'hd' },
				],
			},
		]);

	});

	it('handles HD variants with explicit SD variant', async function() {

		let assets = [
			{
				assetId: 'lots',
				[kFileTags]: [],
			},
			{
				assetId: 'sd',
				[kFileTags]: ['sd'],
			},
			{
				assetId: 'hd',
				[kFileTags]: ['hd'],
			},
		];
		let variants = await expandVariants({ assets });
		expect(variants).to.eql([
			{
				variant: { resolution: 'sd' },
				assets: [
					{ assetId: 'lots' },
					{ assetId: 'sd' },
				],
			},
			{
				variant: { resolution: 'hd' },
				assets: [
					{ assetId: 'lots' },
					{ assetId: 'hd' },
				],
			},
		]);

	});

	it('a package with maxisnite/darknite, cam & hd variants', async function() {

		let assets = [
			{
				assetId: 'maxisnite',
				[kFileTags]: ['maxisnite'],
			},
			{
				assetId: 'darknite',
				[kFileTags]: ['darknite'],
			},
			{
				assetId: 'cam',
				[kFileTags]: ['cam'],
			},
			{
				assetId: 'maxisnite-hd',
				[kFileTags]: ['maxisnite', 'hd'],
			},
			{
				assetId: 'darknite-hd',
				[kFileTags]: ['darknite', 'hd'],
			},
		];
		let variants = await expandVariants({ assets });
		expect(variants).to.eql([
			{
				variant: { nightmode: 'standard', CAM: 'no', resolution: 'sd' },
				assets: [
					{ assetId: 'maxisnite' },
				],
			},
			{
				variant: { nightmode: 'standard', CAM: 'no', resolution: 'hd' },
				assets: [
					{ assetId: 'maxisnite', exclude: ['.SC4Model$'] },
					{ assetId: 'maxisnite-hd' },
				],
			},
			{
				variant: { nightmode: 'standard', CAM: 'yes', resolution: 'sd' },
				assets: [
					{ assetId: 'maxisnite' },
					{ assetId: 'cam' },
				],
			},
			{
				variant: { nightmode: 'standard', CAM: 'yes', resolution: 'hd' },
				assets: [
					{ assetId: 'maxisnite', exclude: ['.SC4Model$'] },
					{ assetId: 'cam' },
					{ assetId: 'maxisnite-hd' },
				],
			},
			{
				variant: { nightmode: 'dark', CAM: 'no', resolution: 'sd' },
				dependencies: ['simfox:day-and-nite-mod'],
				assets: [
					{ assetId: 'darknite' },
				],
			},
			{
				variant: { nightmode: 'dark', CAM: 'no', resolution: 'hd' },
				dependencies: ['simfox:day-and-nite-mod'],
				assets: [
					{ assetId: 'darknite', exclude: ['.SC4Model$'] },
					{ assetId: 'darknite-hd' },
				],
			},
			{
				variant: { nightmode: 'dark', CAM: 'yes', resolution: 'sd' },
				dependencies: ['simfox:day-and-nite-mod'],
				assets: [
					{ assetId: 'darknite' },
					{ assetId: 'cam' },
				],
			},
			{
				variant: { nightmode: 'dark', CAM: 'yes', resolution: 'hd' },
				dependencies: ['simfox:day-and-nite-mod'],
				assets: [
					{ assetId: 'darknite', exclude: ['.SC4Model$'] },
					{ assetId: 'cam' },
					{ assetId: 'darknite-hd' },
				],
			},
		]);

	});

});
