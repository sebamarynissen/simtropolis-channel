// # escape(str)
// Escapes regex characters from a string, but only if needed. sc4pac only 
// treats exclusion patterns as regexes as soon as it finds a regex character.
export default function escape(str, fn = x => x) {
	if (str.match(/[*+?^${}()|[\]\\]/)) {
		let chars = /[.*+?^${}()|[\]\\/]/g;
		return fn(`${str.replaceAll(chars, '\\$&')}`);
	} else {
		return str;
	}
}
