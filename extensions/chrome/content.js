'use strict';

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

// # install(packages)
// Even handler called when the "Install with sc4pac" buton is clicked.
async function install(packages) {
	console.log(packages);
	let payload = packages.map(pkg => {
		return {
			package: `${pkg.group}:${pkg.name}`,
			channelUrl: pkg.channelUrl,
		};
	});
	let body = JSON.stringify(payload);
	try {
		await fetch(`http://localhost:51515/packages.open`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': body.length,
			},
			body,
		});
	} catch (e) {
		if (e instanceof TypeError) {
			alert('The gui needs to be running in order to use this button!');
		}
	}
}

// # fetchWithCache(url)
// Performs a `fetch()`, but ensures that the result is properly cached for 30 
// minutes. This means that we only poll the sc4pac channels for new contents 
// every 30 minutes. We might implement a background script though to clear the 
// cache on request.
const MAX_AGE_MINUTES = 30;
async function fetchWithCache(url) {

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
			if (elapsed < MAX_AGE_MINUTES) {
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

// # load(channel)
// Loads a specific channel 
let packagesById = {};
async function load(channel) {
	let url = `https://${channel}/sc4pac-channel-contents.json`;
	let res = await fetchWithCache(url);
	let json = await res.json();
	for (let pkg of json.packages) {
		let { stex = [] } = pkg.externalIds || {};
		for (let id of stex) {
			if (!packagesById[id]) packagesById[id] = [];
			packagesById[id].push({
				channelUrl: `https://${channel}/`,
				group: pkg.group,
				name: pkg.name,
			});
		}
	}
}

// # getIdFromUrl(url = window.location.href)
// Extracts the file id from the Simtropolis urL.
function getIdFromUrl(url = window.location.href) {
	return new URL(url)
		.pathname
		.replace(/\/$/, '')
		.split('/')
		.reverse()[0]
		.split('-')[0];
}

// Main functionality.
(async function() {
	
	// Load both the default and the Simtropolis channel.
	await Promise.all([
		ready(),
		load('memo33.github.io/sc4pac/channel'),
		load('sc4pac.sebamarynissen.dev'),
	]);

	// Get the file id form the url, and then check whether any packages match.
	let id = getIdFromUrl();
	if (packagesById[id]) {

		// Add the necessary css as well.
		let style = h('style');
		document.head.append(style);
		style.sheet.insertRule(
			'button#install-sc4pac { transition: background 0.3s ease; background: black; }',
			style.sheet.cssRules.length,
		);
		style.sheet.insertRule(
			'button#install-sc4pac:hover { background: #272822; }',
			style.sheet.cssRules.length,
		);

		// Create the button DOM node.
		let button = h('button', {
			id: 'install-sc4pac',
			class: 'ipsButton ipsButton_fullWidth ipsButton_large',
			style: 'font-weight: 600; color: white; display: flex; align-items: center; justify-content: center;',
		}, [
			h('i', { class: 'fa fa-download fa-lg' }),
			'\u00A0\u00A0Install with sc4pac',
		]);
		button.addEventListener('click', () => install(packagesById[id]));

		// Insert the generated button right below the "Download file" button.
		let a = [...document.querySelectorAll('a.ipsButton')].find(a => {
			let href = a.getAttribute('href');
			if (!href) return false;
			try {
				let url = new URL(href);
				return url.searchParams.get('do') === 'download';
			} catch {
				return false;
			}
		});
		let li = h('li', {
			style: 'filter:drop-shadow(0px 3px 3px #000000);',
		}, [button]);
		a.closest('ul').appendChild(li);

	}

})();
