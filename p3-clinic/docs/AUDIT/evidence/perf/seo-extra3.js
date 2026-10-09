// seo-extra3.js — READ-ONLY audit helper (docs/AUDIT/evidence/perf only).
// Canonical correctness on duplicate-URL variants (case, query, index.php).
// Usage: node seo-extra3.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE = 'http://localhost:8889';
const OUT = __dirname;

function get(url) {
  return new Promise((resolve) => {
    http.get(url, { timeout: 120000 }, (res) => {
      let b = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, html: b }));
    }).on('error', (e) => resolve({ status: 0, headers: {}, html: '', error: String(e) }));
  });
}

const VARIANTS = [
  '/BOOK/', '/Book/', '/book/?utm_source=x', '/book/?page_id=7', '/index.php/book/',
  '/SERVICES/', '/services/?utm_source=x', '/TEAM/', '/CONTACT/',
];

(async () => {
  const out = { generatedAt: new Date().toISOString(), base: BASE, variants: {} };
  for (const v of VARIANTS) {
    const r = await get(BASE + v);
    const h = r.html;
    out.variants[v] = {
      status: r.status,
      canonical: (h.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i) || [])[1] || null,
      canonicalCount: (h.match(/rel=["']canonical["']/gi) || []).length,
      title: (h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || null,
      robots: (h.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i) || [])[1] || null,
      bytes: Buffer.byteLength(h, 'utf8'),
    };
    console.log(v.padEnd(26), r.status, 'canon=' + out.variants[v].canonical, 'count=' + out.variants[v].canonicalCount);
  }
  fs.writeFileSync(path.join(OUT, 'seo-extra3.json'), JSON.stringify(out, null, 2));
  console.log('done -> seo-extra3.json');
})();
