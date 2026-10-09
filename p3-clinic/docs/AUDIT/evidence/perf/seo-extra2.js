// seo-extra2.js — READ-ONLY audit helper (docs/AUDIT/evidence/perf only).
// Titles/robots/canonical/h1 for the non-page URLs (author archive, feed, 404),
// plus the /book/ noindex question and og:image presence check.
// Usage: node seo-extra2.js
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = __dirname;

function grab(h, re, g = 1) { const m = h.match(re); return m ? m[g] : null; }

const out = { generatedAt: new Date().toISOString(), pages: {} };
for (const f of ['author1', 'feed', '404', 'BOOK-uppercase']) {
  const p = path.join(OUT, 'html-' + f + '.html');
  if (!fs.existsSync(p)) { out.pages[f] = 'missing'; continue; }
  const h = fs.readFileSync(p, 'utf8');
  out.pages[f] = {
    bytes: Buffer.byteLength(h, 'utf8'),
    title: grab(h, /<title[^>]*>([\s\S]*?)<\/title>/i),
    robots: grab(h, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i),
    canonical: grab(h, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i),
    canonicalCount: (h.match(/rel=["']canonical["']/gi) || []).length,
    h1Count: (h.match(/<h1[\s>]/gi) || []).length,
    h1Text: [...h.matchAll(/<h1[^>]*>([\s\S]{0,90}?)<\/h1>/gi)].map((m) => m[1].replace(/<[^>]+>/g, '').trim()),
    metaDescription: grab(h, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i),
    ogCount: (h.match(/property=["']og:/gi) || []).length,
    jsonLdCount: (h.match(/application\/ld\+json/gi) || []).length,
    lang: grab(h, /<html[^>]+lang=["']([^"']*)["']/i),
    dir: grab(h, /<html[^>]+dir=["']([^"']*)["']/i),
  };
}

// Any og:image anywhere in the site? (WP core emits none without a plugin/theme code)
const ogScan = {};
for (const id of ['home', 'services', 'team', 'contact', 'book']) {
  const h = fs.readFileSync(path.join(OUT, 'html-' + id + '.html'), 'utf8');
  ogScan[id] = {
    ogTags: [...new Set([...h.matchAll(/property=["'](og:[a-z:]+)["']/gi)].map((m) => m[1]))],
    twitterTags: [...new Set([...h.matchAll(/name=["'](twitter:[a-z:]+)["']/gi)].map((m) => m[1]))],
    generator: [...h.matchAll(/<meta[^>]+name=["']generator["'][^>]*>/gi)].map((m) => m[0]),
    favicon: [...h.matchAll(/<link[^>]+rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*>/gi)].map((m) => m[0]),
    viewport: (h.match(/<meta[^>]+name=["']viewport["'][^>]*>/i) || [])[0] || null,
  };
}
out.siteChrome = ogScan;

fs.writeFileSync(path.join(OUT, 'seo-extra2.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
