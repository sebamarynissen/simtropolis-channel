// # slugify(name)
// Converts the name of the author into a slugged version.
export function slugify(name) {
	let lc = name.toLowerCase();
	return lc.replaceAll(/[\s_]+/g, '-');
}

// # urlToFileId(href)
export function urlToFileId(href) {
	return +new URL(href).pathname
		.replace(/\/$/, '')
		.split('/')
		.at(-1)
		.split('-')
		.at(0);
}
