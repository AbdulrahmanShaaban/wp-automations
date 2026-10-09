// run-lighthouse.js — READ-ONLY audit helper (docs/AUDIT/evidence/perf only).
// Mobile Lighthouse per page, same emulation/throttling config as Phase 6
// (scripts/qa-audit.js) so deltas are comparable. Seeds the cart via the
// Store API and passes the cookie through Lighthouse's extraHeaders so
// /cart/ and /checkout/ are audited with items in the cart (checkout 302s
// to /cart/ otherwise, which would audit the wrong page).
// Usage: node run-lighthouse.js [pageId ...]
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE = 'http://localhost:8888';
const OUT = __dirname;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const PAGES = [
  { id: 'home', path: '/' },
  { id: 'shop', path: '/shop/' },
  { id: 'product', path: '/product/embroidered-abaya/' },
  { id: 'cart', path: '/cart/' },
  { id: 'checkout', path: '/checkout/' },
  { id: 'contact', path: '/contact/' },
];

// ---------------------------------------------------------------- Store API cart seed
function storeApi(p, method, body, headers = {}) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      BASE + '/wp-json/wc/store/v1' + p,
      { method, timeout: 60000, headers: Object.assign(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}, headers) },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { text += c; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: text }));
      }
    );
    req.on('error', () => resolve({ status: 0, headers: {}, body: '' }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, headers: {}, body: '' }); });
    if (payload) req.write(payload);
    req.end();
  });
}

async function seedCart() {
  const probe = await storeApi('/cart', 'GET');
  const nonce = probe.headers.nonce || probe.headers.Nonce || '';
  const add = await storeApi('/cart/add-item', 'POST', { id: 38, quantity: 1 }, nonce ? { Nonce: nonce } : {});
  const token = add.headers['cart-token'];
  const jar = [];
  for (const c of (add.headers['set-cookie'] || [])) {
    const pair = c.split(';')[0];
    if (pair) jar.push(pair);
  }
  if (token && !jar.some((c) => c.startsWith('cart_token='))) jar.push('cart_token=' + token);
  const cookie = jar.join('; ');
  console.log('cart seed: HTTP ' + add.status + ' cookie=' + (cookie ? cookie.split(';')[0].split('=')[0] + ' set' : 'NONE'));
  return cookie;
}

// ---------------------------------------------------------------- extraction
function num(a) { return a && typeof a.numericValue === 'number' ? a.numericValue : null; }
function disp(a) { return a && a.displayValue ? a.displayValue : null; }

function extract(lhr) {
  const A = lhr.audits;
  // LCP element
  let lcpEl = null;
  const lcpAudit = A['largest-contentful-paint-element'];
  if (lcpAudit && lcpAudit.details && lcpAudit.details.items && lcpAudit.details.items[0]) {
    const it = lcpAudit.details.items[0];
    const node = (it.items && it.items[0]) || it;
    if (node && node.node) lcpEl = { selector: node.node.selector, snippet: (node.node.snippet || '').slice(0, 200) };
    else if (it.node) lcpEl = { selector: it.node.selector, snippet: (it.node.snippet || '').slice(0, 200) };
  }
  // resource byte budget from network-requests
  const net = (A['network-requests'] && A['network-requests'].details && A['network-requests'].details.items) || [];
  const byType = {};
  for (const r of net) {
    const t = r.resourceType || 'Other';
    byType[t] = byType[t] || { count: 0, transfer: 0 };
    byType[t].count++;
    byType[t].transfer += r.transferSize || 0;
  }
  const fonts = net.filter((r) => r.resourceType === 'Font');
  const cssReqs = net.filter((r) => r.resourceType === 'Stylesheet');
  const jsReqs = net.filter((r) => r.resourceType === 'Script');
  const imgReqs = net.filter((r) => r.resourceType === 'Image');
  // render-blocking
  const rb = A['render-blocking-resources'];
  const rbWasted = rb ? (rb.details && rb.details.items ? rb.details.items.reduce((s, i) => s + (i.wastedMs || 0), 0) : num(rb)) : null;
  // CLS sources
  const clsItems = (A['layout-shifts'] && A['layout-shifts'].details && A['layout-shifts'].details.items) || [];
  const clsSources = clsItems.slice(0, 6).map((i) => ({
    score: i.score,
    node: i.node ? (i.node.selector || i.node.snippet || '').slice(0, 140) : null,
  }));
  // TBT attribution
  const longTasks = (A['long-tasks'] && A['long-tasks'].details && A['long-tasks'].details.items) || [];
  const bootup = (A['bootup-time'] && A['bootup-time'].details && A['bootup-time'].details.items) || [];
  const mainthread = (A['mainthread-work-breakdown'] && A['mainthread-work-breakdown'].details && A['mainthread-work-breakdown'].details.items) || [];
  const tbtAttribution = {
    longTasks: longTasks.slice(0, 6).map((i) => ({ url: (i.url || '').replace(BASE, ''), durationMs: Math.round(i.duration || 0), startTime: Math.round(i.startTime || 0) })),
    scriptMs: bootup.slice(0, 6).map((i) => ({ url: (i.url || '').replace(BASE, ''), scriptingMs: Math.round(i.scriptingMs || 0), totalMs: Math.round(i.totalMs || 0) })),
    mainthread: mainthread.slice(0, 6).map((i) => ({ group: i.group, durationMs: Math.round(i.duration || 0) })),
  };
  // biggest opportunities (failed/low-score audits sorted by wasted ms)
  const opps = Object.values(A)
    .filter((a) => a.score !== null && a.scoreDisplayMode !== 'informative' && a.scoreDisplayMode !== 'notApplicable' && a.score !== undefined && a.score < 0.9)
    .map((a) => {
      const items = (a.details && a.details.items) || [];
      const wasted = items.reduce((s, i) => s + (i.wastedMs || i.wastedBytes || 0), 0);
      return { id: a.id, title: a.title, score: a.score, wastedMs: Math.round(wasted), items: items.length };
    })
    .sort((x, y) => y.wastedMs - x.wastedMs)
    .slice(0, 8);
  const failed = Object.values(A)
    .filter((a) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== 'informative' && a.scoreDisplayMode !== 'notApplicable')
    .map((a) => a.id);

  return {
    url: lhr.finalDisplayedUrl || lhr.requestedUrl,
    fetchedAt: lhr.fetchTime,
    lighthouseVersion: lhr.lighthouseVersion,
    formFactor: (lhr.configSettings && lhr.configSettings.formFactor) || null,
    scores: {
      performance: Math.round(lhr.categories.performance.score * 100),
      accessibility: Math.round(lhr.categories.accessibility.score * 100),
      bestPractices: Math.round(lhr.categories['best-practices'].score * 100),
      seo: Math.round(lhr.categories.seo.score * 100),
    },
    metrics: {
      fcpMs: num(A['first-contentful-paint']), fcp: disp(A['first-contentful-paint']),
      lcpMs: num(A['largest-contentful-paint']), lcp: disp(A['largest-contentful-paint']),
      tbtMs: num(A['total-blocking-time']), tbt: disp(A['total-blocking-time']),
      cls: num(A['cumulative-layout-shift']), clsDisp: disp(A['cumulative-layout-shift']),
      ttiMs: num(A['interactive']), tti: disp(A['interactive']),
      ttfbMs: num(A['server-response-time']), ttfb: disp(A['server-response-time']),
      speedIndexMs: num(A['speed-index']), speedIndex: disp(A['speed-index']),
      totalByteWeightBytes: num(A['total-byte-weight']), totalByteWeight: disp(A['total-byte-weight']),
      maxPotentialFID: disp(A['max-potential-fid']),
    },
    lcpElement: lcpEl,
    renderBlocking: { wastedMs: rbWasted, items: (rb && rb.details && rb.details.items ? rb.details.items.length : 0),
      top: ((rb && rb.details && rb.details.items) || []).slice(0, 6).map((i) => ({ url: (i.url || '').replace(BASE, ''), wastedMs: Math.round(i.wastedMs || 0) })) },
    requests: { total: net.length, byType, fonts: fonts.map((f) => ({ url: (f.url || '').replace(BASE, ''), transfer: f.transferSize || 0 })),
      js: { count: jsReqs.length, transfer: jsReqs.reduce((s, r) => s + (r.transferSize || 0), 0) },
      css: { count: cssReqs.length, transfer: cssReqs.reduce((s, r) => s + (r.transferSize || 0), 0) },
      images: { count: imgReqs.length, transfer: imgReqs.reduce((s, r) => s + (r.transferSize || 0), 0) },
      fontCount: fonts.length, fontTransfer: fonts.reduce((s, r) => s + (r.transferSize || 0), 0) },
    clsSources, tbtAttribution, opportunities: opps, failedAudits: failed,
  };
}

// ---------------------------------------------------------------- main
(async () => {
  const only = process.argv.slice(2);
  const targets = only.length ? PAGES.filter((p) => only.includes(p.id)) : PAGES;
  const cartCookie = await seedCart();

  const { launch } = require('chrome-launcher');
  const chrome = await launch({ chromePath: CHROME, chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'] });
  const lighthouse = (await import('lighthouse')).default;
  const summary = {};
  try {
    for (const p of targets) {
      const url = BASE + p.path;
      const started = Date.now();
      try {
        const r = await lighthouse(url, {
          port: chrome.port,
          output: ['json'],
          logLevel: 'error',
          onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
          formFactor: 'mobile',
          screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 2, disabled: false },
          throttlingMethod: 'simulate',
          throttling: { rttMs: 150, throughputKbps: 1638.4, cpuSlowdownMultiplier: 4, requestLatencyMs: 150, downloadThroughputKbps: 1474.5, uploadThroughputKbps: 675 },
          settings: { extraHeaders: [{ source: 'extraHeaders', name: 'Cookie', value: cartCookie }] },
        });
        const file = path.join(OUT, 'lighthouse-' + p.id + '.json');
        fs.writeFileSync(file, Array.isArray(r.report) ? r.report.join('') : r.report);
        const e = extract(r.lhr);
        summary[p.id] = e;
        console.log('LH ' + p.id + ': perf=' + e.scores.performance + ' a11y=' + e.scores.accessibility +
          ' seo=' + e.scores.seo + ' | FCP=' + e.metrics.fcp + ' LCP=' + e.metrics.lcp +
          ' TBT=' + e.metrics.tbt + ' CLS=' + e.metrics.clsDisp + ' TTI=' + e.metrics.tti +
          ' wt=' + e.metrics.totalByteWeight + ' ttfb=' + e.metrics.ttfb +
          (e.lcpElement ? ' | lcp=' + e.lcpElement.selector : '') + ' [' + ((Date.now() - started) / 1000).toFixed(0) + 's]');
      } catch (err) {
        summary[p.id] = { error: String(err && err.stack || err) };
        console.log('LH ' + p.id + ' FAILED: ' + String(err && err.message || err));
      }
    }
  } finally {
    await chrome.kill();
  }
  fs.writeFileSync(path.join(OUT, 'lighthouse-summary.json'), JSON.stringify({ generatedAt: new Date().toISOString(), cartSeeded: !!cartCookie, pages: summary }, null, 2));
  console.log('done -> lighthouse-summary.json');
})();
