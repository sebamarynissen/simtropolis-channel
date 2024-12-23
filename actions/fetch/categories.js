// List of categories used by the STEX mapped to sc4pac subfolders, as per a 
// list sent by Cyclone Boom.
export default {
	// Residential
	101: '200-residential',
	// Commercial
	102: '300-commercial',
	// Industrial
	103: '400-industrial',
	// Agricultural
	104: '410-agriculture',
	// Building Sets
	105: '100-props-textures',

	// Civic & Non-RCI, but sc4pac makes further distinctions here. We solve 
	// this by reading the file descriptor by using the scraping approach. 
	// Ideally the STEX api can return this as well. By default we use 
	// "landmarks" though.
	106: '360-landmarks',
	// 107 = Utilities
	// 108 = Parks & Plazas
	108: '660-parks',
	// 109 = Waterfront
	109: '660-parks',
	// 110 = Transportation
	110: '700-transit',
	// 111 = Automata
	111: '710-automata',
	// 112 = Gameplay Mods
	112: '150-mods',
	// 113 = Graphical Mods
	113: '150-mods',
	// 114 = Cheats are normally DLL's, so they should go in the root.
	114: null,
	// 115 = Tools
	// 116 = Maps
	// 117 = Ready Made Regions
	// 118 = Dependencies
	118: '100-props-textures',
	// 119 = 3ds Models
	// 120 = Obsolete & Legacy
	// 121 = Reference & Info
	// DLL mods go in the root.
	122: null,
};
