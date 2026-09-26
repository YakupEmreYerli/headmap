// Static checks for the unpacked extension; no dependencies.
// Run: node tools/check.mjs
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const errors = [];
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const manifest = read('manifest.json');

const icons = { ...manifest.icons, ...manifest.action.default_icon };
for (const [size, path] of Object.entries(icons)) {
	if (!existsSync(path)) errors.push(`missing icon ${size}: ${path}`);
}

const locales = readdirSync('_locales');
const messages = Object.fromEntries(locales.map((l) => [l, read(`_locales/${l}/messages.json`)]));
const base = Object.keys(messages[manifest.default_locale]).sort().join();
for (const [locale, table] of Object.entries(messages)) {
	if (Object.keys(table).sort().join() !== base) errors.push(`${locale}: keys differ from ${manifest.default_locale}`);
	// The Chrome Web Store rejects descriptions longer than 132 characters.
	const desc = [...table.extDesc.message].length;
	if (desc > 132) errors.push(`${locale}: extDesc is ${desc} chars (max 132)`);
}

const used = new Set(
	[...readFileSync('popup.html', 'utf8').matchAll(/data-i18n(?:-title)?="(\w+)"/g), ...readFileSync('popup.js', 'utf8').matchAll(/\bt\('(\w+)'/g)].map((m) => m[1])
);
for (const key of used) if (!(key in messages[manifest.default_locale])) errors.push(`unknown message key: ${key}`);

if (errors.length) {
	console.error(errors.join('\n'));
	process.exit(1);
}
console.log(`ok: ${Object.keys(icons).length} icon entries, ${locales.length} locales, ${used.size} message keys in use`);
