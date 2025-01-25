import setup from './setup.js';

// # getIdFromUrl(url = window.location.href)
// Extracts the file id from the Simtropolis urL.
function getIdFromUrl(url = window.location.href) {
	let { pathname } = new URL(url);
	if (!pathname.startsWith('/files/file')) return;
	return pathname.replace(/\/$/, '')
		.split('/')
		.reverse()[0]
		.split('-')[0];
}

setup(['sc4pac.simtropolis.com']).then(({ plugin, h }) => {
	let id = getIdFromUrl();
	if (!id) return;
	let packages = plugin.find('stex', id);
	if (packages.length === 0) return;

	// Add the necessary css as well.
	let style = h('style');
	document.head.append(style);
	style.sheet.insertRule(
		'#install-sc4pac { transition: background 0.3s ease; background: black; }',
		style.sheet.cssRules.length,
	);
	style.sheet.insertRule(
		'#install-sc4pac:hover { background: #272822; }',
		style.sheet.cssRules.length,
	);

	// Create the button DOM node.
	let button = h('a', {
		href: plugin.getInstallUrl(packages),
		id: 'install-sc4pac',
		class: 'ipsButton ipsButton_fullWidth ipsButton_large',
		style: 'font-weight: 600; color: white; display: flex; align-items: center; justify-content: center;',
	}, [
		h('i', { class: 'fa fa-download fa-lg' }),
		'\u00A0\u00A0Install with sc4pac',
	]);

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

	let ul = a.closest('ul');
	ul.appendChild(li);

	// Add a normal link as well.
	ul.appendChild(h('li', {
		style: 'text-align: right',
	}, [
		h('a', {
			href: plugin.getViewUrl(packages),
			target: '_blank',
			style: 'text-decoration: underline;',
		}, 'View on sc4pac website'),
	]));

});
