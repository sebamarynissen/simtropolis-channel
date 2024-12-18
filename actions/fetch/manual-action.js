// # manual-action.js
import { program } from 'commander';
import fetch from './fetch.js';

program
	.argument('<id>', 'The id of the file on the STEX. Can also be a url')
	.action(async id => {
		await fetch({ id });
	});

program.parse();
