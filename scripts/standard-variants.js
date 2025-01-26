// # standard-variants.js
const variants = process.env.STANDARD_VARIANTS ?? '';
export default {
	driveside: 'right',
	...Object.fromEntries(variants.split(',').map(line => {
		let [key, value] = line.trim().split('=');
		return [key, value];
	})),
};
