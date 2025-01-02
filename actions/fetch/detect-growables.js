// # detect-growables.js
import path from 'node:path';
import { ExemplarProperty, FileType, LotObject } from 'sc4/core';
import { PluginIndex } from 'sc4/plugins';

// # detectGrowables(dir)
export default async function detectGrowables(dir) {

	// Build up the index of all files in the directory.
	let index = new PluginIndex({
		plugins: dir,
		core: false,
	});
	await index.build();

	// Read in all the lot exemplars in the folder, and thend etermine whether 
	// it is a ploppable lot or not.
	let ploppable = new Set();
	let growable = new Set();
	for (let entry of index) {
		if (entry.type !== FileType.Exemplar) continue;
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

	// Filter out any of the ploppable stuff from the growables, so that when a 
	// building exemplar is re-used on both a ploppable and growable, it doesn't 
	// get excluded.
	for (let file of ploppable) {
		if (growable.has(file)) growable.delete(file);
	}
	return [...growable].map(file => {
		return path
			.relative(dir, file)
			.replace('\\', '/');
	}).sort();

}
