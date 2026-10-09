// seo-extra.js — READ-ONLY audit helper (docs/AUDIT/evidence/perf only).
// Fills gaps in discover.js: (1) /checkout/ HTML with a seeded cart cookie,
// (2) og:image response headers, (3) raw JSON-LD type dump, (4) font loading
// hints in HTML, (5) home internal-link sanity, (6) sitemap URL list sanity.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const BASE = 'http://localhost:8888';
const OUT = __dirname;

function req(url, { method = 'GET', cookie = '', body = null, redirects = 0 } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const u = new URL(url);
    const headers = { Host: u.host };
    if (cookie) headers.cookie = cookie;
    if (body) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(body); }
    const r = http.request(url, { method, timeout: 60000, headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
        res.resume();
        return done(req(new URL(res.headers.location, url).toString(), { method, cookie, body, redirects: redirects + 1 }).then((x) => { x.chain = [url].concat(x.chain || []); return x; }));
      }
      const buf = [];
      res.on('data', (c) => buf.push(c));
      res.on('end', () => done({ status: res.statusCode, headers: res.headers, body: Buffer.concat(buf).toString('utf8'), chain: [url] }));
    });
    r.on('error', (e) => done({ status: 0, headers: {}, body: '', error: String(e), chain: [url] }));
    r.on('timeout', () => { r.destroy(); done({ status: 0, headers: {}, body: '', error: 'timeout', chain: [url] }); });
    if (body) r.write(body);
    r.end();
  });
}

async function seedCart() {
  const probe = await req(BASE + '/wp-json/wc/store/v1/cart');
  const nonce = probe.headers.nonce || '';
  const add = await req(BASE + '/wp-json/wc/store/v1/cart/add-item', { method: 'POST', cookie: nonce ? 'wp-store-api-nonce=' + nonce : '', body: JSON.stringify({ id: 38, quantity: 1 }) });
  const jar = (add.headers['set-cookie'] || []).map((c) => c.split(';')[0]).filter(Boolean);
  const token = add.headers['cart-token'];
  if (token && !jar.some((c) => c.startsWith('cart_token='))) jar.push('cart_token=' + token);
  // nonce for POST must be sent as Nonce header; redo properly if needed
  if (add.status >= 400) {
    const add2 = await new Promise((resolve) => {
      const payload = JSON.stringify({ id: 38, quantity: 1 });
      const rq = http.request(BASE + '/wp-json/wc/store/v1/cart/add-item', {
        method: 'POST', timeout: 60000,
        headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, nonce ? { Nonce: nonce } : {}, jar.length ? { cookie: jar.join('; ') } : {}),
      }, (res) => { const b = []; res.on('data', (c) => b.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(b).toString('utf8') })); });
      rq.on('error', () => resolve({ status: 0, headers: {}, body: '' }));
      rq.write(payload); rq.end();
    });
    for (const c of (add2.headers['set-cookie'] || [])) { const p = c.split(';')[0]; if (p) jar.push(p); }
    if (add2.headers['cart-token'] && !jar.some((c) => c.startsWith('cart_token='))) jar.push('cart_token=' + add2.headers['cart-token']);
    console.log('seed retry: HTTP ' + add2.status);
  }
  return { cookie: jar.join('; '), addStatus: add.status };
}

(async () => {
  const out = {};
  const { cookie, addStatus } = await seedCart();
  console.log('cart cookie: ' + (cookie ? cookie.split(';').map((c) => c.split('=')[0]).join(',') : 'NONE') + ' (add=' + addStatus + ')');

  // 1) checkout with cart
  const co = await req(BASE + '/checkout/', { cookie });
  fs.writeFileSync(path.join(OUT, 'html-checkout-incart.html'), co.body);
  out.checkoutInCart = {
    status: co.status, chain: co.chain, bytes: Buffer.byteLength(co.body, 'utf8'),
    title: (co.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1],
    canonical: (co.body.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) || [])[1],
    robots: (co.body.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i) || [])[1],
    ogImage: (co.body.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || [])[1],
    hasOrderSummary: /wc-block-components-order-summary|wc-block-checkout/i.test(co.body),
  };
  console.log('checkout-with-cart: ' + co.status + ' canonical=' + out.checkoutInCart.canonical + ' robots=' + out.checkoutInCart.robots);

  // 2) og:image headers
  const ogTargets = [BASE + '/wp-content/uploads/2026/10/og-nilad.jpg', BASE + '/wp-content/uploads/2026/10/abaya.jpg'];
  out.ogImages = {};
  for (const u of ogTargets) {
    const r = await req(u);
    const b = Buffer.from(r.body, 'binary');
    let dims = null;
    if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) { // JPEG SOF scan
      let i = 2;
      while (i < b.length - 9) {
        if (b[i] !== 0xff) { i++; continue; }
        const marker = b[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          dims = { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) }; break;
        }
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
    out.ogImages[u] = { status: r.status, contentType: r.headers['content-type'], contentLength: r.headers['content-length'], transfer: b.length, dims, cacheControl: r.headers['cache-control'] };
    console.log('og:image ' + path.basename(u) + ' -> ' + r.status + ' ' + r.headers['content-type'] + ' ' + b.length + 'B dims=' + JSON.stringify(dims));
  }

  // 3) JSON-LD raw types on saved HTML
  out.jsonLd = {};
  for (const id of ['home', 'shop', 'product', 'cart', 'contact']) {
    const f = path.join(OUT, 'html-' + id + '.html');
    if (!fs.existsSync(f)) continue;
    const html = fs.readFileSync(f, 'utf8');
    const blocks = [];
    for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const j = JSON.parse(m[1]);
        const list = j['@graph'] || [j];
        blocks.push(list.map((x) => ({ type: x['@type'], name: x.name || (x.alternateName || ''), id: x['@id'] || null })).slice(0, 6));
      } catch (e) { blocks.push([{ type: '<parse error>', err: String(e.message).slice(0, 60) }]); }
    }
    out.jsonLd[id] = blocks;
  }

  // 4) font hints in HTML
  out.fonts = {};
  for (const id of ['home', 'product', 'cart']) {
    const f = path.join(OUT, 'html-' + id + '.html');
    if (!fs.existsSync(f)) continue;
    const html = fs.readFileSync(f, 'utf8');
    out.fonts[id] = {
      preconnect: [...html.matchAll(/<link[^>]+rel=["']preconnect["'][^>]+href=["']([^"']+)["']/gi)].map((m) => m[1]),
      dnsPrefetch: [...html.matchAll(/<link[^>]+rel=["']dns-prefetch["'][^>]+href=["']([^"']+)["']/gi)].map((m) => m[1]),
      preloadFonts: [...html.matchAll(/<link[^>]+rel=["']preload["'][^>]+href=["']([^"']+\.(?:woff2?|ttf|otf))[^"']*["']/gi)].map((m) => m[1]),
      fontStylesheets: [...html.matchAll(/<link[^>]+href=["']([^"']*fonts\.googleapis[^"']*)["']/gi)].map((m) => m[1]),
      fontFacesInInlineCss: [...html.matchAll(/@font-face[^}]*font-family:\s*['"]?([A-Za-z ]+)['"]?[^}]*}/g)].map((m) => ({ family: m[1], block: m[0].slice(0, 220) })),
      arabicFontsReferenced: [...new Set([...html.matchAll(/font-family:\s*['"]?([A-Za-z\- ]+?)['"]?\s*[;,]/g)].map((m) => m[1]))].slice(0, 20),
    };
    console.log('fonts ' + id + ': preconnect=' + out.fonts[id].preconnect.length + ' preload=' + out.fonts[id].preloadFonts.length + ' googleapis=' + out.fonts[id].fontStylesheets.length);
  }

  // 5) home internal links sanity (same-origin hrefs + hash anchors)
  const homeHtml = fs.readFileSync(path.join(OUT, 'html-home.html'), 'utf8');
  const hrefs = [...new Set([...homeHtml.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)].map((m) => m[1]))];
  const sameOrigin = hrefs.filter((h) => h.startsWith(BASE) || h.startsWith('/'));
  const hashOnly = hrefs.filter((h) => h.startsWith('#'));
  const ids = new Set([...homeHtml.matchAll(/\sid=["']([^"']+)["']/gi)].map((m) => m[1]));
  const brokenHash = hashOnly.filter((h) => h.length > 1 && !ids.has(h.slice(1)));
  out.homeLinks = { total: hrefs.length, sameOrigin: sameOrigin.length, hashAnchors: hashOnly, brokenHashAnchors: brokenHash, sample: sameOrigin.slice(0, 25) };
  // status-check a sample of unique same-origin paths
  const paths = [...new Set(sameOrigin.map((h) => { try { const u = new URL(h, BASE); return u.pathname + u.search; } catch (e) { return h; } }))].slice(0, 30);
  out.homeLinkStatus = {};
  for (const p of paths) {
    const r = await req(BASE + p);
    out.homeLinkStatus[p] = r.status;
  }
  const broken = Object.entries(out.homeLinkStatus).filter(([, s]) => s >= 400 || s === 0);
  console.log('home links: ' + sameOrigin.length + ' same-origin, broken=' + JSON.stringify(broken));

  // 6) sitemap sanity
  const sm = JSON.parse(fs.readFileSync(path.join(OUT, 'seo-extract.json'), 'utf8'));
  const allLocs = [];
  for (const [k, v] of Object.entries(sm.sitemaps || {})) allLocs.push(...v.locs);
  out.sitemap = { childCount: Object.keys(sm.sitemaps || {}).length, urlCount: allLocs.length, urls: allLocs, hasShop: allLocs.some((u) => /\/shop\/?$/.test(u)), hasContact: allLocs.some((u) => /\/contact\/?$/.test(u)), hasProduct: allLocs.some((u) => /\/product\//.test(u)), hasCart: allLocs.some((u) => /\/cart|\/checkout|my-account/.test(u)), hasUser: allLocs.some((u) => /\/author|user/.test(u)) };
  console.log('sitemap urls=' + out.sitemap.urlCount + ' shop=' + out.sitemap.hasShop + ' contact=' + out.sitemap.hasContact + ' product=' + out.sitemap.hasProduct + ' cart/checkout/my-account=' + out.sitemap.hasCart);

  fs.writeFileSync(path.join(OUT, 'seo-extra.json'), JSON.stringify(out, null, 2));
  console.log('done -> seo-extra.json');
})();
