// # parse-dependencies.js
// Some urls that are often used as dependency, but which or not included on the 
// channels, so we match them "as is".
const urls = {
	'http://kurier.simcityplaza.de/details.php?file=5': 'sfbt:essentials',
	'http://kurier.simcityplaza.de/details.php?file=305': 'maxis:buildings-as-props',
	'https://community.simtropolis.com/Documents/RR%20MEGA%20Prop%20Pack%20Vol.%202.3.3': 'rretail:mega-prop-pack-vol2',
	'https://community.simtropolis.com/sc4-maxis-files/': 'maxis:buildings-as-props',
	'https://www.simtropolis.com/stex/index.cfm?page=1&keyword=bsc%20peg&type=all': 'bsc:textures-vol01',
	'https://community.simtropolis.com/files/file/30934-supershk-parking-textures-vol-1/': 'supershk:mega-parking-textures',
	'https://community.simtropolis.com/files/file/11421-porkie-props-vol1-european-street-accessories/': 'porkissimo:jenx-porkie-expanded-porkie-props',
	'https://community.simtropolis.com/files/file/27563-shk-parking-pack/': 'shk:parking-pack',
};

export default function parseDependencies(index, links) {
	let all = [];
	for (let link of links) {

		// Look for any dependencies corresponding to this link. If there are 
		// multiple dependencies, then we'll check if filtering out only the 
		// 100-props-textures subfolder results in a difference.
		let deps = getDependencies(index, link);
		if (!deps) continue;
		if (deps instanceof Map) {
			deps = [...deps.values()];
		}
		deps = [deps].flat().map(dep => {
			if (typeof dep === 'string') {
				return { id: dep };
			} else {
				return dep;
			}
		});
		if (deps.length > 1) {
			let filtered = deps.filter(pkg => {
				return pkg.subfolder === '100-props-textures';
			});
			if (filtered.length > 0) deps = filtered;
		}

		// Cool, now add all those sweet, sweet dependencies.
		for (let pkg of deps) {
			all.push(pkg.id);
		}

	}

	// Avoid duplicates in case there are multiple links. We'll also exclude 
	// simfox's day and night mod because that one is included in the variants!
	let unique = new Set(all);
	unique.delete('simfox:day-and-nite-mod');
	unique.delete('cleanitol');
	unique.delete('simmaster07:extra-cheats-dll');
	unique.delete('cam:colossus-addon-mod');
	return [...unique].sort();

}

// # getDependencies(index, { link, text })
// Performs a heuristic lookup of what could be represented by the given link.
function getDependencies(index, { link, text }) {
	link = link.trim();
	if (!link) return null;

	// Check if we have a raw url match.
	if (urls[link]) return urls[link];

	// Ensure the url can be parsed.
	let url;
	try {
		url = new URL(link);
	} catch {
		console.warn(`Invalid dependency url: ${link}`);
		return null;
	}

	// If this is a simtropolis url, look for the id.
	let { hostname, pathname } = url;
	if (hostname.includes('simtropolis.com')) {
		let id = getSimtropolisId(url);
		if (!id) return null;
		return index.stex[id] ?? `"[${text}](${link})"`;
	} else if (hostname.includes('sc4devotion.com')) {
		if (pathname.includes('bldgprop')) {
			return 't-wrecks:maxis-prop-names-and-query-fix';
		}
		if (!url.pathname.includes('csxlex')) return null;
		let { searchParams } = url;
		let id = searchParams.get('lotGET');
		if (index.sc4d[id]) return index.sc4d[id];
		return `"[${text}](${link})"`;
	} else if (hostname.includes('toutsimcities')) {
		let id = url.pathname.replace(/\/$/).split('/').at(-1);
		return index.tsc[id] ?? `"[${text}](${link})"`;
	} else if (hostname.includes('sc4evermore.com')) {
		let id = url.pathname
			.replace(/\/$/, '')
			.split('/')
			.at(-1)
			.split('-')
			.at(0);
		return index.sc4e[id] ?? `"[${text}](${link})"`;
	}

}

function getSimtropolisId(href) {
	let url = new URL(String(href).replace(/\/(%20|%C2%A0)$/, ''));
	if (url.pathname.includes('.cfm')) {
		return url.searchParams.get('id');
	} else if (url.pathname.includes('index.php')) {
		return url.searchParams.get('showfile');
	} else if (url.pathname.startsWith('/files/file/')) {
		return url.pathname
			.replace(/\/$/, '')
			.split('/')
			.at(-1)
			.split('-')
			.at(0);
	}
}
