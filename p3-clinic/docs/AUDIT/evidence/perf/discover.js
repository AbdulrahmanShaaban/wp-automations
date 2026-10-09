// discover.js — READ-ONLY audit helper (docs/AUDIT/evidence/perf only).
// Fetches the 5 audited pages + robots/sitemap + status codes, saves raw HTML
// and an SEO extract (title/desc/canonical/robots/OG/JSON-LD/lang/h1/images/links).
// Adapted from p1-fashion-store docs/AUDIT/evidence/perf/discover.js.
// Usage: node discover.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const BASE = 'http://localhost:8889';
const OUT = __dirname;

function get(url, { redirects = 0, maxRedirects = 6, method = 'GET' } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(url, { method, timeout: 60000, headers: { 'user-agent': 'p3-audit/1.0' } }, (res) => {
      const status = res.statusCode;
      if (status >= 300 && status < 400 && res.headers.location && redirects < maxRedirects) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        get(next, { redirects: redirects + 1, maxRedirects }).then((r) => {
          r.chain = [url].concat(r.chain || []);
          done(r);
        });
        return;
      }
      const buf = [];
      res.on('data', (c) => buf.push(c));
      res.on('end', () => done({
        status, headers: res.headers, body: Buffer.concat(buf).toString('utf8'),
        raw: Buffer.concat(buf), chain: [url], finalUrl: url,
      }));
    });
    req.on('error', (e) => done({ status: 0, headers: {}, body: '', raw: Buffer.alloc(0), error: String(e), chain: [url], finalUrl: url }));
    req.on('timeout', () => { req.destroy(); done({ status: 0, headers: {}, body: '', raw: Buffer.alloc(0), error: 'timeout', chain: [url], finalUrl: url }); });
    req.end();
  });
}

function grab(html, re, group = 1) {
  const m = html.match(re);
  return m ? m[group] : null;
}

// image intrinsic dimensions from bytes (JPEG/PNG/WebP/GIF/SVG)
function imageSize(buf) {
  try {
    if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) return { type: 'png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (buf.length > 6 && buf[0] === 0x47 && buf[1] === 0x49) return { type: 'gif', w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
    if (buf.length > 30 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') {
      const fmt = buf.slice(12, 16).toString('ascii');
      if (fmt === 'VP8X') return { type: 'webp', w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
      if (fmt === 'VP8 ') return { type: 'webp', w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      if (fmt === 'VP8L') { const b = buf.readUInt32LE(21); return { type: 'webp', w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) }; }
      return { type: 'webp', w: null, h: null };
    }
    if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { type: 'jpeg', h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        }
        i += 2 + buf.readUInt16BE(i + 2);
      }
      return { type: 'jpeg', w: null, h: null };
    }
    const head = buf.slice(0, 400).toString('utf8');
    if (head.includes('<svg')) {
      const w = grab(head, /viewBox="[^"]*\s+[\d.]+\s+([\d.]+)"/);
      const vb = grab(head, /viewBox="0 0 ([\d.]+) ([\d.]+)"/);
      if (vb) return { type: 'svg', w: Math.round(parseFloat(vb)), h: null };
      if (w) return { type: 'svg', w: Math.round(parseFloat(w)), h: null };
      return { type: 'svg', w: null, h: null };
    }
  } catch (e) { /* fall through */ }
  return { type: 'unknown', w: null, h: null };
}

function extractSeo(url, html, res, baseOrigin) {
  const title = grab(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDesc = grab(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
    || grab(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const canonicals = [...html.matchAll(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/gi)].map((m) => m[1]);
  const canonical = canonicals[0] || null;
  const robots = grab(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i);
  const lang = grab(html, /<html[^>]+lang=["']([^"']*)["']/i);
  const dir = grab(html, /<html[^>]+dir=["']([^"']*)["']/i);
  const og = {};
  for (const m of html.matchAll(/<meta[^>]+property=["']([a-z:og:]+)["'][^>]+content=["']([^"']*)["']/gi)) if (m[1].startsWith('og:')) og[m[1]] = m[2];
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
  // heading order: sequence of h1..h6 open tags in document order
  const headingSeq = [...html.matchAll(/<h([1-6])[\s>]/gi)].map((m) => Number(m[1]));
  const imgs = [];
  for (const m of html.matchAll(/<img[^>]*>/gi)) {
    const tag = m[0];
    imgs.push({
      src: (tag.match(/src=["']([^"']*)["']/i) || [])[1] || null,
      alt: (tag.match(/alt=["']([^"']*)["']/i) || [])[1] ?? null,
      w: (tag.match(/\swidth=["']?([0-9]+)/i) || [])[1] || null,
      h: (tag.match(/\sheight=["']?([0-9]+)/i) || [])[1] || null,
      lazy: /loading=["']lazy["']/i.test(tag),
      srcset: (tag.match(/srcset=["']([^"']*)["']/i) || [])[1] || null,
    });
  }
  const allAnchors = [];
  for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    allAnchors.push({ href: m[1], text: m[2].replace(/<[^>]+>/g, '').trim().slice(0, 60) });
  }
  const ids = new Set([...html.matchAll(/\sid=["']([^"']+)["']/gi)].map((m) => m[1]));
  const hashAnchors = [...new Set(allAnchors.filter((a) => a.href.startsWith('#')).map((a) => a.href))];
  const brokenHash = hashAnchors.filter((h) => h.length > 1 && !ids.has(h.slice(1)));
  const internal = allAnchors.filter((a) => {
    if (a.href.startsWith('#')) return false;
    try { return new URL(a.href, baseOrigin).origin === baseOrigin; } catch (e) { return false; }
  });
  const internalPaths = [...new Set(internal.map((a) => { try { const u = new URL(a.href, baseOrigin); return u.pathname + u.search + u.hash; } catch (e) { return a.href; } }))];
  return {
    url, finalUrl: res.finalUrl, status: res.status,
    redirectChain: (res.chain || []).length - 1,
    title, titleLen: title ? title.trim().length : 0,
    metaDesc, metaDescLen: metaDesc ? metaDesc.trim().length : 0,
    canonical, canonicalCount: canonicals.length, canonicals,
    robots, lang, dir,
    og, twitter: tw, jsonLd: jsonld, hreflang,
    h1Count: h1s, headingSeq,
    images: {
      count: imgs.length,
      missingAlt: imgs.filter((i) => i.alt === null).length,
      emptyAlt: imgs.filter((i) => i.alt === '').length,
      missingDims: imgs.filter((i) => !i.w || !i.h).length,
      lazy: imgs.filter((i) => i.lazy).length,
      withSrcset: imgs.filter((i) => i.srcset).length,
      sample: imgs.slice(0, 8),
    },
    hashAnchors, brokenHash,
    internalLinkCount: internal.length,
    internalPaths,
    bytes: Buffer.byteLength(res.body || '', 'utf8'),
    contentEncoding: res.headers['content-encoding'] || null,
    cacheControl: res.headers['cache-control'] || null,
  };
}

(async () => {
  const pages = [
    { id: 'home', path: '/' },
    { id: 'services', path: '/services/' },
    { id: 'team', path: '/team/' },
    { id: 'contact', path: '/contact/' },
    { id: 'book', path: '/book/' },
  ];
  const seo = {};
  for (const p of pages) {
    const url = BASE + p.path;
    const res = await get(url);
    fs.writeFileSync(path.join(OUT, 'html-' + p.id + '.html'), res.body || '');
    seo[p.id] = extractSeo(url, res.body || '', res, BASE);
    console.log(p.id, 'status=' + res.status, 'titleLen=' + seo[p.id].titleLen, 'h1=' + seo[p.id].h1Count,
      'lang=' + seo[p.id].lang, 'dir=' + seo[p.id].dir, 'canonical#=' + seo[p.id].canonicalCount,
      'robots=' + (seo[p.id].robots || 'none'), 'jsonld=' + seo[p.id].jsonLd.length,
      'imgs=' + seo[p.id].images.count + '/alt-miss=' + seo[p.id].images.missingAlt,
      'bytes=' + seo[p.id].bytes, 'enc=' + (seo[p.id].contentEncoding || 'none'));
  }

  // extra status-code / redirect / behaviour checks
  const statusChecks = {};
  const probes = [
    '/services', '/team', '/contact', '/book',
    '/nonexistent-page-xyz', '/wp-sitemap.xml', '/sitemap.xml', '/wp-sitemap-posts-page-1.xml',
    '/feed/', '/', '/?p=4', '/?page_id=4',
  ];
  for (const p of probes) {
    const r = await get(BASE + p);
    statusChecks[p] = { status: r.status, chain: r.chain, finalUrl: r.finalUrl };
    console.log('status', p, r.status, r.chain.length > 1 ? 'chain=' + r.chain.join(' -> ') : '');
  }
  // www / non-www
  for (const p of ['http://www.localhost:8889/', 'https://localhost:8889/']) {
    const r = await get(p);
    statusChecks[p] = { status: r.status, chain: r.chain, finalUrl: r.finalUrl, error: r.error || null };
    console.log('status', p, r.status, r.error || '', r.chain.length > 1 ? 'chain=' + r.chain.join(' -> ') : '');
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

  // og:image dimensions (fetch each unique og:image)
  const ogImages = {};
  for (const id of Object.keys(seo)) {
    const src = seo[id].og && seo[id].og['og:image'];
    if (!src || ogImages[src]) continue;
    const r = await get(src);
    const dims = imageSize(r.raw || Buffer.alloc(0));
    ogImages[src] = { status: r.status, contentType: r.headers['content-type'] || null, bytes: (r.raw || Buffer.alloc(0)).length, ...dims };
    console.log('og:image', src, r.status, dims.type, dims.w + 'x' + dims.h, ogImages[src].bytes + 'B');
  }

  fs.writeFileSync(path.join(OUT, 'seo-extract.json'), JSON.stringify({ seo, statusChecks, robotsTxt: robots.body, sitemapIndex: sitemapUrls, sitemaps: sitemapDetail, ogImages }, null, 2));
  console.log('done -> seo-extract.json');
})();
