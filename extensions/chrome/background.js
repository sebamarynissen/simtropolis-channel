chrome.action.onClicked.addListener(tab => {
	console.log('wut');
	chrome.cookies.getAll({ url: tab.url }, cookies => {
		let map = cookies.reduce((map, cookie) => {
			map[cookie.name] = cookie.value;
			return map;
		}, {});
		if (map.ips4_device_key && map.ips4_member_id && map.ips4_login_key) {
			let value = [
				`ips4_device_key=${map.ips4_device_key}`,
				`ips4_member_id=${map.ips4_member_id}`,
				`ips4_login_key=${map.ips4_login_key}`,
			].join('; ');
			chrome.tabs.sendMessage(tab.id, {
				action: 'copy_cookie',
				data: value,
			});
		}
	});
});

// Only enable the extension on simtropolis.com
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (tab.url && tab.url.startsWith('https://community.simtropolis.com')) {
		chrome.action.enable(tabId);
		chrome.action.setIcon({
			tabId,
			path: {
				44: 'icon-44.png',
				128: 'icon-128.png',
			},
		});
	} else {
		chrome.action.disable(tabId);
		chrome.action.setIcon({
			tabId,
			path: {
				44: 'icon-44-disabled.png',
				128: 'icon-128-disabled.png',
			},
		});
	}
});
