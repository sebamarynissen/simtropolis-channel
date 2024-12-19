// # permissions.js
import { slugify } from './util.js';

export class PermissionsError extends Error {
	constructor(opts = {}) {
		super(opts.message || '');
		this.code = opts.code;
	}
}

// # PermissionsApi
// Helper class that can be used for checking whether the given user has 
// sufficient permissions.
export default class PermissionsApi {
	index = {
		usersById: new Map(),
	};

	// ## constructor(data)
	constructor(data) {
		if (!data?.authors) {
			this.index = null;
			return;
		}
		let { usersById } = this.index;
		for (let userData of data.authors) {
			let { id } = userData;
			usersById.set(String(id), userData);
		}
	}

	// ## isUploadAllowed(upload)
	// Returns whether the user that has made the given stex upload - as stex 
	// api response - is actually allowed to do this.
	isUploadAllowed(upload) {
		if (!this.index) return true;
		let permission = this.index.usersById.get(String(upload.uid));
		if (!permission || permission.blocked) return false;
		return true;
	}

	// ## assertPackageAllowed(upload, data)
	// Performs the final check of whether the user of the upload is authorized 
	// to create a package of the given format. We could expand this to handle 
	// DLL permissions etc.
	assertPackageAllowed(upload, data) {
		if (!this.index) return true;
		let permission = this.index.usersById.get(String(upload.uid));
		if (!permission || permission.blocked) return false;

		// Compile all the names that the user is allowed to upload for.
		let names = [slugify(upload.author), ...permission.groups || []];
		for (let pkg of data) {
			if (pkg.assetId || !pkg.group) continue;
			if (!names.includes(pkg.group)) {
				throw new PermissionsError({
					message: `The group name ${pkg.group} cannot be used by ${upload.author}!`,
				});
			}
		}

		// Allowed by default.
		return false;

	}

}
