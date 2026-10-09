// perf-detail.js — READ-ONLY audit helper (docs/AUDIT/evidence/perf only).
// Dumps the byte/CPU-level perf audits per page (unminified/unused JS+CSS,
// cache-insight totals, render-blocking, forced reflow, LCP phases).
// Usage: node perf-detail.js
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = __dirname;
const BASE = 'http://localhost:8889';
const IDS = ['home', 'services', 'team', 'contact', 'book'];
const out = { generatedAt: new Date().toISOString(), pages: {} };
for (const id of IDS) {
  const lhr = JSON.parse(fs.readFileSync(path.join(OUT, 'lighthouse-' + id + '.json'), 'utf8'));
  const A = lhr.audits;
  const grab = (k) => {
    const a = A[k];
    if (!a) return null;
    return {
      score: a.score,
      displayValue: a.displayValue || null,
      wastedBytes: a.details && a.details.summary ? (a.details.summary.wastedBytes || null) : null,
      items: a.details && Array.isArray(a.details.items)
        ? a.details.items.slice(0, 6).map((i) => ({
          url: i.url ? String(i.url).replace(BASE, '') : null,
          wastedBytes: i.wastedBytes || null,
          wastedMs: i.wastedMs || null,
          totalBytes: i.totalBytes || null,
          cacheLifetimeMs: i.cacheLifetimeMs !== undefined ? i.cacheLifetimeMs : null,
        })) : null,
      itemCount: a.details && Array.isArray(a.details.items) ? a.details.items.length : 0,
    };
  };
  out.pages[id] = {
    unminifiedJavascript: grab('unminified-javascript'),
    unusedJavascript: grab('unused-javascript'),
    unusedCssRules: grab('unused-css-rules'),
    unminifiedCss: grab('unminified-css'),
    cacheInsight: grab('cache-insight'),
    imageDelivery: grab('image-delivery-insight'),
    renderBlocking: grab('render-blocking-insight'),
    bootup: grab('bootup-time'),
    networkServerLatency: grab('network-server-latency'),
    networkRtt: grab('network-rtt'),
    modernHttp: grab('modern-http-insight'),
    thirdParties: grab('third-parties-insight'),
    fontDisplay: grab('font-display-insight'),
  };
}
fs.writeFileSync(path.join(OUT, 'perf-detail.json'), JSON.stringify(out, null, 2));
for (const [id, p] of Object.entries(out.pages)) {
  console.log('==', id);
  for (const k of Object.keys(p)) {
    const v = p[k];
    if (!v) { console.log('   ', k, 'n/a'); continue; }
    console.log('   ', k, 'score=' + v.score, 'wastedBytes=' + v.wastedBytes, 'items=' + v.itemCount, v.displayValue || '');
    if (v.items && v.items.length) v.items.slice(0, 4).forEach((i) => console.log('        ', JSON.stringify(i)));
  }
}
console.log('-> perf-detail.json');
