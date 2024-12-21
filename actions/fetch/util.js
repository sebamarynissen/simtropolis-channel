// # slugify(name)
// Converts an author's name or a package title into a format that sc4pac 
// accepts as group and package names. See https://memo33.github.io/
// sc4pac/#/metadata?id=group for the spec: anything non alphanumeric should 
// become hyphenated.
export function slugify(name) {
	let lc = name.toLowerCase();
	return lc.replaceAll(/[^a-z0-9]+/g, '-');
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
