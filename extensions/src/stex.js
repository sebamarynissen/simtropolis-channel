import setup from './setup.js';

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

setup({
	externalId: 'stex',
	channels: ['sc4pac.sebamarynissen.dev'],
	id: () => getIdFromUrl(),
}).then(({ enabled, install, getViewUrl, h }) => {

	// If the current id was not found in one of the channels, we do nothing.
	if (!enabled) return;

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
	button.addEventListener('click', () => install());

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
			href: getViewUrl(),
			target: '_blank',
			style: 'text-decoration: underline;',
		}, 'View on sc4pac website'),
	]));

});
