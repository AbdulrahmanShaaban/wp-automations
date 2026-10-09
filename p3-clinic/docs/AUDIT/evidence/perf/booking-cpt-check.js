// booking-cpt-check.js — READ-ONLY audit helper (docs/AUDIT/evidence/perf only).
// Is the siraj_booking CPT publicly queryable (indexable archive / REST)?
// Usage: node booking-cpt-check.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const OUT = __dirname;
const BASE = 'http://localhost:8889';

function get(url) {
  return new Promise((resolve) => {
    http.get(url, { timeout: 120000 }, (res) => {
      let b = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
    }).on('error', (e) => resolve({ status: 0, headers: {}, body: '', error: String(e) }));
  });
}
const g = (h, re, i = 1) => { const m = h.match(re); return m ? m[i] : null; };

(async () => {
  const out = { generatedAt: new Date().toISOString(), base: BASE, checks: {} };
  const pages = {
    bookingArchive: '/?post_type=siraj_booking',
    bookingPostType: '/siraj_booking/',
    wpRestTypes: '/wp-json/wp/v2/types',
    search: '/?s=%D8%A8%D8%AD%D8%B2',
  };
  for (const [k, p] of Object.entries(pages)) {
    const r = await get(BASE + p);
    out.checks[k] = {
      path: p, status: r.status, bytes: Buffer.byteLength(r.body, 'utf8'),
      title: g(r.body, /<title[^>]*>([\s\S]*?)<\/title>/i),
      canonical: g(r.body, /rel=["']canonical["'][^>]*href=["']([^"']*)["']/i),
      robots: g(r.body, /name=["']robots["'][^>]*content=["']([^"']*)["']/i),
      h1Count: (r.body.match(/<h1[\s>]/gi) || []).length,
    };
    console.log(k, r.status, JSON.stringify(out.checks[k]));
    if (k === 'bookingArchive') fs.writeFileSync(path.join(OUT, 'html-booking-archive.html'), r.body);
    if (k === 'bookingPostType') fs.writeFileSync(path.join(OUT, 'html-booking-slug.html'), r.body);
  }
  fs.writeFileSync(path.join(OUT, 'booking-cpt-check.json'), JSON.stringify(out, null, 2));
  console.log('done -> booking-cpt-check.json');
})();
