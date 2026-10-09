// discover.js — READ-ONLY audit helper (docs/AUDIT/evidence/perf only).
// Fetches pages + robots/sitemap + status codes, saves raw HTML and an SEO extract.
// Usage: node discover.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE = 'http://localhost:8888';
const OUT = __dirname;

function get(url, { redirects = 0, cookie = '', maxRedirects = 5 } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const req = http.get(url, { timeout: 60000, headers: cookie ? { cookie } : {} }, (res) => {
      const status = res.statusCode;
      if (status >= 300 && status < 400 && res.headers.location && redirects < maxRedirects) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        get(next, { redirects: redirects + 1, cookie, maxRedirects }).then((r) => {
          r.chain = [url].concat(r.chain || []);
          done(r);
        });
        return;
      }
      let buf = [];
      res.on('data', (c) => buf.push(c));
      res.on('end', () => done({
        status, headers: res.headers, body: Buffer.concat(buf).toString('utf8'),
        chain: [url], finalUrl: url,
      }));
    });
    req.on('error', (e) => done({ status: 0, headers: {}, body: '', error: String(e), chain: [url], finalUrl: url }));
    req.on('timeout', () => { req.destroy(); done({ status: 0, headers: {}, body: '', error: 'timeout', chain: [url], finalUrl: url }); });
  });
}

function grab(html, re, group = 1) {
  const m = html.match(re);
  return m ? m[group] : null;
}

function extractSeo(url, html, res) {
  const title = grab(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDesc = grab(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
    || grab(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const canonical = grab(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i);
  const robots = grab(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i);
  const lang = grab(html, /<html[^>]+lang=["']([^"']*)["']/i);
  const dir = grab(html, /<html[^>]+dir=["']([^"']*)["']/i);
  const og = {};
  for (const m of html.matchAll(/<meta[^>]+property=["'](og:[a-z:]+)["'][^>]+content=["']([^"']*)["']/gi)) og[m[1]] = m[2];
  for (const m of html.matchAll(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["'](og:[a-z:]+)"/gi)) if (!og[m[2]]) og[m[2]] = m[1];
  const tw = {};
  for (const m of html.matchAll(/<meta[^>]+name=["'](twitter:[a-z:]+)["'][^>]+content=["']([^"']*)["']/gi)) tw[m[1]] = m[2];
  const jsonld = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(m[1]);
      const types = [].concat(parsed['@type'] || []).concat((parsed['@graph'] || []).map((x) => x['@type']));
      jsonld.push({ types: types.map(String), raw: m[1].length });
    } catch (e) {
      jsonld.push({ types: ['<unparsable>'], raw: m[1].length, err: String(e.message || e).slice(0, 80) });
    }
  }
  const hreflang = [];
  for (const m of html.matchAll(/<link[^>]+rel=["']alternate["'][^>]+hreflang=["']([^"']+)["'][^>]+href=["']([^"']*)["']/gi)) hreflang.push(m[1]);
  const h1s = (html.match(/<h1[\s>]/gi) || []).length;
  const imgs = [];
  for (const m of html.matchAll(/<img[^>]*>/gi)) {
    const tag = m[0];
    imgs.push({
      src: (tag.match(/src=["']([^"']*)["']/i) || [])[1] || null,
      alt: (tag.match(/alt=["']([^"']*)["']/i) || [])[1] ?? null,
      w: (tag.match(/\swidth=["']?([0-9]+)/i) || [])[1] || null,
      h: (tag.match(/\sheight=["']?([0-9]+)/i) || [])[1] || null,
      lazy: /loading=["']lazy["']/i.test(tag),
    });
  }
  const anchors = [];
  for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1];
    if (href.startsWith('#')) anchors.push(href);
  }
  return {
    url, finalUrl: res.finalUrl, status: res.status,
    redirectChain: (res.chain || []).length - 1,
    title, titleLen: title ? title.trim().length : 0,
    metaDesc, metaDescLen: metaDesc ? metaDesc.trim().length : 0,
    canonical, robots, lang, dir,
    og, twitter: tw, jsonLd: jsonld, hreflang,
    h1Count: h1s,
    images: { count: imgs.length, missingAlt: imgs.filter((i) => i.alt === null).length, missingDims: imgs.filter((i) => !i.w || !i.h).length, lazy: imgs.filter((i) => i.lazy).length, sample: imgs.slice(0, 5) },
    hashAnchors: [...new Set(anchors)],
    bytes: Buffer.byteLength(res.body || '', 'utf8'),
  };
}

(async () => {
  const pages = [
    { id: 'home', path: '/' },
    { id: 'shop', path: '/shop/' },
    { id: 'product', path: '/product/embroidered-abaya/' },
    { id: 'cart', path: '/cart/' },
    { id: 'checkout', path: '/checkout/' },
    { id: 'contact', path: '/contact/' },
  ];
  const seo = {};
  for (const p of pages) {
    const url = BASE + p.path;
    const res = await get(url);
    fs.writeFileSync(path.join(OUT, 'html-' + p.id + '.html'), res.body || '');
    seo[p.id] = extractSeo(url, res.body || '', res);
    console.log(p.id, 'status=' + res.status, 'titleLen=' + seo[p.id].titleLen, 'h1=' + seo[p.id].h1Count, 'lang=' + seo[p.id].lang, 'robots=' + seo[p.id].robots);
  }

  // extra status-code checks
  const statusChecks = {};
  for (const p of ['/checkout/', '/my-account/', '/nonexistent-page-xyz', '/shop/', '/product/embroidered-abaya/', '/?post_type=product', '/?p=38', '/wp-sitemap.xml', '/sitemap.xml', '/cart/', '/feed/']) {
    const r = await get(BASE + p);
    statusChecks[p] = { status: r.status, chain: r.chain, finalUrl: r.finalUrl };
    console.log('status', p, r.status, r.chain.length > 1 ? 'chain=' + r.chain.join(' -> ') : '');
  }

  // robots.txt + sitemaps
  const robots = await get(BASE + '/robots.txt');
  fs.writeFileSync(path.join(OUT, 'robots.txt'), robots.body || '');
  const smIndex = await get(BASE + '/wp-sitemap.xml');
  fs.writeFileSync(path.join(OUT, 'sitemap-index.xml'), smIndex.body || '');
  const sitemapUrls = [...(smIndex.body || '').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const sitemapDetail = {};
  for (const su of sitemapUrls) {
    const r = await get(su);
    const locs = [...(r.body || '').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    sitemapDetail[su] = { status: r.status, count: locs.length, locs };
    console.log('sitemap', su, r.status, locs.length + ' urls');
  }
  fs.writeFileSync(path.join(OUT, 'seo-extract.json'), JSON.stringify({ seo, statusChecks, robotsTxt: robots.body, sitemapIndex: sitemapUrls, sitemaps: sitemapDetail }, null, 2));
  console.log('done -> seo-extract.json');
})();
