import { JSDOM } from 'jsdom';
import FormData from 'form-data';
import parseCookie from 'set-cookie-parser';
import { marked } from 'marked';
import { createHash } from 'node:crypto';

marked.use({
	renderer: {
		code({ text }) {
			let escaped = text
				.replaceAll('<', '&lt;')
				.replaceAll('>', '&gt;')
				.trim();
			return `<pre class="ipsCode">\n${escaped}</pre>`;
		},
	},
});

export default async function sendMessage({ to, subject, body }) {
	if (!process.env.SC4PAC_SIMTROPOLIS_COOKIE) {
		throw new Error(`Please set the SC4PAC_SIMTROPOLIS_COOKIE environment variable to sened a DM!`);
	}
	const auth = process.env.SC4PAC_SIMTROPOLIS_COOKIE
		.split(';')
		.map(cookie => cookie.trim())
		.filter(line => !!line)
		.map(cookie => cookie.trim().split('='));

	const cookies = {
		...Object.fromEntries(auth),
	};

	// Fetch the /messenger/compose page. We'll always need to parse this one 
	// because we need to extract the csrf token from the form and we will also 
	// set the ips4_IPSSessionFront cookie.
	let res = await fetch('https://community.simtropolis.com/messenger/compose', {
		headers: {
			...getAuthHeaders(cookies),
		},
	});
	for (let [key, value] of res.headers) {
		if (key === 'set-cookie') {
			let [cookie] = parseCookie(value);
			if (cookie.name === 'ips4_IPSSessionFront') {
				cookies[cookie.name] = cookie.value;
			}
		}
	}

	// Parse the form.
	let html = await res.text();
	let { document } = new JSDOM(html).window;
	let form = document.querySelector('form[method="post"]');
	let formData = new FormData();
	for (let input of form.querySelectorAll('input[type="hidden"]')) {
		formData.append(input.getAttribute('name'), input.value);
	}
	formData.append('messenger_to', to);
	formData.append('messenger_title', subject);
	let md = marked(body);
	console.log(md);
	formData.append('messenger_content', md);

	// Look for the ct_checkjs value in the html.
	let match = html.match(/["']ct_checkjs["'], ?["'](.*?)["']/);
	if (match) {
		cookies.ct_checkjs = match[1];
	}

	let result = await fetch(form.getAttribute('action'), {
		method: 'POST',
		body: formData.getBuffer(),
		headers: {
			Accept: '*/*',
			'Accept-Encoding': 'gzip, deflate, br, zstd',
			Referer: 'https://community.simtropolis.com/messenger/compose',
			Origin: 'https://community.simtropolis.com',
			'Content-Length': formData.getLengthSync(),
			...getAuthHeaders(cookies),
			...formData.getHeaders(),
		},
	});

	// If the response was redirected, then the message was sent successfully. 
	// Otherwise it failed - most likely due to rate limiting!
	if (!result.redirected) {
		console.log('Status', result.status);
		let text = await result.text();
		console.log(text);
		throw new Error(
			'Simtropolis did not return a redirect status, indicating that the DM could not be sent, likely due to rate limiting.',
		);
	}

}

function md5(value = String(Math.random()*1000 | 0)) {
	return createHash('md5').update(value).digest('hex');
}

const getAuthHeaders = (cookies) => ({
	Cookie: Object.entries({
		...cookies,
		ct_checkjs: '72242b45b84b32e3973c393d6c69811e',
		ct_timezone: 1,
		ct_fkp_timestamp: Math.floor(Date.now()/1000) - 10,
		ct_ps_timestamp: Math.floor(Date.now()/1000) - 15,
	}).map(([key, value]) => `${key}=${value}`).join('; '),
});
