// # detect-growables-test.js
import { expect } from 'chai';
import path from 'node:path';
import detectGrowables from '../detect-growables.js';

describe('The function detecting the growable files', function() {

	it('finds all growable files', async function() {

		let dir = path.join(import.meta.dirname, 'detect-growables');
		let growables = await detectGrowables(dir);
		expect(growables).to.have.length(2);
		expect(growables).to.include.members(['growable.SC4Desc', 'growable.SC4Lot']);

	});

});
