// # object-group-by.js
// Contains the polyfill for Object.groupBy(). Can be removed in the Node.js 
// code once we're on Node 22 in October 2024.
if (typeof Object.groupBy !== 'function') {
	Object.defineProperty(Object, 'groupBy', {
		value(array, callback) {
			let acc = Object.create(null);
			let i = 0;
			for (let el of array) {
				let key = callback(el, i++);
				acc[key] ??= [];
				acc[key].push(el);
			}
			return acc;
		},
		writable: true,
		configurable: true,
		enumerable: false,
	});
}
