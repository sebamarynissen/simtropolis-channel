// # faker.js
import { slugify } from '../util.js';
import { faker } from '@faker-js/faker';

// # file(file)
// Generates a fake file record
export function file(file = {}) {
	let {
		metadata = '',
		...rest
	} = file;
	return {
		id: faker.number.int(1_000_000),
		name: faker.system.commonFileName('zip'),

		// Assume that by default every file has at least a metadata.yaml file 
		// set. Can be overridden though to mock files without metadata.
		contents: {
			'metadata.yaml': metadata,
		},
		...rest,

	};
}

// # upload(upload)
// Generates a fake upload record.
export function upload(upload = {}) {
	let {
		files = 1,
		id = faker.number.int(1_000_000),
		title = faker.company.name(),
		aliasEntry = slugify(title),
		updated = faker.date.past(),
		submitted = faker.date.past({ refDate: updated }),
		images = faker.number.int(5),
		description = faker.lorem.paragraphs(3, '\n\n'),
		...rest
	} = upload;
	if (typeof files === 'number') {
		files = new Array(files).fill();
	}
	if (typeof images === 'number') {
		images = new Array(images).fill().map(() => {
			return new URL(
				faker.system.commonFileName('jpg'),
				faker.internet.url(),
			).href;
		});
	}
	return {
		id,
		uid: faker.number.int(10_000),
		cid: faker.number.int(106),
		author: faker.internet.username(),
		title,
		aliasEntry,
		release: faker.system.semver(),
		fileURL: `https://community.simtropolis.com/files/file/${id}-${aliasEntry}`,
		submitted: formatDate(submitted),
		updated: formatDate(updated),
		description,
		images,
		files: files.map(props => {
			if (typeof props === 'string') {
				return file({ name: props });
			} else {
				return file(props);
			}
		}),
		...rest,
	};
}

// # uploads()
// Generates a number of fake uploads.
export function uploads(props = faker.number.int({ min: 1, max: 25 })) {
	if (typeof props === 'number') {
		props = new Array(props).fill();
	}
	return props.map(props => {
		if (typeof props === 'string') {
			props = new Date(props);
		}
		if (props instanceof Date) {
			props = { updated: props };
		}
		return upload(props);
	});
}

// # pkg()
// Generates fake metadata for a package. Note that it does not include assets, 
// variants or dependencies. Those should be added yourself.
export function pkg(opts = {}) {
	let {
		id = faker.number.int(1_000_000),
		author = faker.internet.username(),
		summary = faker.company.name(),
		group = slugify(author),
		name = slugify(summary),
		version = faker.system.semver(),
		description = faker.lorem.paragraphs(2),
		subfolder = '150-mods',
	} = opts;
	return {
		group,
		name,
		version,
		subfolder,
		info: {
			summary,
			description,
			author,
			website: `https://community.simtropolis.com/files/file/${id}-${name}`,
		},
	};
}

function formatDate(date) {
	if (typeof date === 'string') return date;
	return date.toISOString().slice(0, 19).replace('T', ' ');
}
