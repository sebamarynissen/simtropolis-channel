function load() {
	const { chrome, browser } = globalThis;
	if (chrome) {
		return chrome;
	} else {
		return {
			action: browser.browserAction,
			tabs: browser.tabs,
			cookies: browser.cookies,
		};
	}
}

export default load();
