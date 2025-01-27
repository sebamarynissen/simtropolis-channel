// # standard-deps.js
const env = process.env.STANDARD_DEPENDENCIES ?? '';
export default [
	'memo:essential-fixes',
	'memo:transparent-texture-fix-dll',
	'memo:region-thumbnail-fix-dll',
	'peg:oops-mod',
	'simmaster07:sc4fix',
	'simmaster07:extra-cheats-dll',
	...env.split(',').map(x => x.trim()).filter(Boolean),
];
