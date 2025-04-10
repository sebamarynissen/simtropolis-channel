// # action.js
import core from '@actions/core';
import yn from 'yn';
import fetch from './fetch.js';

const url = core.getInput('url');
const requireMetadata = yn(core.getInput('require-metadata'));
const after = core.getInput('after');
try {
	const {
		packages,
		timestamp,
		notices = [],
		warnings = [],
	} = await fetch({
		id: url,
		after,
		requireMetadata,
	});

	// Log the warnings and notices.
	for (let warning of warnings) {
		core.warning(warning);
	}
	for (let notice of notices) {
		core.notice(notice);
	}

	// Set the proper output variables.
	let hasNewContent = packages.length > 0;
	core.setOutput('packages', JSON.stringify(packages));
	if (timestamp) core.setOutput('timestamp', timestamp);
	core.setOutput('has-new-content', hasNewContent);
	if (!hasNewContent) {
		core.notice('No new content was found.');
	}

} catch (e) {
	core.error(e.message);
	throw e;
}
