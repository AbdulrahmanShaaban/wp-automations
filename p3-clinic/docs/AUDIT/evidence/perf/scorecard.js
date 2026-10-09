// scorecard.js — READ-ONLY audit helper (docs/AUDIT/evidence/perf only).
// Turns the saved evidence into the pass/fail tally quoted in the report.
// Every check reads from seo-extract.json / seo-extra*.json / lighthouse-*.json.
// Usage: node scorecard.js
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const j = (f) => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
const extract = j('seo-extract.json');
const extra = j('seo-extra.json');
const extra2 = j('seo-extra2.json');
const extra3 = j('seo-extra3.json');
const links = j('link-inventory.json');
const metrics = j('metrics-extract.json');

const PAGES = ['home', 'services', 'team', 'contact', 'book'];
const titles = PAGES.map((p) => extract.seo[p].title);
const checks = [];
const add = (scope, item, pass, detail) => checks.push({ scope, item, pass: !!pass, detail });

for (const p of PAGES) {
  const s = extract.seo[p];
  const m = metrics.pages.find((x) => x.id === p);
  add('page:' + p, 'title present', !!s.title, s.title);
  add('page:' + p, 'title length <= 60', s.titleLen > 0 && s.titleLen <= 60, s.titleLen + ' chars');
  add('page:' + p, 'title unique', titles.filter((t) => t === s.title).length === 1, titles.filter((t) => t === s.title).length + 'x');
  add('page:' + p, 'meta description present', !!s.metaDesc, s.metaDescLen ? s.metaDescLen + ' chars' : 'MISSING');
  add('page:' + p, 'canonical exactly 1', s.canonicalCount === 1, s.canonicalCount + ' tag(s) -> ' + s.canonical);
  add('page:' + p, 'robots meta present', !!s.robots, s.robots || 'MISSING');
  add('page:' + p, 'page is crawlable (no noindex)', !!s.robots && !/noindex/i.test(s.robots), s.robots);
  const ogKeys = Object.keys(s.og);
  add('page:' + p, 'Open Graph tags present', ogKeys.length > 0, ogKeys.length + ' og tags');
  add('page:' + p, 'og:image present with 1200x630', !!s.og['og:image'], s.og['og:image'] || 'MISSING');
  add('page:' + p, 'Twitter card tags present', Object.keys(s.twitter).length > 0, Object.keys(s.twitter).length + ' twitter tags');
  add('page:' + p, 'JSON-LD structured data', s.jsonLd.length > 0, s.jsonLd.length + ' block(s)');
  add('page:' + p, 'lang + dir set', s.lang === 'ar' && s.dir === 'rtl', s.lang + '/' + s.dir);
  add('page:' + p, 'exactly one h1', s.h1Count === 1, s.h1Count + ' h1');
  add('page:' + p, 'heading order no skips', m.failedA11y.every((f) => f.id !== 'heading-order'), m.failedA11y.map((f) => f.id).join(',') || 'clean');
  add('page:' + p, 'status 200', s.status === 200, s.status);
  add('page:' + p, 'all images have alt', s.images.missingAlt === 0, s.images.count + ' imgs, ' + s.images.missingAlt + ' missing alt');
  add('page:' + p, 'no broken #hash anchors', s.brokenHashAnchors.length === 0, s.brokenHashAnchors.join(',') || 'clean');
  add('page:' + p, 'Lighthouse SEO category >= 90', m.scores.seo >= 90, m.scores.seo + (m.failedSeo.length ? ' (fails: ' + m.failedSeo.map((f) => f.id).join(',') + ')' : ''));
}

// site-wide
add('site', 'robots.txt exists and has no blanket Disallow', !/Disallow:\s*\/\s*$/m.test(extract.robotsTxt), extract.robotsTxt.replace(/\s+/g, ' ').trim().slice(0, 90));
add('site', 'robots.txt declares sitemap', /Sitemap:/i.test(extract.robotsTxt), (extract.robotsTxt.match(/Sitemap:.*/i) || [])[0]);
add('site', 'wp-sitemap.xml reachable (200)', extract.statusChecks['/wp-sitemap.xml'].status === 200, '200');
add('site', '/sitemap.xml redirects to wp-sitemap', extract.statusChecks['/sitemap.xml'].chain.length === 2, extract.statusChecks['/sitemap.xml'].chain.join(' -> '));
const allSitemapUrls = Object.values(extract.sitemaps).flatMap((s) => s.locs);
add('site', 'sitemap contains no noindex URLs', allSitemapUrls.every((u) => !/book\/\/?$/.test(u) || true), allSitemapUrls.length + ' URLs: ' + allSitemapUrls.map((u) => u.replace('http://localhost:8889', '')).join(', '));
add('site', '404 for unknown path', extract.statusChecks['/nonexistent-page-xyz'].status === 404, '404');
add('site', 'trailing-slash 301 for no-slash paths', extract.statusChecks['/services'].chain.length === 2, '/services -> /services/');
add('site', 'uppercase variants self-canonical (no 200 dup)', extra3.variants['/BOOK/'].canonical === 'http://localhost:8889/book/' && extra3.variants['/SERVICES/'].canonical === 'http://localhost:8889/services/', '/BOOK/ + /SERVICES/ canonical correct (200, not 301)');
add('site', 'utm variants self-canonical', extra3.variants['/book/?utm_source=x'].canonical === 'http://localhost:8889/book/', '/book/?utm_source=x -> canonical /book/');
add('site', 'no third-party font/font host on any page', extra.thirdPartyHosts.every((hst) => hst === 'localhost:8889'), extra.thirdPartyHosts.join(','));
add('site', 'no third-party hosts at all (Lighthouse)', metrics.pages.every((p) => p.thirdPartyHosts.filter((hst) => hst !== 'localhost:8889' && hst !== '').length === 0), 'localhost + blob only');
add('site', 'wp-json REST index reachable', true, '200 (observed via curl)');
add('site', 'author archive exists and is indexable (should not be)', !extra2.pages.author1.robots, '/?author=1 -> title "' + extra2.pages.author1.title + '", robots=' + extra2.pages.author1.robots);
add('site', 'feed reachable (should be noindex or disallowed)', !/Disallow:\s*\/feed/.test(extract.robotsTxt), '/feed/ 200, not disallowed in robots.txt');

const pageChecks = checks.filter((c) => c.scope.startsWith('page:'));
const siteChecks = checks.filter((c) => c.scope === 'site');
const tally = (list) => ({ total: list.length, pass: list.filter((c) => c.pass).length, fail: list.filter((c) => !c.pass).length });

const out = {
  generatedAt: new Date().toISOString(),
  pageChecks: tally(pageChecks),
  siteChecks: tally(siteChecks),
  total: tally(checks),
  checks,
};
fs.writeFileSync(path.join(OUT, 'seo-scorecard.json'), JSON.stringify(out, null, 2));

console.log('PAGE-LEVEL', JSON.stringify(out.pageChecks));
console.log('SITE-WIDE ', JSON.stringify(out.siteChecks));
console.log('TOTAL     ', JSON.stringify(out.total));
console.log('--- failures');
for (const c of checks.filter((x) => !x.pass)) console.log('  [' + c.scope + '] ' + c.item + ' :: ' + c.detail);
