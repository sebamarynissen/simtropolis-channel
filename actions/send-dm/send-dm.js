import { JSDOM } from 'jsdom';
import FormData from 'form-data';
import parseCookie from 'set-cookie-parser';

const cookies = {
	ips4_login_key: '',
	ips4_device_key: '',
	ips4_member_id: 829517,
};

const headers = () => ({
	Cookie: Object.entries({
		...cookies,
		ct_checkjs: '20f8b05aba75f1dcfdae1ad4e4ed0aac',
		ct_timezone: 1,
		// ct_fkp_timestamp: Math.floor(Date.now()/1000) - 10,
		// ct_ps_timestamp: Math.floor(Date.now()/1000) - 15,
	}).map(([key, value]) => `${key}=${value}`).join('; '),
});

let res = await fetch('https://community.simtropolis.com/messenger/compose', {
	headers: headers(),
});
for (let [key, value] of res.headers) {
	if (key === 'set-cookie') {
		let [cookie] = parseCookie(value);
		if (cookie.name === 'ips4_IPSSessionFront') {
			cookies[cookie.name] = cookie.value;
		}
	}
}

let html = await res.text();
let dom = new JSDOM(html).window;
let { window } = dom;
let { document } = window;
let form = document.querySelector('form[method="post"]');

let formData = new FormData();
for (let input of form.querySelectorAll('input[type="hidden"]')) {
	formData.append(input.getAttribute('name'), input.value);
}
formData.append('messenger_to', 'smf_16');
formData.append('messenger_title', 'Package published');
formData.append('messenger_content', 'This is a test');

let myHeaders = {
	Accept: '*/*',
	'Accept-Encoding': 'gzip, deflate, br, zstd',
	Referer: 'https://community.simtropolis.com/messenger/compose',
	Origin: 'https://community.simtropolis.com',
	...headers(),
	...formData.getHeaders(),
	'Content-Length': formData.getLengthSync(),
};
console.log(myHeaders);
let result = await fetch(form.getAttribute('action'), {
	redirect: 'error',
	method: 'POST',
	body: formData.getBuffer(),
	headers: myHeaders,
});

console.log(result.status);
console.log(await result.text());
