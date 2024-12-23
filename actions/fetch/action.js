// # action.js
import core from '@actions/core';
import fetch from './fetch.js';

const url = core.getInput('url');
const requireMetadata = core.getInput('require-metadata');
console.log({ requireMetadata });
try {
	const { packages, timestamp } = await fetch({
		id: url,
		requireMetadata,
	});

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
