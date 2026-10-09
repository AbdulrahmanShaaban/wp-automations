// compare.js — READ-ONLY audit helper (docs/AUDIT/evidence/perf only).
// Deltas vs Phase 6 baseline (design/qa/lighthouse-*.json, throttled pass, READ-ONLY).
'use strict';
const fs = require('fs');
const path = require('path');
const { extract } = require('./extract.js');

const MINE = __dirname;
const BASELINE = path.join(__dirname, '..', '..', '..', '..', 'design', 'qa'); // docs/AUDIT/evidence/perf -> repo root
const IDS = ['home', 'shop', 'product', 'cart', 'checkout', 'contact'];

function load(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function delta(now, before, goodIsLower, tol) {
  if (now == null || before == null) return null;
  const t = tol == null ? 150 : tol;
  const d = Math.round((now - before) * (goodIsLower ? 1 : -1) * 100) / 100;
  const dec = Math.abs(now) < 5 ? 3 : 1;
  return {
    now: Math.round(now * 100) / 100, was: Math.round(before * 100) / 100,
    delta: Math.round((now - before) * 100) / 100,
    verdict: d > t ? 'worse' : d < -t ? 'better' : 'same',
  };
}

const out = {};
for (const id of IDS) {
  const mineFile = path.join(MINE, 'lighthouse-' + id + '.json');
  const baseFile = path.join(BASELINE, 'lighthouse-' + id + '.json');
  if (!fs.existsSync(mineFile) || !fs.existsSync(baseFile)) { out[id] = { error: 'missing file', mine: fs.existsSync(mineFile), base: fs.existsSync(baseFile) }; continue; }
  const mine = extract(load(mineFile));
  const base = extract(load(baseFile));
  out[id] = {
    url: mine.url,
    lighthouseVersion: { now: mine.lighthouseVersion, was: base.lighthouseVersion },
    score: delta(mine.scores.performance, base.scores.performance, false, 2),
    a11y: { now: mine.scores.accessibility, was: base.scores.accessibility },
    seoScore: { now: mine.scores.seo, was: base.scores.seo },
    fcp: delta(mine.metrics.fcpMs, base.metrics.fcpMs, true, 200),
    lcp: delta(mine.metrics.lcpMs, base.metrics.lcpMs, true, 300),
    tbt: delta(mine.metrics.tbtMs, base.metrics.tbtMs, true, 150),
    cls: delta(mine.metrics.cls, base.metrics.cls, true, 0.03),
    tti: delta(mine.metrics.ttiMs, base.metrics.ttiMs, true, 300),
    ttfb: delta(mine.metrics.ttfbMs, base.metrics.ttfbMs, true, 400),
    weight: delta(mine.metrics.totalByteWeightBytes, base.metrics.totalByteWeightBytes, true, 10240),
    renderBlockingWasted: delta(mine.renderBlocking.wastedMs, base.renderBlocking.wastedMs, true, 400),
    now: { perf: mine.scores.performance, fcp: mine.metrics.fcp, lcp: mine.metrics.lcp, tbt: mine.metrics.tbt, cls: mine.metrics.clsDisp, tti: mine.metrics.tti, ttfb: mine.metrics.ttfb, weight: mine.metrics.totalByteWeight, rbMs: mine.renderBlocking.wastedMs, lcpEl: mine.lcpElement },
    was: { perf: base.scores.performance, fcp: base.metrics.fcp, lcp: base.metrics.lcp, tbt: base.metrics.tbt, cls: base.metrics.clsDisp, tti: base.metrics.tti, ttfb: base.metrics.ttfb, weight: base.metrics.totalByteWeight, rbMs: base.renderBlocking.wastedMs, lcpEl: base.lcpElement },
  };
  const r = out[id];
  const f = (x) => (x ? x.was + ' -> ' + x.now + ' (' + (x.delta > 0 ? '+' : '') + x.delta + ' ' + x.verdict + ')' : 'n/a');
  console.log(id.padEnd(9), 'perf', f(r.score), '| LCP', f(r.lcp), '| TBT', f(r.tbt), '| CLS', f(r.cls), '| TTFB', f(r.ttfb), '| wt', f(r.weight));
}
fs.writeFileSync(path.join(MINE, 'baseline-compare.json'), JSON.stringify({ generatedAt: new Date().toISOString(), baselineDir: BASELINE, pages: out }, null, 2));
console.log('done -> baseline-compare.json');
