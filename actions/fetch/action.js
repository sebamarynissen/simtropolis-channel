// # action.js
import core from '@actions/core';
import fetch from './fetch.js';

const url = core.getInput('url');
const requireMetadata = core.getInput('require-metadata');
const result = await fetch({
	id: url,
	requireMetadata,
});
core.setOutput('message', result.message);
