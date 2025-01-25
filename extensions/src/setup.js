// # setup.js
export default async function setup(opts) {
	if (Array.isArray(opts)) {
		opts = { channels: opts };
	}
	let plugin = new Plugin(opts);
	await plugin.setup();
	return { plugin, h };
}

// # Package
// Represents a single package in one of the channels.
class Package {
	id;
	channelUrl;

	// ## constructor(data)
	constructor(data) {
		let { group, name } = data;
		this.id = `${group}:${name}`;
		this.channelUrl = `${data.channelUrl.replace(/\/^/, '')}/`;
	}

	// ## getInstallPayload()
	getInstallPayload() {
		return {
			package: this.id,
			channelUrl: this.channelUrl,
		};
	}

	// ## getInstallUrl()
	// Returns the url that can be used in an <a> tag when an sc4pac protocol 
	// handler is defined.
	getInstallUrl() {
		let url = new URL('sc4pac:///package');
		url.searchParams.set('pkg', this.id);
		url.searchParams.set('channel', this.channelUrl);
		return url.href;
	}

	// ## getViewUrl()
	// Returns the url that can be used in an <a> tag to redirect to the sc4pac 
	// website.
	getViewUrl() {
		let url = new URL('https://memo33.github.io/sc4pac/channel');
		url.searchParams.set('pkg', this.id);
		url.searchParams.set('channel', this.channelUrl);
		return url.href;
	}

}

// # Plugin
// Class representing the main plugin interface. It's this class that is 
// responsible for loading the correct channels etc.
class Plugin {
	channels = [];
	cacheMinutes = 30;
	index = {};

	// ## constructor(opts)
	constructor(opts) {
		let {
			channels = [],
			cacheMinutes = 30,
		} = opts;
		this.channels = [...channels];
		this.cacheMinutes = cacheMinutes;
	}

	// ## find(exchangeId, externalId)
	// Returns all packages that correspond to the given externalId on the given 
	// exchange.
	find(exchangeId, externalId) {
		return this.index[exchangeId]?.[externalId] ?? [];
	}

	// # install(...pkg)
	// Call this function with a "Package" instance, or an array of packages, to 
	// launch the install logic.
	install(pkg) {
		let url = this.getInstallUrl(pkg);
		window.open(url);
	}

	// ## getInstallUrl(pkg)
	// Returns the install url for the package, or array of packages, using the 
	// sc4pac:// protocol.
	getInstallUrl(pkg) {
		let packages = [pkg].flat();
		let channels = new Set();
		let url = new URL('sc4pac:///package');
		for (let pkg of packages) {
			url.searchParams.append('pkg', pkg.id);
			channels.add(pkg.channelUrl);
		}
		for (let channel of channels) {
			url.searchParams.append('channel', channel);
		}
		return String(url);
	}

	// ## getViewUrl(pkg)
	// Returns the "view on sc4pac website" url for the given (array of)
	// package(s).
	getViewUrl(pkg) {
		let [first] = [pkg].flat();
		return first.getViewUrl();
	}

	// ## setup()
	async setup() {
		await Promise.all([
			ready(),
			this.loadChannel('memo33.github.io/sc4pac/channel'),
			...this.channels.map(channel => this.loadChannel(channel)),
		]);
	}

	// # fetchWithCache(url)
	// Performs a `fetch()`, but ensures that the result is properly cached for 
	// 30 minutes. This means that we only poll the sc4pac channels for new 
	// contents every 30 minutes. We might implement a background script though 
	// to clear the cache on request.
	async fetchWithCache(url) {

		// Check if a cached response exists, and if it does, ensure that it's 
		// not older than 30 minutes.
		const cacheName = 'sc4pac-channels';
		const cache = await window.caches.open(cacheName);
		const cachedResponse = await cache.match(url);
		if (cachedResponse) {
			const dateHeader = cachedResponse.headers.get('X-Cached-Date');
			if (dateHeader) {
				const cachedDate = new Date(dateHeader);
				const now = Date.now();
				const elapsed = (now - cachedDate) / (1000 * 60);
				if (elapsed < this.cacheMinutes) {
					return cachedResponse;
				}
			}
		}

		// Fetch a fresh response and save it to the cache.
		const networkResponse = await fetch(url);
		const responseToCache = networkResponse.clone();

		// Add a custom header to track when the response was cached.
		const updatedHeaders = new Headers(responseToCache.headers);
		updatedHeaders.set('X-Cached-Date', new Date().toISOString());

		// Put in the cache & at last return the actual network request.
		const modifiedResponse = new Response(responseToCache.body, {
			status: responseToCache.status,
			statusText: responseToCache.statusText,
			headers: updatedHeaders,
		});
		await cache.put(url, modifiedResponse);
		return networkResponse;

	}

	// ## loadChannel(chanenl)
	// Loads a specific channel 
	async loadChannel(channel) {
		const { index } = this;
		let url = `https://${channel}/sc4pac-channel-contents.json`;
		let res = await this.fetchWithCache(url);
		let json = await res.json();
		for (let pkg of json.packages) {
			let externals = pkg.externalIds || {};
			for (let [exchangeId, ids] of Object.entries(externals)) {
				let exchange = index[exchangeId] ??= {};
				for (let id of ids) {
					let arr = exchange[id] ??= [];
					arr.push(new Package({
						channelUrl: `https://${channel}`,
						...pkg,
					}));
				}
			}
		}
	}

}

// # ready()
// Returns a promise that resolves when the DOM is ready.
function ready() {
	return new Promise((resolve) => {
		if (
			document.readyState === 'complete' ||
			document.readyState === 'interactive'
		) {
			resolve();
		} else {
			document.addEventListener('DOMContentLoaded', () => resolve());
		}
	});
}

// # h(tag, attrs, children)
// Small helper function for easily generating DOM nodes, inspired by the npm 
// hyperscript module.
function h(tag, attrs = {}, children = []) {
	let node = document.createElement(tag);
	if (!Array.isArray(children)) children = [children];
	for (let child of children) {
		if (typeof child === 'string') {
			node.appendChild(new Text(child));
		} else {
			node.appendChild(child);
		}
	}
	for (let name of Object.keys(attrs)) {
		node.setAttribute(name, attrs[name]);
	}
	return node;
}
