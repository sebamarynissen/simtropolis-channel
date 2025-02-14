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
		if (!data) return;
		let { usersById } = this.index;
		for (let userData of data.authors) {
			let { id } = userData;
			usersById.set(String(id), userData);
		}
	}

	// ## transform(upload)
	// The transform function applies some transformations to the stex api 
	// response based on our permissions configuration. Most notably this allows 
	// us to strip prefixes from the title as certain authors sometimes prefix 
	// their uploads.
	transform(upload) {
		let config = this.index?.usersById.get(String(upload.uid));
		if (!config) return upload;
		let clone = { ...upload };
		for (let prefix of config.prefixes || []) {
			let regex = new RegExp(`^${prefix}\\b`, 'i');
			clone.title = clone.title
				.replace(regex, '')
				.trim()
				.replace(/^-+/, '')
				.trim();
			clone.aliasEntry = clone.aliasEntry
				.replace(regex, '')
				.replace(/^-+/, '')
				.trim();
		}
		if (config.alias) {
			clone.group = config.alias;
		}
		return clone;
	}

	// ## isUploadAllowed(upload)
	// Returns whether the user that has made the given stex upload - as stex 
	// api response - is actually allowed to do this.
	isUploadAllowed(upload) {
		let permission = this.index.usersById.get(String(upload.uid));
		if (permission?.blocked) return false;
		return true;
	}

	// ## assertUploadAllowed(upload)
	assertUploadAllowed(upload) {
		if (!this.isUploadAllowed(upload)) {
			throw new PermissionsError({
				message: `Author ${upload.uid} is not allowed to upload a package to the channel!`,
				code: 'upload_not_allowed',
			});
		}
	}

	// ## assertPackageAllowed(upload, data)
	// Performs the final check of whether the user of the upload is authorized 
	// to create a package of the given format. We could expand this to handle 
	// DLL permissions etc.
	assertPackageAllowed(upload, data) {
		let permission = this.index.usersById.get(String(upload.uid)) || {};

		// Compile all the names that the user is allowed to upload for.
		let names = [slugify(upload.author), ...permission.groups || []];
		if (permission.alias) names.push(permission.alias);
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

	// ## getGithubUsername(upload)
	// Returns the github username associated with the given upload, so that the 
	// pr generating action can tag them if needed.
	getGithubUsername(upload) {
		let config = this.index.usersById.get(String(upload.uid)) || {};
		return config.github;
	}

}
