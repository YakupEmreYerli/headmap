/*
 * Headmap — reads the active tab's title, meta description, canonical,
 * robots and H1–H6 outline. "Copy as text" puts everything on the clipboard
 * as an indented outline (for a doc or an AI chat); "Copy as table" puts the
 * same data as tab-separated rows, which spreadsheets split into columns.
 *
 * No background worker, no network, no storage: the popup injects one
 * function into the tab when it opens (activeTab + scripting) and that is it.
 */

const t = (key, ...subs) => chrome.i18n.getMessage(key, subs.map(String)) || key;

/** Runs in the page: collects the SEO skeleton. */
function readPage() {
	const meta = (selector) => document.querySelector(selector)?.getAttribute('content')?.trim() ?? '';
	const isVisible = (el) => {
		const style = getComputedStyle(el);
		const rect = el.getBoundingClientRect();
		// Visually hidden headings (sr-only) are flagged: search engines
		// still read them, visitors don't see them.
		return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 2 && rect.height > 2;
	};
	const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((el, index) => {
		el.dataset.headmap = String(index);
		return {
			index,
			level: Number(el.tagName[1]),
			text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
			visible: isVisible(el)
		};
	});
	return {
		url: location.href,
		title: document.title.trim(),
		description: meta('meta[name="description"]'),
		canonical: document.querySelector('link[rel="canonical"]')?.href ?? '',
		robots: meta('meta[name="robots"]'),
		headings
	};
}

/** Runs in the page: outlines every heading and prefixes an H-badge. */
function highlightHeadings(on) {
	const STYLE_ID = 'headmap-style';
	document.getElementById(STYLE_ID)?.remove();
	document.querySelectorAll('.headmap-badge').forEach((el) => el.remove());
	if (!on) return;
	const colors = { 1: '#26282e', 2: '#d97a00', 3: '#1f8a3a', 4: '#2563c9', 5: '#7c4dcc', 6: '#8a8f98' };
	const style = document.createElement('style');
	style.id = STYLE_ID;
	style.textContent = Object.entries(colors)
		.map(([n, c]) => `h${n}{outline:2px dashed ${c} !important;outline-offset:2px !important;}`)
		.join('');
	document.head.appendChild(style);
	document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((el) => {
		const level = el.tagName[1];
		const badge = document.createElement('span');
		badge.className = 'headmap-badge';
		badge.textContent = `H${level}`;
		badge.style.cssText = `display:inline-block;margin-right:6px;padding:0 5px;border-radius:4px;font:800 11px/18px system-ui;color:#fff;background:${colors[level]};vertical-align:middle;`;
		el.prepend(badge);
	});
}

/** Runs in the page: scrolls to a heading and flashes it. */
function revealHeading(index) {
	const el = document.querySelector(`[data-headmap="${index}"]`);
	if (!el) return;
	el.scrollIntoView({ behavior: 'smooth', block: 'center' });
	const previous = el.style.backgroundColor;
	el.style.backgroundColor = 'rgba(45, 212, 191, 0.3)';
	setTimeout(() => (el.style.backgroundColor = previous), 1400);
}

const $ = (selector) => document.querySelector(selector);
let page = null;
let tabId = null;

function toast(message) {
	const el = $('#toast');
	el.textContent = message;
	el.hidden = false;
	clearTimeout(toast.timer);
	toast.timer = setTimeout(() => (el.hidden = true), 1600);
}

const escapeHtml = (s) =>
	s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const length = (s) => [...s].length;

/** A labelled field; `limit` turns the character count red when exceeded. */
function field(label, value, limit) {
	const count = value
		? `<span class="count${limit && length(value) > limit ? ' over' : ''}">${t('chars', length(value))}</span>`
		: '';
	return `<div class="field"><p class="label">${label} ${count}</p><p class="value${value ? '' : ' missing'}">${value ? escapeHtml(value) : t('none')}</p></div>`;
}

function render() {
	const counts = [1, 2, 3, 4, 5, 6].map((n) => page.headings.filter((h) => h.level === n).length);
	const warnings = [];
	if (counts[0] === 0) warnings.push(t('noH1'));
	if (counts[0] > 1) warnings.push(t('multipleH1', counts[0]));

	let previous = 0;
	const rows = page.headings
		.map((h) => {
			// A skipped level (H2 straight to H4) paints the indent red.
			const skipped = previous > 0 && h.level > previous + 1;
			previous = h.level;
			const hidden = h.visible ? '' : `<span class="hidden-tag">(${t('hidden')})</span>`;
			return `<li class="${skipped ? 'skipped' : ''}"><span class="indent">${'•'.repeat(h.level - 1)}</span><span class="badge h${h.level}">H${h.level}</span><span class="text${h.visible ? '' : ' is-hidden'}" data-index="${h.index}">${escapeHtml(h.text) || t('empty')}${hidden}</span></li>`;
		})
		.join('');

	$('#report').innerHTML = `
		${field(t('title'), page.title, 60)}
		${field(t('metaDescription'), page.description, 160)}
		${field(t('canonical'), page.canonical)}
		${page.robots ? field(t('robots'), page.robots) : ''}
		<div class="summary">
			${counts.map((n, i) => (n ? `<span>H${i + 1}: ${n}</span>` : '')).join('')}
			${warnings.map((w) => `<span class="warning">${w}</span>`).join('')}
		</div>
		<ul class="outline">${rows || `<li class="muted">${t('noHeadings')}</li>`}</ul>`;

	$('#report')
		.querySelectorAll('.text')
		.forEach((el) =>
			el.addEventListener('click', () =>
				chrome.scripting.executeScript({ target: { tabId }, func: revealHeading, args: [Number(el.dataset.index)] })
			)
		);
}

function asText() {
	const outline = page.headings.map(
		(h) => `${'  '.repeat(h.level - 1)}H${h.level}: ${h.text}${h.visible ? '' : ` (${t('hidden')})`}`
	);
	return [
		`URL: ${page.url}`,
		`${t('title')} (${length(page.title)}): ${page.title}`,
		`${t('metaDescription')} (${length(page.description)}): ${page.description || t('none')}`,
		`${t('canonical')}: ${page.canonical || t('none')}`,
		...(page.robots ? [`${t('robots')}: ${page.robots}`] : []),
		'',
		`${t('headings')}:`,
		...outline
	].join('\n');
}

/** Tab-separated rows: Excel and Google Sheets split them into columns on paste. */
function asTable() {
	const cell = (s) => String(s).replace(/[\t\n]+/g, ' ');
	const rows = [
		[t('field'), t('level'), t('text')],
		[t('title'), '', page.title],
		[t('metaDescription'), '', page.description],
		[t('canonical'), '', page.canonical],
		...page.headings.map((h) => [t('heading'), `H${h.level}`, h.text])
	];
	return rows.map((r) => r.map(cell).join('\t')).join('\n');
}

async function copy(text, message) {
	await navigator.clipboard.writeText(text);
	toast(message);
}

async function main() {
	document.documentElement.lang = chrome.i18n.getUILanguage();
	document.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
	document.querySelectorAll('[data-i18n-title]').forEach((el) => (el.title = t(el.dataset.i18nTitle)));

	// `?tab=<id>` lets the popup be opened as a normal page (tests, screenshots).
	const forced = Number(new URLSearchParams(location.search).get('tab'));
	tabId = forced || (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id;

	try {
		const [result] = await chrome.scripting.executeScript({ target: { tabId }, func: readPage });
		page = result.result;
		render();
	} catch {
		$('#report').innerHTML = `<p class="muted">${t('cantRead')}</p>`;
		return;
	}

	$('#copy-text').addEventListener('click', () => copy(asText(), t('copiedText')));
	$('#copy-table').addEventListener('click', () => copy(asTable(), t('copiedTable')));
	$('#highlight').addEventListener('change', (e) =>
		chrome.scripting.executeScript({ target: { tabId }, func: highlightHeadings, args: [e.target.checked] })
	);
}

main();
