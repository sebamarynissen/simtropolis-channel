// # action.js
import core from '@actions/core';
import fetch from './fetch.js';

const url = core.getInput('url');
const result = await fetch({ url });
core.setOutput('message', result.pkg);

