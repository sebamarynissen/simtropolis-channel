// # description-parser.js
import TurndownService from 'turndown';

// # parseDescription(node)
// This function accepts an HTML node and converts it back to markdown. This is 
// useful for automatically converting the Simtropolis description into 
// something more readable as a description.
export default function parseDescription(node) {
	let text = td.turndown(node)
		.replaceAll('\xa0', ' ');
	return text;
}

// Setup the turndown service with the options used to transform html to markdown.
const td = new TurndownService({
	headingStyle: 'atx',
	bulletListMarker: '-',
	emDelimiter: '*',
});

// Lists aren't always rendered as <li> in the description, but sometimes as 
// paragraphs starting with a hyphen -. We'll handle this case here.
td.addRule('p-list', {
	filter(node) {
		if (node.nodeName !== 'P') return;
		let text = node.textContent.trim();
		if (/^[-*]/.test(text)) return true;
		return false;
	},
	replacement(content) {
		let polished = content
			.replace(/^\\/, '')
			.replaceAll(/^[-*](\w)?/g, '- $1');
		return ` ${polished}\n`;
	},
});

// Filter out unnecessary spaces from paragraphs.
td.addRule('p', {
	filter(node) {
		return node.nodeName === 'P';
	},
	replacement: content => `${content.trim()}\n\n`,
});

// Sometimes a true list contains a <p> immediately after it. No need to insert newlines in that case.
td.addRule('li > p', {
	filter(node) {
		if (node.nodeName !== 'P') return;
		let parent = node.parentElement;
		return parent.nodeName === 'LI';
	},
	replacement: content => content,
});

// The button indicating that this is a popular file has to be ignored.
td.addRule('popular', {
	filter(node) {
		if (node.nodeName !== 'DIV') return;
		let img = node.querySelector('img');
		if (!img) return;
		let src = img.getAttribute('src') || '';
		return src.includes('big-heart-icon.png');
	},
	replacement: () => '',
});

// Transform iframes into links.
td.addRule('iframe', {
	filter(node) {
		if (node.nodeName !== 'IFRAME') return;
		let src = node.getAttribute('src');
		let url = new URL(src, 'https://community.simtropolis.com');
		return url.hostname.includes('community.simtropolis.com');
	},
	replacement: (_content, node) => {
		let src = node.getAttribute('src');
		return `[${src}](${src})\n`;
	},
});
