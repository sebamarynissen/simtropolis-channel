// # setup.js
export default async function setup(opts) {
	let plugin = new Plugin(opts);
	let api = {
		install: plugin.install.bind(plugin),
		getViewUrl: plugin.getViewUrl.bind(plugin),
		h,
	};
	let enabled = await plugin.setup();
	return {
		enabled,
		...api,
	};
}

// # Plugin
class Plugin {
	channels = [];
	cacheMinutes = 30;
	index = {};
	id = '';
	externalId = '';
	server = localStorage['sc4pac:server'] || 'http://localhost:51515';

	// ## constructor(opts)
	constructor(opts) {
		let {
			channels = [],
			cacheMinutes = 30,
			externalId = '',
			id: getId,
		} = opts;
		this.channels = [...channels];
		this.cacheMinutes = cacheMinutes;
		this.externalId = externalId;
		this.id = getId();
	}

	// ## setup()
	async setup() {
		await Promise.all([
			ready(),
			this.loadChannel('memo33.github.io/sc4pac/channel'),
			...this.channels.map(channel => this.loadChannel(channel)),
		]);
		return !!this.index[this.id];
	}

	// # fetchWithCache(url)
	// Performs a `fetch()`, but ensures that the result is properly cached for 30 
	// minutes. This means that we only poll the sc4pac channels for new contents 
	// every 30 minutes. We might implement a background script though to clear the 
	// cache on request.
	async fetchWithCache(url) {

		// Check if a cached response exists, and if it does, ensure that it's not 
		// older than 30 minutes.
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
		const { index, externalId } = this;
		let url = `https://${channel}/sc4pac-channel-contents.json`;
		let res = await this.fetchWithCache(url);
		let json = await res.json();
		for (let pkg of json.packages) {
			let ids = (pkg.externalIds || {})[externalId] || [];
			for (let id of ids) {
				if (!index[id]) index[id] = [];
				index[id].push({
					channelUrl: `https://${channel}/`,
					group: pkg.group,
					name: pkg.name,
				});
			}
		}
	}

	// # install()
	// Event handler called when the "Install with sc4pac" buton is clicked.
	async install() {
		let packages = this.index[this.id];
		let payload = packages.map(pkg => {
			return {
				package: `${pkg.group}:${pkg.name}`,
				channelUrl: pkg.channelUrl,
			};
		});
		let body = JSON.stringify(payload);
		try {
			await fetch(`${this.server}/packages.open`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': body.length,
				},
				body,
			});
		} catch {
			this.showDialog();
		}
	}

	// ## showDialog()
	showDialog() {
		let dialog = h('dialog', {
			id: 'sc4pac-config',
			style: 'font-size: 16px; max-width: 640px;',
		});
		let { server } = this;
		document.body.appendChild(dialog);
		let input = h('input', {
			type: 'url',
			required: true,
			value: server,
		});
		let button = h('button', {}, 'Close window');
		let form = h('form', {}, [
			h('label', {}, 'sc4pac server'),
			h('div', {}, [
				input,
				h('button', {}, 'Save'),
			]),
		]);
		let div = h('div', {}, [
			h('p', {}, [
				'Sc4pac needs to be running before you can use this button. For more info, visit ',
				h('a', {
					href: 'https://community.simtropolis.com/forums/topic/762677-sc4pac-lets-write-our-own-package-manager',
					style: 'text-decoration: underline',
				}, 'the official support thread'),
				'.',
			]),
			h('details', {}, [
				h('summary', { style: 'cursor: pointer' }, 'Options'),
				form,
			]),
			h('div', { style: 'margin-top: 8px' }, button),
		]);
		button.addEventListener('click', () => {
			dialog.close();
			dialog.remove();
		});
		form.addEventListener('submit', event => {
			event.preventDefault();
			this.server = localStorage['sc4pac:server'] = input.value;
			dialog.close();
			dialog.remove();
		});
		dialog.appendChild(div);
		dialog.showModal();
	}

	// ## getViewUrl()
	// Returns the url that can be used in an <a> tag to redirect to the sc4pac 
	// website.
	getViewUrl() {
		let [pkg] = this.index[this.id];
		let url = new URL('https://memo33.github.io/sc4pac/channel');
		url.searchParams.set('pkg', `${pkg.group}:${pkg.name}`);
		url.searchParams.set('channel', pkg.channelUrl);
		return url.href;
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
