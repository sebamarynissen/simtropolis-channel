// # errors.js
export class SimtropolisError extends Error {
	code = 'simtropolis_error';
	status = 400;
	constructor(res) {
		super(`Simtropolis returned ${res.status} for ${res.url}`);
		this.status = res.status;
	}
}
