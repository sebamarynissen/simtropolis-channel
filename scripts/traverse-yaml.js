// # traverse-yaml.js
// Utility function for easily traversing and modifying yaml in bulk.
import path from 'node:path';
import fs from 'node:fs';
import { Glob } from 'glob';
import { Document, parseAllDocuments } from 'yaml';
import stylizeDoc from '../actions/fetch/stylize-doc.js';

const defaultToStringOptions = {
	lineWidth: 0,
};

// # traverse(patterns, fn)
export default async function traverse(patterns, fn = () => {}, opts = {}) {
	const {
		stylize = true,
		cwd = path.resolve(import.meta.dirname, '../src'),
		...restOptions
	} = opts;
	const glob = new Glob(patterns, {
		absolute: true,
		nodir: true,
		nocase: true,
		cwd,
	});
	for await (let file of glob) {
		let contents = String(await fs.promises.readFile(file));
		let docs = [];
		let changed;
		for (let doc of parseAllDocuments(contents)) {
			let raw = contents.slice(doc.range[0], doc.range[1]);
			let json = doc.toJSON();
			let result = await fn(json, doc, raw, file);
			if (result) {
				if (result instanceof Document) {
					docs.push(result);
				} else {
					docs.push(new Document(result));
				}
				changed = true;
			} else {
				docs.push(doc);
			}
		}
		if (changed) {
			let buffer = docs.map((doc, i) => {
				doc.directives.docStart = i > 0;
				if (stylize) {
					stylizeDoc(doc);
				}
				return doc.toString({
					...defaultToStringOptions,
					...restOptions,
				});
			}).join('\n');
			await fs.promises.writeFile(file, buffer);
		}
	}
}
