// seo-extra.js — READ-ONLY audit helper (docs/AUDIT/evidence/perf only).
// Case-variant duplicate check, og:image dims, internal link inventory, font/image files.
// Usage: node seo-extra.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE = 'http://localhost:8889';
const OUT = __dirname;

function req(url, method = 'GET') {
  return new Promise((resolve) => {
    const r = http.request(url, { method, timeout: 120000 }, (res) => {
      let buf = [];
      res.on('data', (c) => buf.push(c));
      res.on('end', () => {
        const body = Buffer.concat(buf);
        resolve({ status: res.statusCode, headers: res.headers, raw: body });
      });
    });
    r.on('error', (e) => resolve({ status: 0, headers: {}, raw: Buffer.alloc(0), error: String(e) }));
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, headers: {}, raw: Buffer.alloc(0), error: 'timeout' }); });
    r.end();
  });
}

// PNG/JPEG dimension probe from magic bytes (no deps)
function imageDims(buf) {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { type: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { type: 'jpeg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
    return { type: 'jpeg', width: null, height: null };
  }
  if (buf.length > 12 && buf.slice(4, 8).toString() === 'ftyp') {
    const brand = buf.slice(8, 12).toString();
    if (brand.startsWith('avif') || brand === 'mif1') return { type: 'avif', width: null, height: null };
    if (brand === 'heic' || brand === 'heix') return { type: brand, width: null, height: null };
  }
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') {
    const fmt = buf.slice(12, 16).toString();
    if (fmt === 'VP8 ') return { type: 'webp', width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (fmt === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { type: 'webp', width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    return { type: 'webp', width: null, height: null };
  }
  return { type: 'unknown(' + buf.slice(0, 4).toString('hex') + ')', width: null, height: null };
}

(async () => {
  const out = { generatedAt: new Date().toISOString(), base: BASE };

  // ---- 1. case-variant / duplicate-URL probes (no-redirect, headers only)
  out.duplicates = {};
  for (const p of ['/BOOK/', '/book/', '/Services/', '/TEAM/', '/?page_id=5', '/?p=5', '/index.php/services/', '/book//', '/book/?utm_source=x']) {
    const r = await req(BASE + p, 'HEAD');
    out.duplicates[p] = { status: r.status, location: r.headers.location || null };
  }
  // canonical on the uppercase variant
  const upper = await req(BASE + '/BOOK/');
  const upperHtml = upper.raw.toString('utf8');
  fs.writeFileSync(path.join(OUT, 'html-BOOK-uppercase.html'), upperHtml);
  out.uppercaseBook = {
    status: upper.status,
    canonical: (upperHtml.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i) || [])[1] || null,
    title: (upperHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || null,
    robots: (upperHtml.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i) || [])[1] || null,
  };

  // ---- 2. internal link inventory from saved homepage HTML + status check of each
  const homeHtml = fs.readFileSync(path.join(OUT, 'html-home.html'), 'utf8');
  const links = [...new Set([...homeHtml.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)].map((m) => m[1]))];
  out.homeLinks = { count: links.length, items: [] };
  for (const l of links) {
    const abs = l.startsWith('http') ? l : BASE + l;
    const clean = abs.split('#')[0];
    const r = await req(clean, 'HEAD');
    out.homeLinks.items.push({ href: l, status: r.status });
  }

  // hash anchors across all saved pages + id targets
  out.hashAnchors = {};
  for (const id of ['home', 'services', 'team', 'contact', 'book']) {
    const h = fs.readFileSync(path.join(OUT, 'html-' + id + '.html'), 'utf8');
    const anchors = [...new Set([...h.matchAll(/href=["'](#[^"']*)["']/g)].map((m) => m[1]))];
    const ids = [...new Set([...h.matchAll(/\sid=["']([^"']+)["']/g)].map((m) => m[1]))];
    out.hashAnchors[id] = {
      anchors,
      broken: anchors.filter((a) => !ids.includes(a.slice(1))),
      idCount: ids.length,
      ids,
    };
  }

  // ---- 3. image files actually referenced by the saved HTML: dims + bytes + format
  const seen = new Set();
  out.images = [];
  for (const id of ['home', 'services', 'team', 'contact', 'book']) {
    const h = fs.readFileSync(path.join(OUT, 'html-' + id + '.html'), 'utf8');
    for (const m of h.matchAll(/<img[^>]*>/gi)) {
      const src = (m[0].match(/src=["']([^"']+)["']/i) || [])[1];
      if (!src || src.startsWith('data:')) continue;
      const abs = src.startsWith('http') ? src : BASE + src;
      if (seen.has(abs)) { const e = out.images.find((x) => x.url === abs); e.pages.push(id); continue; }
      seen.add(abs);
      const r = await req(abs);
      out.images.push({
        url: src, pages: [id], status: r.status,
        contentType: r.headers['content-type'] || null,
        bytes: r.raw.length,
        ...imageDims(r.raw),
      });
    }
  }
  out.imageTotals = {
    files: out.images.length,
    bytes: out.images.reduce((s, i) => s + i.bytes, 0),
    oversized: out.images.filter((i) => i.bytes > 120000).map((i) => i.url),
    webpOrAvif: out.images.filter((i) => i.type === 'webp' || i.type === 'avif').map((i) => i.url),
  };

  // ---- 4. font files: every @font-face src in the theme CSS + every font-ish request in saved HTML
  const cssUrls = [...new Set([...homeHtml.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi)].map((m) => m[1]))];
  out.stylesheets = [];
  const fontFaces = [];
  for (const cu of cssUrls) {
    const abs = cu.startsWith('http') ? cu : BASE + cu;
    const r = await req(abs);
    const css = r.raw.toString('utf8');
    out.stylesheets.push({ url: cu.replace(BASE, ''), status: r.status, bytes: r.raw.length, encoding: r.headers['content-encoding'] || null });
    for (const fm of css.matchAll(/@font-face\s*\{[\s\S]*?\}/g)) {
      const block = fm[0];
      const fam = (block.match(/font-family:\s*["']?([^;"']+)/i) || [])[1] || null;
      const srcs = [...block.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1].replace(/["']/g, '').replace(/^\.\//, ''));
      const resolved = srcs.map((s) => {
        try { return new URL(s, abs).toString(); } catch (e) { return abs; }
      });
      const weight = (block.match(/font-weight:\s*([^;]+)/i) || [])[1] || null;
      const range = (block.match(/unicode-range:\s*([^;]+)/i) || [])[1] || null;
      fontFaces.push({ stylesheet: cu.replace(BASE, ''), family: fam, weight: weight ? weight.trim() : null, srcs: resolved, range: range ? range.trim() : null });
    }
  }
  out.fontFaces = fontFaces;
  out.fontFiles = [];
  for (const f of fontFaces) {
    for (const s of f.srcs) {
      const abs = s.startsWith('http') ? s : BASE + s;
      const r = await req(abs);
      out.fontFiles.push({ family: f.family, weight: f.weight, url: s.replace(BASE, ''), status: r.status, bytes: r.raw.length, sameOrigin: abs.startsWith(BASE) });
    }
  }
  out.thirdPartyHosts = [...new Set([...homeHtml.matchAll(/(?:src|href)=["'](https?:\/\/[^/"']+)/gi)].map((m) => new URL(m[1]).host))];

  fs.writeFileSync(path.join(OUT, 'seo-extra.json'), JSON.stringify(out, null, 2));
  console.log('done -> seo-extra.json');
  console.log('thirdPartyHosts', JSON.stringify(out.thirdPartyHosts));
  console.log('fontFiles', out.fontFiles.length, 'bytes', out.fontFiles.reduce((s, f) => s + f.bytes, 0));
  console.log('images', JSON.stringify(out.imageTotals));
  console.log('homeLinks', JSON.stringify(out.homeLinks.items));
  console.log('duplicates', JSON.stringify(out.duplicates));
  console.log('uppercaseBook', JSON.stringify(out.uppercaseBook));
  for (const [k, v] of Object.entries(out.hashAnchors)) console.log('hash', k, 'broken=' + JSON.stringify(v.broken), 'ids=' + v.idCount);
})();
