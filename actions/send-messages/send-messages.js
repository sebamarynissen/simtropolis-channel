// # send-messages.js
import core from '@actions/core';
import sendMessage from './send-message.js';
const messages = JSON.parse(core.getInput('messages'));

for (let message of messages) {
	try {
		await sendMessage(message);
	} catch (e) {
		core.warning(`Failed to send dm to ${message.to}: ${e.message}`);
	}
}
