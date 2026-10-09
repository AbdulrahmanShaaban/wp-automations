// extract.js — READ-ONLY audit helper (docs/AUDIT/evidence/perf only).
// Reads the saved Lighthouse JSONs + probe-paint.json and prints/writes the
// exact figures quoted in the report. Nothing here invents a number.
// Usage: node extract.js
'use strict';
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8889';
const OUT = __dirname;
const IDS = ['home', 'services', 'team', 'contact', 'book'];

const rows = [];
const deep = {};
for (const id of IDS) {
  const file = path.join(OUT, 'lighthouse-' + id + '.json');
  if (!fs.existsSync(file)) { console.log('MISSING', id); continue; }
  const lhr = JSON.parse(fs.readFileSync(file, 'utf8'));
  const A = lhr.audits;
  const m = (A['metrics'].details.items[0]);
  const net = A['network-requests'].details.items;
  const byType = {};
  for (const r of net) {
    const t = r.resourceType || 'Other';
    byType[t] = byType[t] || { count: 0, transfer: 0, resource: 0 };
    byType[t].count++;
    byType[t].transfer += r.transferSize > 0 ? r.transferSize : 0;
    byType[t].resource += r.resourceSize > 0 ? r.resourceSize : 0;
  }
  const lcpTable = (A['lcp-breakdown-insight'] && A['lcp-breakdown-insight'].details.items || [])
    .find((i) => i.type === 'table');
  const phases = {};
  if (lcpTable) for (const r of lcpTable.items) phases[r.subpart] = Math.round(r.duration);
  const lcpNode = (A['lcp-breakdown-insight'] && A['lcp-breakdown-insight'].details.items || [])
    .find((i) => i.type === 'node');
  const rb = A['render-blocking-insight'];
  const rbItems = (rb && rb.details && Array.isArray(rb.details.items)) ? rb.details.items : [];
  const cls = (A['layout-shifts'].details.items || []);
  const rowsForCls = cls.map((i) => ({
    score: Number(i.score.toFixed(4)),
    node: i.node ? i.node.selector : null,
    cause: i.subItems && i.subItems.items ? i.subItems.items.map((s) => s.cause).join('; ') : null,
    moved: i.subItems && i.subItems.items && i.subItems.items[0] && i.subItems.items[0].extra
      ? String(i.subItems.items[0].extra.value).replace(BASE, '') : null,
  }));
  const doc = net.find((r) => r.resourceType === 'Document');
  const failedSeo = Object.values(lhr.categories.seo.auditRefs)
    .map((r) => ({ id: r.id, weight: r.weight, score: A[r.id] && A[r.id].score }))
    .filter((x) => x.score !== null && x.score < 1);
  const failedA11y = Object.values(lhr.categories.accessibility.auditRefs)
    .map((r) => ({ id: r.id, score: A[r.id] && A[r.id].score }))
    .filter((x) => x.score !== null && x.score < 1);
  const failedBp = Object.values(lhr.categories['best-practices'].auditRefs)
    .map((r) => ({ id: r.id, score: A[r.id] && A[r.id].score }))
    .filter((x) => x.score !== null && x.score < 1);
  const failedPerf = Object.values(lhr.categories.performance.auditRefs)
    .map((r) => ({ id: r.id, weight: r.weight, score: A[r.id] && A[r.id].score }))
    .filter((x) => x.score !== null && x.score < 0.9);
  const slowest = net.map((r) => ({
    url: r.url.replace(BASE, '').slice(0, 80),
    type: r.resourceType,
    ttfbOrTotalMs: Math.round((r.networkEndTime - r.networkRequestTime) * 1000),
    transfer: r.transferSize,
  })).sort((a, b) => b.ttfbOrTotalMs - a.ttfbOrTotalMs).slice(0, 6);

  rows.push({
    id,
    url: lhr.finalDisplayedUrl,
    fetchedAt: lhr.fetchTime,
    lighthouseVersion: lhr.lighthouseVersion,
    scores: {
      perf: Math.round(lhr.categories.performance.score * 100),
      a11y: Math.round(lhr.categories.accessibility.score * 100),
      bp: Math.round(lhr.categories['best-practices'].score * 100),
      seo: Math.round(lhr.categories.seo.score * 100),
    },
    simulated: { fcp: m.firstContentfulPaint, lcp: m.largestContentfulPaint, tbt: m.totalBlockingTime, cls: m.cumulativeLayoutShift, tti: m.interactive, si: m.speedIndex, ttfb: m.timeToFirstByte },
    observed: { ttfb: m.observedNavigationStart, fcp: m.observedFirstContentfulPaint, lcp: m.observedLargestContentfulPaint, cls: m.observedCumulativeLayoutShift, load: m.observedLoad, dcl: m.observedDomContentLoaded, traceEnd: m.observedTraceEnd, si: m.observedSpeedIndex },
    totalByteWeight: { bytes: A['total-byte-weight'].numericValue, display: A['total-byte-weight'].displayValue },
    requests: net.length,
    byType,
    docRequest: doc ? {
      transferSize: doc.transferSize, resourceSize: doc.resourceSize, protocol: doc.protocol,
      cache: doc.cache, totalMs: Math.round((doc.networkEndTime - doc.networkRequestTime) * 1000),
      startedAtMs: Math.round(doc.networkRequestTime),
    } : null,
    lcpElement: lcpNode ? { selector: lcpNode.selector, snippet: lcpNode.snippet, label: lcpNode.nodeLabel } : null,
    lcpPhases: phases,
    renderBlocking: { items: rbItems.length, totalWastedMs: rbItems.reduce((s, i) => s + (i.wastedMs || 0), 0), top: rbItems.slice(0, 5).map((i) => ({ url: i.url.replace(BASE, ''), wastedMs: i.wastedMs, bytes: i.totalBytes })), auditDisplay: rb ? rb.displayValue : null },
    clsSources: rowsForCls,
    longTasks: (A['long-tasks'].details.items || []).slice(0, 8).map((i) => ({ url: i.url.replace(BASE, ''), durationMs: Math.round(i.duration), startMs: Math.round(i.startTime) })),
    bootup: (A['bootup-time'].details.items || []).slice(0, 5).map((i) => ({ url: i.url.replace(BASE, ''), totalMs: Math.round(i.total || 0), scriptingMs: Math.round(i.scripting || 0) })),
    slowestRequests: slowest,
    fontRequests: net.filter((r) => r.resourceType === 'Font').map((r) => ({ url: r.url.replace(BASE, ''), transfer: r.transferSize, resource: r.resourceSize })),
    imageRequests: net.filter((r) => r.resourceType === 'Image').map((r) => ({ url: r.url.replace(BASE, ''), transfer: r.transferSize, resource: r.resourceSize })),
    failedSeo, failedA11y, failedBp, failedPerf,
    insightDisplays: Object.fromEntries(['cache-insight', 'image-delivery-insight', 'render-blocking-insight', 'document-latency-insight', 'dom-size-insight', 'font-display-insight', 'forced-reflow-insight', 'modern-http-insight', 'third-parties-insight', 'duplicated-javascript-insight'].map((k) => [k, A[k] ? { score: A[k].score, display: A[k].displayValue || null } : null])),
    thirdPartyHosts: [...new Set(net.map((r) => { try { return new URL(r.url).host; } catch (e) { return '?'; } }))],
  });
  deep[id] = {
    insights: Object.fromEntries(['cache-insight', 'image-delivery-insight', 'network-dependency-tree-insight', 'document-latency-insight', 'dom-size-insight', 'font-display-insight', 'forced-reflow-insight', 'cls-culprits-insight', 'duplicated-javascript-insight'].filter((k) => A[k]).map((k) => [k, { score: A[k].score, displayValue: A[k].displayValue || null, details: A[k].details }])),
  };
}

const out = { generatedAt: new Date().toISOString(), pages: rows, deepDive: deep };
fs.writeFileSync(path.join(OUT, 'metrics-extract.json'), JSON.stringify(out, null, 2));

// console digest
for (const r of rows) {
  console.log('==== ' + r.id + '  perf=' + r.scores.perf + ' a11y=' + r.scores.a11y + ' bp=' + r.scores.bp + ' seo=' + r.scores.seo);
  console.log('  sim  FCP=' + r.simulated.fcp + ' LCP=' + r.simulated.lcp + ' TBT=' + r.simulated.tbt + ' CLS=' + r.simulated.cls.toFixed(4) + ' TTI=' + r.simulated.tti + ' SI=' + r.simulated.si + ' TTFB=' + r.simulated.ttfb);
  console.log('  obs  TTFBdoc=' + (r.docRequest ? r.docRequest.totalMs + 'ms' : '?') + ' FCP=' + r.observed.fcp + ' LCP=' + r.observed.lcp + ' load=' + r.observed.load + ' traceEnd=' + r.observed.traceEnd);
  console.log('  weight=' + r.totalByteWeight.display + ' (' + r.totalByteWeight.bytes + ' B) requests=' + r.requests);
  console.log('  byType=' + JSON.stringify(r.byType));
  console.log('  lcpEl=' + (r.lcpElement ? r.lcpElement.selector + ' | ' + (r.lcpElement.label || '') : 'none') + ' phases=' + JSON.stringify(r.lcpPhases));
  console.log('  rb=' + JSON.stringify(r.renderBlocking.auditDisplay) + ' cls=' + JSON.stringify(r.clsSources));
  console.log('  longTasks=' + JSON.stringify(r.longTasks.slice(0, 4)));
  console.log('  bootup=' + JSON.stringify(r.bootup.slice(0, 3)));
  console.log('  failedSEO=' + JSON.stringify(r.failedSeo) + ' failedA11y=' + JSON.stringify(r.failedA11y) + ' failedBP=' + JSON.stringify(r.failedBp));
  console.log('  insights=' + JSON.stringify(r.insightDisplays));
}
console.log('-> metrics-extract.json');
