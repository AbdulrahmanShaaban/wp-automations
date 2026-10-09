// ttfb-sample.js — READ-ONLY audit helper (docs/AUDIT/evidence/perf only).
// Repeated curl-equivalent timing samples per page: is the PHP/bind-mount
// latency the dominant, unstable part? Also times a static asset for contrast.
// Usage: node ttfb-sample.js [rounds]
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE = 'http://localhost:8889';
const OUT = __dirname;
const ROUNDS = Number(process.argv[2] || 5);

function timed(url, method = 'GET') {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const req = http.request(url, { method, timeout: 120000 }, (res) => {
      let bytes = 0;
      res.on('data', (c) => { bytes += c.length; });
      res.on('end', () => {
        const totalMs = Number(process.hrtime.bigint() - t0) / 1e6;
        resolve({ status: res.statusCode, ttfbMs: totalMs, totalMs, bytes,
          contentEncoding: res.headers['content-encoding'] || null,
          contentLength: res.headers['content-length'] || null });
      });
    });
    req.on('error', (e) => resolve({ status: 0, error: String(e) }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout' }); });
    req.end();
  });
}

(async () => {
  const targets = [
    ['/', 'page home'],
    ['/services/', 'page services'],
    ['/team/', 'page team'],
    ['/contact/', 'page contact'],
    ['/book/', 'page book'],
    ['/?p=5', 'page ?p=5 (numeric permalink probe)'],
    ['/robots.txt', 'static robots.txt'],
    ['/wp-content/themes/siraj-theme/style.css', 'static theme style.css'],
    ['/wp-content/themes/siraj-theme/assets/fonts/alexandria-arabic.woff2', 'static font woff2'],
  ];
  const out = { generatedAt: new Date().toISOString(), rounds: ROUNDS, base: BASE, results: [] };
  for (let i = 1; i <= ROUNDS; i++) {
    for (const [p, label] of targets) {
      const r = await timed(BASE + p);
      out.results.push({ round: i, label, path: p, ...r });
      console.log('r' + i, label.padEnd(30), r.status, (r.ttfbMs ? r.ttfbMs.toFixed(0) : '-') + 'ms', (r.bytes || 0) + 'B', r.contentEncoding || '');
    }
  }
  // summary per target
  out.summary = targets.map(([p, label]) => {
    const rs = out.results.filter((r) => r.path === p && r.ttfbMs);
    const vals = rs.map((r) => r.ttfbMs).sort((a, b) => a - b);
    return {
      label, path: p, n: vals.length,
      minMs: Math.round(vals[0]), medianMs: Math.round(vals[Math.floor(vals.length / 2)]),
      maxMs: Math.round(vals[vals.length - 1]),
      bytes: rs[0] ? rs[0].bytes : null,
      contentEncoding: rs[0] ? rs[0].contentEncoding : null,
    };
  });
  fs.writeFileSync(path.join(OUT, 'ttfb-sample.json'), JSON.stringify(out, null, 2));
  console.log('--- summary');
  for (const s of out.summary) console.log(s.label.padEnd(30), 'min=' + s.minMs, 'med=' + s.medianMs, 'max=' + s.maxMs, (s.bytes || 0) + 'B', s.contentEncoding || '');
})();
