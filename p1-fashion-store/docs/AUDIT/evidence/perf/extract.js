// extract.js — READ-ONLY audit helper (docs/AUDIT/evidence/perf only).
// Re-extracts metrics from the saved lighthouse-*.json files (no browser needed).
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = __dirname;
const BASE = 'http://localhost:8888';
const IDS = ['home', 'shop', 'product', 'cart', 'checkout', 'contact'];

function num(a) { return a && typeof a.numericValue === 'number' ? a.numericValue : null; }
function disp(a) { return a && a.displayValue ? a.displayValue : null; }
function arr(x) { return Array.isArray(x) ? x : []; }

function extract(lhr) {
  const A = lhr.audits;
  // Lighthouse 13: LCP element + TTFB/render-delay split live in `lcp-breakdown-insight`
  let lcpEl = null;
  const lb = arr(A['lcp-breakdown-insight'] && A['lcp-breakdown-insight'].details && A['lcp-breakdown-insight'].details.items);
  let lcpSplit = null;
  for (const it of lb) {
    if (it && it.type === 'table' && arr(it.items).length) {
      lcpSplit = {};
      for (const s of it.items) lcpSplit[s.subpart] = Math.round(s.duration);
    }
    if (it && it.type === 'node') {
      lcpEl = { selector: it.selector, snippet: String(it.snippet || '').slice(0, 200), label: String(it.nodeLabel || '').slice(0, 80) };
    }
  }
  const net = arr(A['network-requests'] && A['network-requests'].details && A['network-requests'].details.items);
  const byType = {};
  for (const r of net) {
    const t = r.resourceType || 'Other';
    byType[t] = byType[t] || { count: 0, transfer: 0 };
    byType[t].count++;
    byType[t].transfer += r.transferSize || 0;
  }
  const pick = (t) => net.filter((r) => r.resourceType === t);
  const fonts = pick('Font'), cssReqs = pick('Stylesheet'), jsReqs = pick('Script'), imgReqs = pick('Image');
  // Lighthouse 13: `render-blocking-insight` (metricSavings); older runs used `render-blocking-resources`
  const rb = A['render-blocking-insight'] || A['render-blocking-resources'];
  const rbItems = arr(rb && rb.details && rb.details.items);
  const rbWasted = rbItems.length ? rbItems.reduce((s, i) => s + (i.wastedMs || i.savings || 0), 0) : (num(rb) != null ? num(rb) : null);
  const clsItems = arr(A['layout-shifts'] && A['layout-shifts'].details && A['layout-shifts'].details.items);
  const clsSources = clsItems.filter((i) => i.node).slice(0, 8).map((i) => ({
    score: i.score != null ? Math.round(i.score * 1000) / 1000 : null,
    selector: String(i.node.selector || '').slice(0, 150),
    label: String(i.node.nodeLabel || '').replace(/\s+/g, ' ').slice(0, 90),
    cause: (i.subItems && arr(i.subItems.items).map((s) => s.cause).filter(Boolean).join(', ')) || null,
  }));
  const clsNoNode = clsItems.filter((i) => !i.node).reduce((s, i) => s + (i.score || 0), 0);
  const longTasks = arr(A['long-tasks'] && A['long-tasks'].details && A['long-tasks'].details.items);
  const bootup = arr(A['bootup-time'] && A['bootup-time'].details && A['bootup-time'].details.items);
  const mainthread = arr(A['mainthread-work-breakdown'] && A['mainthread-work-breakdown'].details && A['mainthread-work-breakdown'].details.items);
  const tbtAttribution = {
    longTasks: longTasks.slice(0, 6).map((i) => ({ url: String(i.url || '').replace(BASE, ''), durationMs: Math.round(i.duration || 0), startTime: Math.round(i.startTime || 0) })),
    scriptMs: bootup.slice(0, 6).map((i) => ({ url: String(i.url || '').replace(BASE, ''), scriptingMs: Math.round(i.scripting || i.scriptingMs || 0), parseCompileMs: Math.round(i.scriptParseCompile || 0), totalMs: Math.round(i.total || i.totalMs || 0) })),
    mainthread: mainthread.slice(0, 6).map((i) => ({ group: i.group, durationMs: Math.round(i.duration || 0) })),
  };
  const opps = Object.values(A)
    .filter((a) => a && a.scoreDisplayMode !== 'notApplicable')
    .map((a) => {
      const items = arr(a.details && a.details.items);
      const wasted = items.reduce((s, i) => s + (i.wastedMs || i.wastedBytes || 0), 0);
      return { id: a.id, title: a.title, score: a.score, mode: a.scoreDisplayMode, wasted: Math.round(wasted), items: items.length };
    })
    .filter((o) => o.wasted > 0)
    .sort((x, y) => y.wasted - x.wasted)
    .slice(0, 8);
  const failed = Object.values(A)
    .filter((a) => a && a.score !== null && a.score !== undefined && a.score < 0.9 &&
      a.scoreDisplayMode !== 'informative' && a.scoreDisplayMode !== 'notApplicable' && a.scoreDisplayMode !== 'metricSavings')
    .map((a) => a.id);

  return {
    url: lhr.finalDisplayedUrl || lhr.requestedUrl,
    fetchedAt: lhr.fetchTime,
    lighthouseVersion: lhr.lighthouseVersion,
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
    },
    lcpElement: lcpEl,
    lcpSplitMs: lcpSplit,
    clsUnattributed: Math.round(clsNoNode * 1000) / 1000,
    renderBlocking: { wastedMs: rbWasted, items: rbItems.length, top: rbItems.slice(0, 8).map((i) => ({ url: String(i.url || '').replace(BASE, ''), wastedMs: Math.round(i.wastedMs || 0), bytes: i.totalBytes || 0 })) },
    requests: {
      total: net.length,
      js: { count: jsReqs.length, transfer: jsReqs.reduce((s, r) => s + (r.transferSize || 0), 0) },
      css: { count: cssReqs.length, transfer: cssReqs.reduce((s, r) => s + (r.transferSize || 0), 0) },
      images: { count: imgReqs.length, transfer: imgReqs.reduce((s, r) => s + (r.transferSize || 0), 0) },
      fonts: { count: fonts.length, transfer: fonts.reduce((s, r) => s + (r.transferSize || 0), 0), urls: fonts.map((f) => String(f.url || '').replace(BASE, '').slice(0, 90)) },
      byType,
    },
    clsSources, tbtAttribution, opportunities: opps, failedAudits: failed,
  };
}

if (require.main === module) {
  const summary = { generatedAt: new Date().toISOString(), mode: 'extract-from-saved-json', pages: {} };
  for (const id of IDS) {
    const f = path.join(OUT, 'lighthouse-' + id + '.json');
    if (!fs.existsSync(f)) { console.log(id, 'MISSING'); continue; }
    const lhr = JSON.parse(fs.readFileSync(f, 'utf8'));
    const e = extract(lhr);
    summary.pages[id] = e;
    console.log(id + ': perf=' + e.scores.performance + ' a11y=' + e.scores.accessibility + ' bp=' + e.scores.bestPractices + ' seo=' + e.scores.seo +
      ' | FCP=' + e.metrics.fcp + ' LCP=' + e.metrics.lcp + ' TBT=' + e.metrics.tbt + ' CLS=' + e.metrics.clsDisp + ' TTI=' + e.metrics.tti +
      ' | wt=' + e.metrics.totalByteWeight + ' ttfb=' + e.metrics.ttfb + ' rb=' + (e.renderBlocking.wastedMs == null ? 'n/a' : Math.round(e.renderBlocking.wastedMs) + 'ms') +
      (e.lcpElement ? ' | LCP-el=' + e.lcpElement.selector : ''));
  }
  fs.writeFileSync(path.join(OUT, 'lighthouse-summary.json'), JSON.stringify(summary, null, 2));
  console.log('done -> lighthouse-summary.json');
}
module.exports = { extract, IDS, num, disp, arr };
