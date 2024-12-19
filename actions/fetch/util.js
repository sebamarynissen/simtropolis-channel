// # slugify(name)
// Converts the name of the author into a slugged version.
export function slugify(name) {
	let lc = name.toLowerCase();
	return lc.replaceAll(/[\s_]+/g, '-');
}
