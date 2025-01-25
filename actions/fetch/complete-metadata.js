// # complete-metadata.js
import scrape from './scrape.js';

// # completeMetadata(metadata, json)
// Completes the metadata parsed from the api response with the description, 
// images and subfolder. For the moment we need to use HTML scraping for this, 
// as those fields are not yet included in the STEX api.
export default async function completeMetadata(metadata, json) {

	// Read the description, images & subfolder, and then complete the metadata 
	// with it.
	let { description, images, subfolder } = await scrape(json.fileURL);
	let { package: pkg } = metadata;
	let { info } = pkg;
	if (!info.description) {
		info.description = description
			.split('\n')
			.map(line => line.trimEnd())
			.join('\n')
			.replace(/(\n\s*){3,}/g, '\n\n');
	}
	if (!info.images) {
		info.images = images;
	}
	pkg.subfolder = subfolder;

}
