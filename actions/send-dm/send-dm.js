import { JSDOM } from 'jsdom';
import FormData from 'form-data';
import parseCookie from 'set-cookie-parser';

async function sendMessage({ to, subject, body }) {
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
	formData.append('messenger_content', body);

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
		throw new Error();
	}

}

const getAuthHeaders = (cookies) => ({
	Cookie: Object.entries({
		...cookies,
		ct_checkjs: '20f8b05aba75f1dcfdae1ad4e4ed0aac',
		ct_timezone: 1,
		ct_fkp_timestamp: Math.floor(Date.now()/1000) - 10,
		ct_ps_timestamp: Math.floor(Date.now()/1000) - 15,
	}).map(([key, value]) => `${key}=${value}`).join('; '),
});
