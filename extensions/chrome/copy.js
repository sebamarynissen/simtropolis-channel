chrome.runtime.onMessage.addListener(async (message) => {
	await navigator.clipboard.writeText(message.data);
	alert('Authentication credentials have been copied to the clipboard. Please paste them inside the sc4pac gui, but DO NOT share them with anyone!');
});
