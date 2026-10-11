// Renders docs/banner.en.png and docs/banner.tr.png (1280×640) from docs/brand/banner.html.
// Run: node tools/build-banner.mjs [output dir, default docs]
// No dependencies; needs Chrome or Chromium (CHROME_BIN if it is not on PATH). The committed PNGs
// were rendered with Google Chrome on Linux with Noto Sans installed; other fonts change the layout.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const out = resolve(process.argv[2] ?? join(root, 'docs'));
const read = (path) => readFileSync(join(root, path), 'utf8');

// What the popup shows: MDN's heading elements page, frozen so the banner does not change with MDN.
const PAGE = {
	url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/Heading_Elements",
	title: "<h1>–<h6> HTML section heading elements - HTML | MDN",
	description:
		"The <h1> to <h6> HTML elements represent six levels of section headings. <h1> is the highest section level and <h6> is the lowest. By default, all heading elements create a block-level box in the layout, starting on a new line and taking up the full width available in their containing block.",
	canonical: "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/Heading_Elements",
	robots: "",
	headings: [
		{ index: 0, level: 1, text: "<h1>–<h6> HTML section heading elements", visible: true },
		{ index: 1, level: 2, text: "In this article", visible: true },
		{ index: 2, level: 2, text: "Try it", visible: true },
		{ index: 3, level: 2, text: "Attributes", visible: true },
		{ index: 4, level: 2, text: "Usage notes", visible: true },
		{ index: 5, level: 3, text: "Avoid using multiple <h1> elements on one page", visible: true },
		{ index: 6, level: 3, text: "Specifying a uniform font size for <h1>", visible: true },
		{ index: 7, level: 2, text: "Accessibility", visible: true },
		{ index: 8, level: 3, text: "Navigation", visible: true },
		{ index: 9, level: 3, text: "Nesting", visible: true },
		{ index: 10, level: 3, text: "Labeling section content", visible: true },
		{ index: 11, level: 2, text: "Examples", visible: true },
		{ index: 12, level: 3, text: "All headings", visible: true },
		{ index: 13, level: 3, text: "Example page", visible: true },
		{ index: 14, level: 3, text: "Result", visible: true },
		{ index: 15, level: 4, text: "Heading levels", visible: true },
		{ index: 16, level: 4, text: "Heading order", visible: true },
		{ index: 17, level: 2, text: "Technical summary", visible: true },
		{ index: 18, level: 2, text: "Specifications", visible: true },
		{ index: 19, level: 2, text: "Browser compatibility", visible: true },
		{ index: 20, level: 2, text: "See also", visible: true },
		{ index: 21, level: 3, text: "Related", visible: true },
		{ index: 22, level: 3, text: "Guides", visible: true },
		{ index: 23, level: 3, text: "Reference", visible: true },
		{ index: 24, level: 3, text: "Other", visible: true },
		{ index: 25, level: 2, text: "Help improve MDN", visible: true },
	],
};

// popup.html with chrome.* stubbed: messages come from _locales, the page from PAGE above,
// and "Highlight headings" is switched on before the first paint, with transitions off, so the
// screenshot never catches the switch halfway.
function popupPage(lang) {
	const stub = `<script>
const MSGS = ${read(`_locales/${lang}/messages.json`)};
const PAGE = ${JSON.stringify(PAGE)};
window.chrome = {
	i18n: {
		getUILanguage: () => '${lang}',
		getMessage: (key, subs) => {
			const m = MSGS[key];
			if (!m) return '';
			let s = m.message;
			for (const [name, ph] of Object.entries(m.placeholders ?? {})) {
				s = s.split('$' + name.toUpperCase() + '$').join((subs || [])[Number(ph.content.slice(1)) - 1] ?? '');
			}
			return s;
		},
	},
	tabs: { query: async () => [{ id: 1 }] },
	scripting: { executeScript: async () => [{ result: PAGE }] },
};
</script>`;
	const html = read('popup.html');
	const script = '<script src="popup.js"></script>';
	if (!html.includes('<head>') || !html.includes(script)) throw new Error('popup.html changed; update build-banner.mjs');
	return html
		.replace('<head>', () => `<head><base href="${pathToFileURL(root + '/').href}"><style>*, *::before, *::after { transition: none !important; }</style>`)
		.replace(script, () => `${stub}<script>document.getElementById('highlight').checked = true;</script>${script}`);
}

function findChrome() {
	const names = process.env.CHROME_BIN ? [process.env.CHROME_BIN] : ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser'];
	for (const name of names) {
		try {
			execFileSync(name, ['--version'], { stdio: 'ignore' });
			return name;
		} catch {}
	}
	throw new Error('Chrome not found; set CHROME_BIN');
}

const chrome = findChrome();
mkdirSync(out, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'headmap-banner-'));
try {
	for (const lang of ['en', 'tr']) {
		const popup = join(tmp, `popup-${lang}.html`);
		writeFileSync(popup, popupPage(lang));
		const banner = new URL(pathToFileURL(join(root, 'docs/brand/banner.html')));
		banner.searchParams.set('lang', lang);
		banner.searchParams.set('popup', pathToFileURL(popup).href);
		const png = join(out, `banner.${lang}.png`);
		execFileSync(chrome, [
			'--headless',
			'--hide-scrollbars',
			'--no-first-run',
			`--user-data-dir=${join(tmp, 'profile')}`,
			'--force-device-scale-factor=1',
			'--window-size=1280,640',
			// Light theme whatever the desktop uses; the popup follows prefers-color-scheme.
			'--blink-settings=preferredColorScheme=1',
			// Lets the iframe and the popup's async reads finish before the shot.
			'--virtual-time-budget=3000',
			`--screenshot=${png}`,
			banner.href,
		], { stdio: 'ignore' });
		// Chrome exits 0 even when it could not write the file.
		if (!existsSync(png)) throw new Error(`Chrome did not write ${png}`);
		console.log(`wrote ${png}`);
	}
} finally {
	rmSync(tmp, { recursive: true, force: true });
}
