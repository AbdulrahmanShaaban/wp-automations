#!/usr/bin/env node
/** Offline analysis of probe/axe evidence -> analysis-notes.json + console summary */
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));

const pages = ['home', 'services', 'team', 'contact', 'book'];
const notes = { generatedAt: new Date().toISOString(), pages: {}, crossPage: {} };

for (const p of pages) {
  const d = read(`probe-${p}-desktop.json`);
  const m = read(`probe-${p}-mobile.json`);
  const jd = d.probe; const jm = m.probe;
  const slimLinks = (j) => (j.links || []).map((l) => ({ t: (l.text || '').trim().slice(0, 40), h: l.href, ext: l.external, lang: l.lang || null }));
  const imgs = (j) => {
    const im = j.images;
    if (Array.isArray(im)) return im;
    if (im && typeof im === 'object') return im.items || im.list || [];
    return [];
  };
  notes.pages[p] = {
    lang: jd.lang, dir: jd.dir, title: jd.title,
    headingSkips: jd.headingSkips, h1: jd.h1Count, hiddenHeadings: jd.hiddenHeadingCount,
    landmarks: jd.landmarks,
    focusables: jd.focusableCount,
    imagesNoAlt: imgs(jd).filter((i) => !i.alt && i.alt !== '').map((i) => ({ src: (i.src || '').slice(-60), alt: i.alt })),
    imagesTotal: imgs(jd).length,
    digits: jd.digits, langEnCount: jd.langEnCount, bdiCount: jd.bdiCount,
    foreignRuns: (jd.foreignRuns || []).slice(0, 12),
    ctaLinks: slimLinks(jd).filter((l) => /احجز/.test(l.t)),
    allLinks: slimLinks(jd),
    targets: { total: jd.targetTotal, small: (jd.targets || []).filter((t) => t.small).map((t) => ({ label: (t.label || t.selector || '').slice(0, 50), w: t.w, h: t.h })) },
    targets390: { total: jm.targetTotal, small: (jm.targets || []).filter((t) => t.small).map((t) => ({ label: (t.label || t.selector || '').slice(0, 50), w: t.w, h: t.h })) },
    overflowX: { desktop: jd.overflowX, mobile: jm.overflowX },
    nav: jd.nav,
    forms: jd.forms,
    unlabelled: jd.unlabelled,
    reveal: { desktop: jd.reveal, mobile: jm.reveal },
    motion: { desktop: jd.motion, mobile: jm.motion },
    typography: jd.typography,
    lowLineHeight: jd.lowLineHeight,
    contrast: jd.contrast,
    skipLink: jd.skipLink,
    firstFocusables: jd.firstFocusables,
  };
}

// cross-page: duplicate link texts with different hrefs (CTA honesty)
const cta = [];
for (const p of pages) for (const l of (notes.pages[p].ctaLinks || [])) cta.push({ page: p, ...l });
const byText = {};
for (const c of cta) { (byText[c.t] = byText[c.t] || []).push(`${c.page}->${c.h}`); }
notes.crossPage.ctaByLabel = byText;

// heading-order evidence from axe
const axeV = [];
for (const p of pages) {
  for (const vp of ['desktop', 'mobile']) {
    const a = read(`axe-${p}-${vp}.json`);
    for (const v of a.violations) axeV.push({ page: p, vp, id: v.id, impact: v.impact, count: v.nodes, sample: (v.sample || []).map((n) => ({ target: n.target, html: n.html.slice(0, 160), summary: (n.failureSummary || '').slice(0, 220) })) });
  }
}
notes.crossPage.axeViolations = axeV;

fs.writeFileSync(path.join(OUT, 'analysis-notes.json'), JSON.stringify(notes, null, 1));
console.log('wrote analysis-notes.json');
console.log('CTA labels -> hrefs:', JSON.stringify(byText, null, 1));
console.log('axe violations:', JSON.stringify(axeV, null, 1));
for (const p of pages) {
  const n = notes.pages[p];
  console.log(`-- ${p}: lang=${n.lang} dir=${n.dir} skips=${JSON.stringify(n.headingSkips)} imgsNoAlt=${n.imagesNoAlt.length} foreign=${n.foreignRuns.length} small390=${n.targets390.small.length}/${n.targets390.total} overflow=${JSON.stringify(n.overflowX)} langEn=${n.langEnCount} bdi=${n.bdiCount} digits=${JSON.stringify(n.digits)}`);
  if (n.foreignRuns.length) console.log('   foreign:', JSON.stringify(n.foreignRuns.slice(0, 6)));
  if (n.targets390.small.length) console.log('   small390:', JSON.stringify(n.targets390.small.slice(0, 6)));
}
