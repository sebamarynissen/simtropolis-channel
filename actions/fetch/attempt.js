// # attempt(fn)
// Helper function that mimicks the "safe assignment operator" proposal.
export default async function attempt(fn) {
	try {
		return [null, await fn()];
	} catch (e) {
		return [e, null];
	}
}
