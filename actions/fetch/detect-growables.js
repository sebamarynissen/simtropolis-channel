// # detect-growables.js
import path from 'node:path';
import { DBPF, ExemplarProperty, FileType, LotObject } from 'sc4/core';
import { PluginIndex, FileScanner } from 'sc4/plugins';

// # detectGrowables(dir)
export default async function detectGrowables(dir) {

	// Build up the index of all files in the directory.
	let index = new PluginIndex({
		scan: dir,
		core: false,
	});
	await index.build();

	// Figure out which files are for the growables.
	let ploppable = new Set();
	let growable = new Set();
	let glob = new FileScanner('**/*.{sc4lot,sc4desc,dat}', { cwd: dir });
	for await (let file of glob) {
		let dbpf = new DBPF(file);

		// Read in all the lot exemplars in the file, and then determine whether it 
		// is a ploppable lot or not.
		for (let entry of dbpf.exemplars) {
			let exemplar = entry.read();
			let type = exemplar.get(ExemplarProperty.ExemplarType);
			if (type !== ExemplarProperty.ExemplarType.LotConfigurations) continue;

			// Growth stage is what marks a building as ploppable or growable. 0xff 
			// is ploppable.
			let stage = exemplar.get(ExemplarProperty.GrowthStage);
			let target = stage === 0xff ? ploppable : growable;
			target.add(entry.dbpf.file);

			// Now lookup the corresponding building exemplar as well to also put it 
			// in the correct category.
			let iid = exemplar.lotObjects.find(obj => {
				return obj.type === LotObject.Building;
			})?.IID;
			let buildings = index
				.findAll({ type: FileType.Exemplar, instance: iid })
				.filter(entry => {
					let exemplar = entry.read();
					let type = exemplar.get(ExemplarProperty.ExemplarProperty);
					return type === ExemplarProperty.ExemplarType.Building;
				});
			for (let entry of buildings) {
				target.add(entry.dbpf.file);
			}

		}

	}
	return [...growable].map(file => path.relative(dir, file));

}
