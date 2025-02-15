// # descriptor-to-subfolder-test.js
import { expect } from 'chai';
import { descriptorsToSubfolder } from '../api-to-metadata.js';

describe('#descriptorToSubfolder()', function() {

	before(function() {
		Object.defineProperty(this, 'folder', {
			get() {
				return descriptorsToSubfolder(this.test.title.split(',').map(x => x.trim()));
			},
		});
	});

	it('undefined', function() {
		expect(descriptorsToSubfolder(undefined)).to.be.undefined;
	});

	it('mod, residential', function() {
		expect(this.folder).to.equal('200-residential');
	});

	it('residential-re-lot', function() {
		expect(this.folder).to.equal('200-residential');
	});

	it('civics, civics-parks-and-recreation', function() {
		expect(this.folder).to.equal('660-parks');
	});

	it('utilities, utilities-power-nuclear', function() {
		expect(this.folder).to.equal('500-utilities');
	});

	it('services-libraries', function() {
		expect(this.folder).to.equal('600-civics');
	});

});
