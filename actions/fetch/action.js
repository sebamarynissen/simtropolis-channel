// # action.js
import core from '@actions/core';
import fetch from './fetch.js';

const url = core.getInput('url');
await fetch({ url });
