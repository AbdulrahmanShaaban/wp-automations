// run-lighthouse.js — READ-ONLY audit helper (docs/AUDIT/evidence/perf only).
// Mobile Lighthouse per page, chrome-launch + CDP pattern copied from
// p1-fashion-store/docs/AUDIT/evidence/perf/run-lighthouse.js so numbers
// are comparable across projects. No cart seeding needed (no store).
// Usage: node run-lighthouse.js [pageId ...]
'use strict';
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8889';
const OUT = __dirname;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const NODE_PATH = 'D:\\my work\\p1-fashion-store\\node_modules';

const PAGES = [
  { id: 'home', path: '/' },
  { id: 'services', path: '/services/' },
  { id: 'team', path: '/team/' },
  { id: 'contact', path: '/contact/' },
  { id: 'book', path: '/book/' },
];

// ---------------------------------------------------------------- extraction
function num(a) { return a && typeof a.numericValue === 'number' ? a.numericValue : null; }
function disp(a) { return a && a.displayValue ? a.displayValue : null; }

// LH 13 keeps metric numbers in the `metrics` debugdata audit
function metric(lhr, key) {
  const m = lhr.audits['metrics'] && lhr.audits['metrics'].details && lhr.audits['metrics'].details.items[0];
  return m && typeof m[key] === 'number' ? m[key] : null;
}

function extract(lhr) {
  const A = lhr.audits;
  // LCP element: LH 13 moved it into the lcp-breakdown-insight list
  let lcpEl = null;
  let lcpPhases = null;
  const lcpAudit = A['lcp-breakdown-insight'] || A['largest-contentful-paint-element'];
  if (lcpAudit && lcpAudit.details && Array.isArray(lcpAudit.details.items)) {
    for (const it of lcpAudit.details.items) {
      if (it && it.type === 'table' && Array.isArray(it.items)) {
        const ph = {};
        for (const r of it.items) if (r && r.subpart) ph[r.subpart] = Math.round(r.duration);
        if (Object.keys(ph).length) lcpPhases = ph;
      }
      const node = it && (it.type === 'node' ? it : (it.node || (it.items && it.items[0])));
      if (node && node.selector && !lcpEl) {
        lcpEl = { selector: node.selector, snippet: (node.snippet || '').slice(0, 200), label: node.nodeLabel || null };
      }
    }
  }
  if (!lcpEl) {
    const legacy = A['largest-contentful-paint-element'];
    if (legacy && legacy.details && legacy.details.items && legacy.details.items[0]) {
      const it = legacy.details.items[0];
      const node = (it.items && it.items[0]) || it;
      if (node && (node.node || node.selector)) {
        const n = node.node || node;
        lcpEl = { selector: n.selector, snippet: (n.snippet || '').slice(0, 200), label: null };
      }
    }
  }
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
  const rb = A['render-blocking-insight'] || A['render-blocking-resources'];
  const rbItems = (rb && rb.details && Array.isArray(rb.details.items)) ? rb.details.items : [];
  const rbWasted = rbItems.length ? rbItems.reduce((s, i) => s + (i.wastedMs || i.duration || 0), 0) : null;
  const clsItems = (A['layout-shifts'] && A['layout-shifts'].details && A['layout-shifts'].details.items) || [];
  const clsSources = clsItems.slice(0, 8).map((i) => ({
    score: i.score,
    node: i.node ? (i.node.selector || i.node.snippet || '').slice(0, 140) : null,
    cause: i.subItems && i.subItems.items ? i.subItems.items.map((s) => s.cause).join('; ') : null,
    movedNode: i.subItems && i.subItems.items && i.subItems.items[0] && i.subItems.items[0].extra
      ? String(i.subItems.items[0].extra.value || '').replace(BASE, '') : null,
  }));
  const longTasks = (A['long-tasks'] && A['long-tasks'].details && A['long-tasks'].details.items) || [];
  const bootup = (A['bootup-time'] && A['bootup-time'].details && A['bootup-time'].details.items) || [];
  const mainthread = (A['main-thread-tasks'] && A['main-thread-tasks'].details && A['main-thread-tasks'].details.items) || [];
  const tbtAttribution = {
    longTasks: longTasks.slice(0, 8).map((i) => ({ url: (i.url || '').replace(BASE, ''), durationMs: Math.round(i.duration || 0), startTime: Math.round(i.startTime || 0) })),
    scriptMs: bootup.slice(0, 6).map((i) => ({ url: (i.url || '').replace(BASE, ''), scriptingMs: Math.round(i.scripting || 0), totalMs: Math.round(i.total || 0) })),
    mainthread: mainthread.slice(0, 6).map((i) => ({ group: i.group, durationMs: Math.round(i.duration || 0) })),
  };
  const opps = Object.values(A)
    .filter((a) => a.score !== null && a.scoreDisplayMode !== 'informative' && a.scoreDisplayMode !== 'notApplicable' && a.score !== undefined && a.score < 0.9)
    .map((a) => {
      const items = (a.details && Array.isArray(a.details.items)) ? a.details.items : [];
      const wasted = items.reduce((s, i) => s + (i.wastedMs || i.wastedBytes || 0), 0);
      return { id: a.id, title: a.title, score: a.score, displayValue: a.displayValue || null, wastedMs: Math.round(wasted), items: items.length };
    })
    .sort((x, y) => y.wastedMs - x.wastedMs)
    .slice(0, 10);
  const failed = Object.values(A)
    .filter((a) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== 'informative' && a.scoreDisplayMode !== 'notApplicable')
    .map((a) => a.id);

  // request timing breakdown (server wait vs download), for env-vs-code attribution
  const perRequest = net.map((r) => ({
    url: (r.url || '').replace(BASE, ''),
    resourceType: r.resourceType,
    status: r.statusCode,
    priority: r.priority || null,
    startMs: Math.round(r.networkRequestTime),
    endMs: Math.round(r.networkEndTime),
    totalMs: Math.round((r.networkEndTime - r.networkRequestTime) * 1000),
    transferSize: r.transferSize || 0,
    resourceSize: r.resourceSize || 0,
    protocol: r.protocol || null,
    mimeType: r.mimeType || null,
  }));
  const slowReqs = perRequest.filter((r) => r.totalMs > 200).sort((a, b) => b.totalMs - a.totalMs).slice(0, 14);

  // LH 13 insight tables worth keeping verbatim for the report
  const insights = {};
  for (const k of ['render-blocking-insight', 'image-delivery-insight', 'cache-insight', 'font-display-insight',
    'network-dependency-tree-insight', 'document-latency-insight', 'dom-size-insight', 'third-parties-insight',
    'forced-reflow-insight', 'cls-culprits-insight', 'duplicated-javascript-insight', 'modern-http-insight']) {
    const a = A[k];
    if (a && a.details) insights[k] = { score: a.score, displayValue: a.displayValue || null, details: a.details };
  }


  return {
    url: lhr.finalDisplayedUrl || lhr.requestedUrl,
    fetchedAt: lhr.fetchTime,
    lighthouseVersion: lhr.lighthouseVersion,
    userAgent: lhr.userAgent,
    formFactor: (lhr.configSettings && lhr.configSettings.formFactor) || null,
    scores: {
      performance: Math.round(lhr.categories.performance.score * 100),
      accessibility: Math.round(lhr.categories.accessibility.score * 100),
      bestPractices: Math.round(lhr.categories['best-practices'].score * 100),
      seo: Math.round(lhr.categories.seo.score * 100),
    },
    metrics: {
      fcpMs: metric(lhr, 'firstContentfulPaint'), fcp: disp(A['first-contentful-paint']),
      lcpMs: metric(lhr, 'largestContentfulPaint'), lcp: disp(A['largest-contentful-paint']),
      tbtMs: metric(lhr, 'totalBlockingTime'), tbt: disp(A['total-blocking-time']),
      cls: metric(lhr, 'cumulativeLayoutShift'), clsDisp: disp(A['cumulative-layout-shift']),
      ttiMs: metric(lhr, 'interactive'), tti: disp(A['interactive']),
      ttfbMs: metric(lhr, 'timeToFirstByte'), ttfb: disp(A['server-response-time']),
      speedIndexMs: metric(lhr, 'speedIndex'), speedIndex: disp(A['speed-index']),
      totalByteWeightBytes: num(A['total-byte-weight']), totalByteWeight: disp(A['total-byte-weight']),
      maxPotentialFID: disp(A['max-potential-fid']),
      observedFcpMs: metric(lhr, 'observedFirstContentfulPaint'),
      observedLcpMs: metric(lhr, 'observedLargestContentfulPaint'),
      observedTtfbMs: metric(lhr, 'observedNavigationStart') !== null ? null : null,
    },
    lcpElement: lcpEl,
    lcpPhases,
    renderBlocking: {
      wastedMs: rbWasted,
      items: rbItems.length,
      top: rbItems.slice(0, 6).map((i) => ({ url: (i.url || '').replace(BASE, ''), wastedMs: Math.round(i.wastedMs || i.duration || 0), totalBytes: i.totalBytes || null })),
    },
    requests: {
      total: net.length, byType,
      fonts: fonts.map((f) => ({ url: (f.url || '').replace(BASE, ''), transfer: f.transferSize || 0, resourceSize: f.resourceSize || 0 })),
      js: { count: jsReqs.length, transfer: jsReqs.reduce((s, r) => s + (r.transferSize || 0), 0) },
      css: { count: cssReqs.length, transfer: cssReqs.reduce((s, r) => s + (r.transferSize || 0), 0) },
      images: { count: imgReqs.length, transfer: imgReqs.reduce((s, r) => s + (r.transferSize || 0), 0) },
      fontCount: fonts.length, fontTransfer: fonts.reduce((s, r) => s + (r.transferSize || 0), 0),
      thirdPartyHosts: [...new Set(net.map((r) => { try { return new URL(r.url).host; } catch (e) { return '?'; } }))],
    },
    perRequest,
    clsSources, tbtAttribution, opportunities: opps, failedAudits: failed, slowRequests: slowReqs, insights,
  };
}

// ---------------------------------------------------------------- main
(async () => {
  const only = process.argv.slice(2);
  const targets = only.length ? PAGES.filter((p) => only.includes(p.id)) : PAGES;

  const { launch } = require(path.join(NODE_PATH, 'chrome-launcher'));
  const chrome = await launch({
    chromePath: CHROME,
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  const { pathToFileURL } = require('url');
  const lighthouse = (await import(pathToFileURL(path.join(NODE_PATH, 'lighthouse', 'core', 'index.js')).href)).default;
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
          maxWaitForLoad: 180000,
        });
        const file = path.join(OUT, 'lighthouse-' + p.id + '.json');
        fs.writeFileSync(file, Array.isArray(r.report) ? r.report.join('') : r.report);
        const e = extract(r.lhr);
        summary[p.id] = e;
        console.log('LH ' + p.id + ': perf=' + e.scores.performance + ' a11y=' + e.scores.accessibility +
          ' bp=' + e.scores.bestPractices + ' seo=' + e.scores.seo + ' | FCP=' + e.metrics.fcp + ' LCP=' + e.metrics.lcp +
          ' TBT=' + e.metrics.tbt + ' CLS=' + e.metrics.clsDisp + ' TTI=' + e.metrics.tti +
          ' wt=' + e.metrics.totalByteWeight + ' req=' + e.requests.total + ' ttfb=' + e.metrics.ttfb +
          (e.lcpElement ? ' | lcp=' + e.lcpElement.selector : '') + ' [' + ((Date.now() - started) / 1000).toFixed(0) + 's]');
      } catch (err) {
        summary[p.id] = { error: String((err && err.stack) || err) };
        console.log('LH ' + p.id + ' FAILED: ' + String((err && err.message) || err));
      }
    }
  } finally {
    await chrome.kill();
  }
  fs.writeFileSync(path.join(OUT, 'lighthouse-summary.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, pages: summary }, null, 2));
  console.log('done -> lighthouse-summary.json');
})();
