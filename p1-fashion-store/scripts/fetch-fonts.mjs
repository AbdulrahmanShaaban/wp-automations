#!/usr/bin/env node
/**
 * fetch-fonts.mjs — self-host Cairo + Inter (Google Fonts, SIL OFL 1.1) inside
 * nilad-theme. No npm dependency: global `fetch` + `node:fs`.
 *
 * Why: the perf audit (docs/AUDIT/perf-seo.md #5/#6) measured the Google Fonts
 * stylesheet as render-blocking (949 ms wasted on the home page) and the swap
 * as a 0.132 CLS shift of the hero h1. Serving the woff2 files from our own
 * origin removes the third-party round trip; functions.php preloads the one
 * critical face.
 *
 * Rules this script holds itself to:
 *   - deterministic: same input -> byte-identical fonts.css (no timestamps,
 *     no hash-map iteration order) and byte-identical woff2 files;
 *   - idempotent: safe to re-run, prints every file it wrote or verified
 *     (never a silent no-op) and deletes woff2 files it no longer references,
 *     so the reported payload is the real payload;
 *   - dedupe by URL: Google returns the SAME variable woff2 for many
 *     weights/subsets, so each unique URL is downloaded exactly once
 *     (310 KB -> 61 KB in the sibling project; same trap here);
 *   - variable weights declared as a RANGE (`font-weight: 200 1000`), not one
 *     rule per weight, so every weight 400-800 the theme uses is covered by a
 *     single file;
 *   - family names stay exactly `Cairo` / `Inter` so the theme.json presets
 *     keep resolving.
 *
 * Run: node scripts/fetch-fonts.mjs        (needs network; safe to re-run)
 */
import { mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const THEME = path.join(ROOT, 'wp-content', 'themes', 'nilad-theme');
const FONT_DIR = path.join(THEME, 'assets', 'fonts');
const CSS_DIR = path.join(THEME, 'assets', 'css');
const CSS_OUT = path.join(CSS_DIR, 'fonts.css');

/**
 * Families, the weight axis to request, and the subsets to keep.
 *
 * `Cairo` is the real UI font (theme.json `--font-family--body`), so it keeps
 * arabic + the Latin subsets. `Inter` is only the Latin fallback behind Cairo in
 * the stack: the audit saw 0 Inter bytes downloaded on every audited page
 * (Cairo already covers Basic Latin), so it ships Latin only — that alone is
 * the difference between ~127 KB and ~210 KB of payload.
 */
const FAMILIES = [
  { name: 'Cairo', axis: 'wght@200..1000', subsets: ['arabic', 'latin-ext', 'latin'] },
  { name: 'Inter', axis: 'wght@100..900', subsets: ['latin'] },
];

// A modern Chrome UA is required or Google answers with static instances
// (one file per weight) instead of variable woff2.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const cssUrl =
  'https://fonts.googleapis.com/css2?' +
  FAMILIES.map((f) => `family=${encodeURIComponent(f.name)}:${f.axis}`).join('&') +
  '&display=swap';

const wanted = new Map(FAMILIES.map((f) => [f.name, new Set(f.subsets)]));

console.log(`==> GET ${cssUrl}`);
const cssRes = await fetch(cssUrl, { headers: { 'User-Agent': UA } });
if (!cssRes.ok) {
  console.error(`css fetch failed: ${cssRes.status} ${cssRes.statusText} — nothing was written.`);
  process.exit(1);
}
const css = await cssRes.text();

// Google's CSS format: a `/* subset */` comment immediately before each @font-face.
const blocks = [...css.matchAll(/\/\*\s*([a-z0-9-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)];
if (!blocks.length) {
  console.error('no @font-face blocks parsed — Google changed the format; review the parser.');
  process.exit(1);
}

const faces = [];
for (const [, subset, body] of blocks) {
  const family = (body.match(/font-family:\s*['"]([^'"]+)['"]/) || [])[1];
  const url = (body.match(/url\((https:\/\/[^)]+\.woff2)\)/) || [])[1];
  const range = (body.match(/unicode-range:\s*([^;]+);/) || [])[1];
  const weight = ((body.match(/font-weight:\s*([^;]+);/) || [])[1] || '').trim();
  if (!family || !url || !range || !wanted.get(family)?.has(subset)) continue;
  faces.push({ family, subset, url, range, weight });
}

if (!faces.length) {
  console.error('no wanted subset survived the filter — review FAMILIES in this script.');
  process.exit(1);
}

// Deterministic order: declared family order, then family/subset/URL name order.
faces.sort(
  (a, b) =>
    FAMILIES.findIndex((f) => f.name === a.family) - FAMILIES.findIndex((f) => f.name === b.family) ||
    a.family.localeCompare(b.family) ||
    a.subset.localeCompare(b.subset) ||
    a.url.localeCompare(b.url)
);

await mkdir(FONT_DIR, { recursive: true });
await mkdir(CSS_DIR, { recursive: true });

// One download per unique URL, whatever the number of rules pointing at it.
const fileFor = new Map();
const kept = new Map(); // file name -> Buffer
const shareNote = new Map(); // file name -> extra subsets that resolve to the same URL

for (const face of faces) {
  if (fileFor.has(face.url)) {
    const existing = fileFor.get(face.url);
    shareNote.set(existing, [...(shareNote.get(existing) || []), face.subset]);
    continue;
  }
  const file = `${face.family.toLowerCase()}-${face.subset}.woff2`;
  const res = await fetch(face.url, { headers: { 'User-Agent': UA } });
  if (!res.ok) {
    console.error(`download failed ${face.url} -> ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.subarray(0, 4).toString('latin1') !== 'wOF2') {
    console.error(`${face.url} is not a woff2 (magic: ${buf.subarray(0, 4).toString('hex')})`);
    process.exit(1);
  }
  fileFor.set(face.url, file);
  kept.set(file, buf);
}

let total = 0;
for (const [file, buf] of kept) {
  const dest = path.join(FONT_DIR, file);
  let state = 'written';
  try {
    state = (await readFile(dest)).equals(buf) ? 'unchanged' : 'rewritten';
  } catch {
    state = 'written';
  }
  if (state !== 'unchanged') await writeFile(dest, buf);
  total += buf.length;
  const shared = shareNote.get(file);
  console.log(
    `  ${file.padEnd(24)} ${String(buf.length).padStart(7)} bytes  ${state}` +
      (shared ? `  (also serves: ${shared.join(', ')})` : '')
  );
}

// Drop woff2 files this run no longer references so the payload stays honest.
for (const entry of (await readdir(FONT_DIR)).sort()) {
  if (!entry.endsWith('.woff2') || kept.has(entry)) continue;
  await rm(path.join(FONT_DIR, entry));
  console.log(`  ${entry.padEnd(24)} ${' '.repeat(7)}          removed (no longer referenced)`);
}

/**
 * One rule per unique (family, subset, url). Variable fonts arrive with the
 * weight already expressed as a range (`200 1000`); static fonts arrive once
 * per weight, and those sharing a URL collapse into the min..max range.
 */
function weightRange(entries) {
  if (entries.some((e) => e.weight.includes(' '))) return entries[0].weight;
  const nums = entries.flatMap((e) => e.weight.split(/\s+/).map(Number)).filter(Number.isFinite);
  return nums.length > 1 ? `${Math.min(...nums)} ${Math.max(...nums)}` : entries[0].weight;
}

const rules = [];
for (const face of faces) {
  const key = `${face.family}|${face.subset}|${face.url}`;
  if (rules.some((r) => r.key === key)) continue;
  const same = faces.filter((f) => `${f.family}|${f.subset}|${f.url}` === key);
  rules.push({ ...face, key, weight: weightRange(same) });
}

const out = [
  '/* Self-hosted Cairo + Inter (SIL Open Font License 1.1).',
  '   Generated by scripts/fetch-fonts.mjs — do not edit by hand.',
  `   Source: ${cssUrl}`,
  '   Subsets: ' +
    FAMILIES.map((f) => `${f.name} ${f.subsets.join('/')}`).join(', ') +
    ' — one download per unique URL, variable weights as ranges.',
  '   Preloaded critical face: cairo-arabic.woff2 (hero h1 + Arabic body). */',
  '',
];

for (const rule of rules) {
  out.push(
    '@font-face {',
    `  font-family: '${rule.family}';`,
    '  font-style: normal;',
    `  font-weight: ${rule.weight};`,
    '  font-display: swap;',
    `  src: url('../fonts/${fileFor.get(rule.url)}') format('woff2');`,
    `  unicode-range: ${rule.range.trim()};`,
    '}',
    ''
  );
}

const cssBody = out.join('\n');
await writeFile(CSS_OUT, cssBody, 'utf8');

console.log(
  `  ${'assets/css/fonts.css'.padEnd(24)} ${String(Buffer.byteLength(cssBody)).padStart(7)} bytes  ${rules.length} @font-face rules`
);
console.log(`==> ${kept.size} woff2 files, ${total} bytes (${(total / 1024).toFixed(1)} KiB) of font payload`);
console.log('==> functions.php preloads assets/fonts/cairo-arabic.woff2 (hero h1 + Arabic body)');