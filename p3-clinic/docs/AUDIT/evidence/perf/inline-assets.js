// inline-assets.js — READ-ONLY audit helper (docs/AUDIT/evidence/perf only).
// Inline <style>/<script> byte counts per page (WP core block inline CSS etc).
// Usage: node inline-assets.js
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = __dirname;
const IDS = ['home', 'services', 'team', 'contact', 'book'];
const out = { generatedAt: new Date().toISOString(), pages: {} };
for (const id of IDS) {
  const h = fs.readFileSync(path.join(OUT, 'html-' + id + '.html'), 'utf8');
  const styles = [...h.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)];
  const scripts = [...h.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const inlineStyles = styles.filter((s) => !/id=["']wp-block[^"']*-inline-css/.test(s[0].slice(0, 200)));
  out.pages[id] = {
    styleTags: styles.length,
    styleBytes: styles.reduce((s, x) => s + Buffer.byteLength(x[1], 'utf8'), 0),
    coreInlineStyleTags: styles.length - inlineStyles.length,
    coreInlineStyleBytes: styles.reduce((s, x) => s + Buffer.byteLength(x[1], 'utf8'), 0) - inlineStyles.reduce((s, x) => s + Buffer.byteLength(x[1], 'utf8'), 0),
    scriptTags: scripts.length,
    inlineScriptBytes: scripts.filter((s) => !/src=/.test(s[1])).reduce((s, x) => s + Buffer.byteLength(x[2], 'utf8'), 0),
    inlineScripts: scripts.filter((s) => !/src=/.test(s[1])).map((s) => ({ attrs: s[1].replace(/\s+/g, ' ').trim().slice(0, 90), bytes: Buffer.byteLength(s[2], 'utf8') })),
    totalHtmlBytes: Buffer.byteLength(h, 'utf8'),
  };
  const p = out.pages[id];
  console.log(id.padEnd(9), 'html=' + p.totalHtmlBytes + 'B',
    '| style tags=' + p.styleTags + ' (' + p.styleBytes + 'B, core-inline=' + p.coreInlineStyleBytes + 'B)',
    '| scripts=' + p.scriptTags + ' inline=' + p.inlineScriptBytes + 'B');
  p.inlineScripts.forEach((s) => console.log('        ', s.bytes + 'B', s.attrs));
}
fs.writeFileSync(path.join(OUT, 'inline-assets.json'), JSON.stringify(out, null, 2));
console.log('-> inline-assets.json');
