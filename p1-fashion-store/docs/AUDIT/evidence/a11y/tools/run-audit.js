#!/usr/bin/env node
/**
 * Read-only a11y + Arabic/RTL audit runner (2026-10-06).
 *
 * Runs axe-core 4.13 + DOM probes on 6 pages x 2 viewports against the LIVE
 * local site, plus motion (no-JS / reduced-motion) probes. Writes JSON evidence
 * into ../ (docs/AUDIT/evidence/a11y/). Touches no project files.
 *
 * Usage: node docs/AUDIT/evidence/a11y/tools/run-audit.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8888';
const OUT = path.join(__dirname, '..');
const AXE_SRC = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const chromeLauncher = require('chrome-launcher');
const WebSocket = require('ws');

const PAGES = [
  { id: 'home', url: `${BASE}/` },
  { id: 'shop', url: `${BASE}/shop/` },
  { id: 'product', url: `${BASE}/product/linen-scarf/` },
  { id: 'cart', url: `${BASE}/cart/` },
  { id: 'checkout', url: `${BASE}/checkout/` },
  { id: 'contact', url: `${BASE}/contact/` },
];
const VIEWPORTS = [
  { name: 'desktop', w: 1440, h: 900, mobile: false },
  { name: 'mobile', w: 390, h: 844, mobile: true },
];
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

const write = (name, data) => {
  const file = path.join(OUT, name);
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 1));
  console.log('  wrote ' + name);
};

/* ---------------------------------------------------------------- cart seed */
async function seedCart() {
  const jar = new Map();
  const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  const absorb = (res) => {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const c of list) {
      const pair = c.split(';')[0];
      const i = pair.indexOf('=');
      jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  };

  const g = await fetch(`${BASE}/wp-json/wc/store/v1/cart`, { headers: { Cookie: cookieHeader() } });
  absorb(g);
  const nonce = g.headers.get('Nonce');
  const cartToken = g.headers.get('Cart-Token');
  const before = await g.json();

  const pr = await fetch(`${BASE}/wp-json/wc/store/v1/products?per_page=5&orderby=date&order=desc`, {
    headers: { Cookie: cookieHeader() },
  });
  absorb(pr);
  const products = await pr.json();
  const product = products.find((p) => p.is_in_stock) || products[0];

  const post = await fetch(`${BASE}/wp-json/wc/store/v1/cart/add-item`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader(),
      ...(nonce ? { Nonce: nonce } : {}),
      ...(cartToken ? { 'Cart-Token': cartToken } : {}),
    },
    body: JSON.stringify({ id: product.id, quantity: 1 }),
  });
  absorb(post);
  const after = await post.json();

  return {
    method: 'POST /wp-json/wc/store/v1/cart/add-item',
    product: { id: product.id, name: product.name, permalink: product.permalink },
    status: post.status,
    itemsCountBefore: before.items_count,
    itemsCountAfter: after.items_count,
    subtotalAfter: after.totals && after.totals.total_items,
    currency: after.totals && after.totals.currency_code,
    cookieNames: [...jar.keys()],
    cookiesOmitted: true,
    cookies: Object.fromEntries(jar),
  };
}

/* ------------------------------------------------------------------ CDP bits */
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) rej(new Error(m.error.message));
        else res(m.result);
      } else if (m.method) {
        (this.listeners.get(m.method) || []).forEach((fn) => fn(m.params));
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  once(method) {
    return new Promise((res) => {
      const arr = this.listeners.get(method) || [];
      const fn = (p) => {
        this.listeners.set(method, arr.filter((f) => f !== fn));
        res(p);
      };
      arr.push(fn);
      this.listeners.set(method, arr);
    });
  }
  eval(fn, awaitPromise = true) {
    const expression = `(${fn.toString()})()`;
    return this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true })
      .then((r) => {
        if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 800));
        return r.result.value;
      });
  }
  async evalExpr(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 800));
    return r.result.value;
  }
}

async function waitForLoad(cdp, timeout = 60000) {
  const fired = cdp.once('Page.loadEventFired');
  await Promise.race([fired, new Promise((r) => setTimeout(r, timeout))]);
  await cdp.evalExpr(
    `(async () => {
      if (document.readyState === 'complete') return 'complete';
      await new Promise(r => { if (document.readyState === 'complete') return r(); document.addEventListener('load', r, {once:true}); setTimeout(r, 15000); });
      return document.readyState;
    })()`
  );
}

async function navigate(cdp, url, settleMs = 1500) {
  const loading = waitForLoad(cdp);
  await cdp.send('Page.navigate', { url });
  await loading;
  await new Promise((r) => setTimeout(r, settleMs));
}

async function scrollThrough(cdp) {
  await cdp.evalExpr(
    `(async () => {
      const step = Math.round(window.innerHeight * 0.8);
      for (let y = 0; y < document.body.scrollHeight + step; y += step) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 120));
      }
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise(r => setTimeout(r, 400));
      window.scrollTo(0, 0);
      await new Promise(r => setTimeout(r, 350));
      return 'ok';
    })()`
  );
}

/* ------------------------------------------------------------ in-page probe */
const PROBE = function () {
  const out = {};
  const de = document.documentElement;
  out.lang = de.getAttribute('lang');
  out.dir = de.getAttribute('dir');
  out.title = document.title;
  out.viewportMeta = (document.querySelector('meta[name="viewport"]') || {}).content || null;
  out.url = location.pathname + location.search;

  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

  out.headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => ({
    level: Number(h.tagName[1]),
    text: (h.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 90),
    visible: visible(h),
  }));
  out.h1Count = out.headings.filter((h) => h.level === 1).length;
  out.hiddenHeadingCount = out.headings.filter((h) => !h.visible).length;

  out.landmarks = {
    header: document.querySelectorAll('header').length,
    nav: document.querySelectorAll('nav').length,
    main: document.querySelectorAll('main').length,
    footer: document.querySelectorAll('footer').length,
    aside: document.querySelectorAll('aside').length,
    bodyDirectMain: document.querySelectorAll('body > main, main').length > 0,
    roleMain: document.querySelectorAll('[role="main"]').length,
    bannerTopLevel: !!document.querySelector('body > header'),
    contentinfoTopLevel: !!document.querySelector('body > footer'),
  };

  const focusables = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"])')];
  out.focusableCount = focusables.filter(visible).length;
  out.firstFocusable = focusables.slice(0, 6).map((el) => ({
    tag: el.tagName.toLowerCase(),
    text: (el.textContent || el.getAttribute('aria-label') || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 60),
    href: el.getAttribute('href'),
    cls: (el.className || '').toString().slice(0, 70),
  }));
  out.skipLink = (() => {
    const a = document.querySelector('a[href="#content"], a[href="#main"], a[href^="#main-"], a.skip-link, a.skip-to-content, a.screen-reader-text');
    if (!a) return { present: false };
    const first = focusables[0] === a;
    return { present: true, href: a.getAttribute('href'), text: (a.textContent || '').trim(), isFirstFocusable: first };
  })();

  const imgs = [...document.images];
  out.images = {
    total: imgs.length,
    missingAlt: imgs.filter((i) => !i.hasAttribute('alt')).length,
    emptyAlt: imgs.filter((i) => i.getAttribute('alt') === '').length,
    sample: imgs.slice(0, 10).map((i) => ({
      alt: i.getAttribute('alt'),
      src: (i.currentSrc || i.src || '').split('/').slice(-1)[0].slice(0, 60),
      w: Math.round(i.getBoundingClientRect().width),
    })),
    svgMissingLabel: [...document.querySelectorAll('svg')]
      .filter((s) => !s.getAttribute('aria-hidden') && !s.getAttribute('role') && !s.querySelector('title'))
      .length,
  };

  out.digits = {
    latin: ((document.body.innerText.match(/[0-9]/g) || []).length),
    eastern: ((document.body.innerText.match(/[\u0660-\u0669]/g) || []).length),
    egp: (document.body.innerText.match(/ج\.م|EGP|E£/g) || []).length,
  };

  // letter-spacing / line-height / font on Arabic-bearing text
  const ar = /[\u0600-\u06FF]/;
  const typeSamples = [];
  const seen = new Set();
  for (const el of [...document.querySelectorAll('body *')]) {
    if (typeSamples.length >= 40) break;
    const t = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').trim();
    if (!t || !ar.test(t) || !visible(el)) continue;
    const cs = getComputedStyle(el);
    const key = `${cs.letterSpacing}|${cs.lineHeight}|${cs.fontFamily.split(',')[0]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    typeSamples.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().slice(0, 50),
      text: t.replace(/\s+/g, ' ').slice(0, 50),
      letterSpacing: cs.letterSpacing,
      lineHeight: cs.lineHeight,
      fontSize: cs.fontSize,
      fontStyle: cs.fontStyle,
      fontFamily: cs.fontFamily.split(',').slice(0, 3).join(','),
      textAlign: cs.textAlign,
    });
  }
  out.typography = typeSamples;
  out.bodyStyle = (() => {
    const cs = getComputedStyle(document.body);
    return { lineHeight: cs.lineHeight, fontSize: cs.fontSize, fontFamily: cs.fontFamily, letterSpacing: cs.letterSpacing, textAlign: cs.textAlign, direction: cs.direction };
  })();

  // interactive elements + rects (touch targets)
  const inter = focusables.filter(visible);
  out.targets = inter.slice(0, 120).map((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    let group = 'other';
    if (el.closest('.site-header')) group = 'header';
    else if (el.closest('.dock')) group = 'dock';
    else if (el.closest('form')) group = 'form';
    else if (el.closest('.card') || el.classList.contains('p-btn')) group = 'product-card';
    else if (el.closest('.site-footer')) group = 'footer';
    else if (el.closest('.announce')) group = 'announce';
    return {
      group,
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().slice(0, 60),
      text: (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      padT: cs.paddingTop,
      padB: cs.paddingBottom,
    };
  });
  out.targetTotal = inter.length;

  // forms
  out.forms = [...document.querySelectorAll('input,select,textarea')].map((el) => {
    const lbl = el.labels && el.labels[0] ? (el.labels[0].textContent || '').trim().slice(0, 50) : null;
    return {
      tag: el.tagName.toLowerCase(),
      type: (el.type || '').toLowerCase(),
      id: el.id || null,
      name: el.name || null,
      dir: el.getAttribute('dir'),
      autocomplete: el.getAttribute('autocomplete'),
      inputmode: el.getAttribute('inputmode'),
      placeholder: el.getAttribute('placeholder'),
      ariaLabel: el.getAttribute('aria-label'),
      labelText: lbl,
      describedby: el.getAttribute('aria-describedby'),
      required: el.required || el.getAttribute('aria-required') === 'true',
      rect: (() => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })(),
    };
  });

  // reveal / motion state
  out.reveal = {
    total: document.querySelectorAll('.reveal').length,
    hiddenNow: [...document.querySelectorAll('.reveal')].filter((el) => parseFloat(getComputedStyle(el).opacity) < 0.99).length,
    sample: [...document.querySelectorAll('.reveal')].slice(0, 8).map((el) => ({
      cls: el.className.slice(0, 60),
      opacity: getComputedStyle(el).opacity,
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50),
    })),
  };
  out.motion = {
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    reducedMotionQuery: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    transitionCount: [...document.querySelectorAll('body *')].filter((el) => {
      const cs = getComputedStyle(el);
      return cs.transitionDuration && cs.transitionDuration !== '0s';
    }).length,
  };

  // English runs inside Arabic pages that may need lang="en"
  out.foreignRuns = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (out.foreignRuns.length >= 25) break;
    const s = (n.nodeValue || '').trim();
    if (s.length < 3 || !/[A-Za-z]/.test(s) || /[\u0600-\u06FF]/.test(s)) continue;
    const p = n.parentElement;
    if (!p || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(p.tagName)) continue;
    out.foreignRuns.push({
      text: s.slice(0, 60),
      parentTag: p.tagName.toLowerCase(),
      parentLang: p.closest('[lang]') ? p.closest('[lang]').getAttribute('lang') : null,
    });
  }

  const bgOf = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node);
      const color = cs.backgroundColor;
      const hasImage = cs.backgroundImage && cs.backgroundImage !== 'none';
      if ((color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') || hasImage) {
        return { color, image: hasImage, cls: (node.className || '').toString().slice(0, 50) };
      }
      node = node.parentElement;
    }
    const cs = getComputedStyle(document.body);
    return { color: cs.backgroundColor, image: false, cls: 'body' };
  };
  const PAIRS = [
    'body', '.hero .lead', '.eyebrow', '.hero-title', '.p-body h3', '.p-cat', '.price .now',
    '.price del', '.badge.sale', '.news h2', '.news p', '.site-footer p', '.announce p',
    '.p-btn', '.chip.active', '.chip', '.value-list li', '.value-list li span', '.tile span',
    '.dock .dock-wa', '.dock .dock-cart', '.site-header .wp-block-navigation a', '.wp-block-site-title a',
    '.news-btn', '.news-form input',
  ];
  out.contrast = [];
  for (const sel of PAIRS) {
    const el = document.querySelector(sel);
    if (!el || !visible(el)) continue;
    const cs = getComputedStyle(el);
    const bg = bgOf(el);
    const r = el.getBoundingClientRect();
    out.contrast.push({
      sel,
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 45),
      fg: cs.color,
      bg: bg.color,
      bgImage: bg.image,
      bgEl: bg.cls,
      fontSize: parseFloat(cs.fontSize),
      fontWeight: Number(cs.fontWeight) || 400,
      lineHeight: cs.lineHeight,
      w: Math.round(r.width),
      h: Math.round(r.height),
    });
  }
  return out;
};

/* ------------------------------------------------------------------- axe run */
// axe runs in page context (awaitable via Runtime.evaluate)
async function runAxeInPage(cdp) {
  const already = await cdp.evalExpr('typeof window.axe');
  if (already !== 'object') {
    const inj = await cdp.send('Runtime.evaluate', { expression: AXE_SRC, returnByValue: false });
    if (inj.exceptionDetails) throw new Error('axe inject failed: ' + JSON.stringify(inj.exceptionDetails).slice(0, 300));
  }
  const raw = await cdp.evalExpr(
    `(async () => {
      const r = await axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(AXE_TAGS)} } });
      return JSON.stringify({
        violations: r.violations.map(rule => ({
          id: rule.id, impact: rule.impact, help: rule.help, helpUrl: rule.helpUrl,
          tags: rule.tags.filter(t => t.startsWith('wcag') || t === 'best-practice'),
          nodes: rule.nodes.length,
          sample: rule.nodes.slice(0,5).map(nd => ({ target: nd.target.join(' '), html: nd.html.slice(0,300), failureSummary: (nd.failureSummary||'').slice(0,400) }))
        })),
        incomplete: r.incomplete.map(x => ({ id: x.id, impact: x.impact, nodes: x.nodes.length, sample: x.nodes.slice(0,2).map(nd=>({target:nd.target.join(' '), html: nd.html.slice(0,200)})) })),
        passes: r.passes.length,
        inapplicable: r.inapplicable.length,
        engine: r.testEngine,
        runner: r.testRunner,
        timestamp: r.timestamp
      });
    })()`
  );
  const p = JSON.parse(raw);
  const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  p.violations.forEach((v) => { if (byImpact[v.impact] !== undefined) byImpact[v.impact] += 1; });
  return {
    ...p,
    violationCounts: { ...byImpact, total: p.violations.length, nodes: p.violations.reduce((s, v) => s + v.nodes, 0) },
    viewport: { w: await cdp.evalExpr('innerWidth'), h: await cdp.evalExpr('innerHeight') },
  };
}

/* -------------------------------------------------------------- contrast math */
const parseColor = (c) => {
  const m = String(c).match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(',').map((x) => parseFloat(x.trim()));
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
};
const chan = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (c) => 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b);
const over = (fg, bg) => ({
  r: fg.r * fg.a + bg.r * (1 - fg.a),
  g: fg.g * fg.a + bg.g * (1 - fg.a),
  b: fg.b * fg.a + bg.b * (1 - fg.a),
  a: 1,
});
function contrastRatio(fgRaw, bgRaw) {
  const bg = { ...bgRaw, a: bgRaw.a === undefined ? 1 : bgRaw.a };
  const bgOpaque = bg.a < 1 ? { r: 250, g: 248, b: 244, a: 1 } : bg;
  const fg = fgRaw.a < 1 ? over(fgRaw, bgOpaque) : fgRaw;
  const blend = bg.a < 1 ? over(bg, { r: 250, g: 248, b: 244, a: 1 }) : bg;
  const l1 = lum(fg);
  const l2 = lum(blend);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}
function evaluateContrast(pairs) {
  return pairs.map((p) => {
    const fg = parseColor(p.fg);
    const bg = parseColor(p.bg);
    if (!fg || !bg) return { ...p, ratio: null, verdict: 'UNPARSED' };
    const large = p.fontSize >= 24 || (p.fontSize >= 18.66 && p.fontWeight >= 700);
    const need = large ? 3 : 4.5;
    const ratio = contrastRatio(fg, bg);
    let verdict = ratio >= need ? 'PASS' : 'FAIL';
    if (p.bgImage) verdict = 'COMPLEX-BG';
    if (['.news-btn', '.news-form input', '.p-btn'].includes(p.sel) && ratio < 3) verdict = 'FAIL-UI(3:1)';
    return {
      sel: p.sel, text: p.text, fg: p.fg, bg: p.bg, bgEl: p.bgEl, bgImage: p.bgImage,
      fontSize: p.fontSize, fontWeight: p.fontWeight, large, required: need, ratio, verdict,
    };
  });
}

/* --------------------------------------------------------- main audit runner */
(async () => {
  console.log('== Nilad a11y/Arabic audit runner ==');
  const started = Date.now();

  // provenance: product URL from the shop page
  const shopHtml = await (await fetch(`${BASE}/shop/`)).text();
  const productLinks = [...new Set([...shopHtml.matchAll(/href="(http:\/\/localhost:8888\/product\/[^"]+)"/g)].map((m) => m[1]))];
  const productUrl = productLinks.includes(PAGES[2].url) ? PAGES[2].url : productLinks[0];
  PAGES[2].url = productUrl;

  const seed = await seedCart();
  write('session-seed.json', { ...seed, cookies: undefined, capturedAt: new Date().toISOString() });

  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1'],
  });
  console.log('chrome on port ' + chrome.port);
  const targets = await (await fetch(`http://127.0.0.1:${chrome.port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  const cdp = new CDP(ws);
  await Promise.all([
    cdp.send('Page.enable'), cdp.send('Runtime.enable'), cdp.send('Network.enable'),
  ]);

  // install captured session cookies
  for (const [name, value] of Object.entries(seed.cookies)) {
    await cdp.send('Network.setCookie', { name, value, url: 'http://localhost:8888/', path: '/' });
  }

  const summary = { generatedAt: new Date().toISOString(), base: BASE, axeTags: AXE_TAGS, pages: [], viewports: VIEWPORTS };

  for (const vp of VIEWPORTS) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.mobile,
    });
    console.log(`-- viewport ${vp.name} ${vp.w}x${vp.h}`);
    for (const pg of PAGES) {
      const t0 = Date.now();
      console.log(`  -> ${pg.id} ${pg.url}`);
      await navigate(cdp, pg.url, 1200);
      await scrollThrough(cdp);

      let cartState = null;
      if (pg.id === 'cart' || pg.id === 'checkout') {
        cartState = await cdp.evalExpr(
          `(() => ({ items: (document.body.innerText.match(/[0-9]+/) || [null])[0],
                      hasItem: /إضافة|إزالة|إزالة المنتج|quantity|كمية/i.test(document.body.innerText),
                      textLen: document.body.innerText.length }))()`
        );
      }

      const probe = await cdp.eval(PROBE);
      write(`probe-${pg.id}-${vp.name}.json`, { page: pg.id, url: pg.url, viewport: vp, cartState, probe });
      if (pg.id === 'home' && vp.name === 'desktop') {
        write('contrast-home-desktop.json', evaluateContrast(probe.contrast));
      }
      if (vp.name === 'mobile') {
        const small = probe.targets.filter((t) => t.w < 24 || t.h < 24);
        write(`targets-${pg.id}-390.json`, {
          page: pg.id, total: probe.targetTotal, measured: probe.targets.length,
          below24: small.length, minW: Math.min(...probe.targets.map((t) => t.w)),
          minH: Math.min(...probe.targets.map((t) => t.h)),
          smallest: [...probe.targets].sort((a, b) => a.h * a.w - b.h * b.w).slice(0, 12),
          byGroup: probe.targets.reduce((acc, t) => {
            acc[t.group] = acc[t.group] || { n: 0, minW: 1e9, minH: 1e9 };
            acc[t.group].n += 1;
            acc[t.group].minW = Math.min(acc[t.group].minW, t.w);
            acc[t.group].minH = Math.min(acc[t.group].minH, t.h);
            return acc;
          }, {}),
        });
      }

      const axe = await runAxeInPage(cdp);
      write(`axe-${pg.id}-${vp.name}.json`, { page: pg.id, url: pg.url, viewport: vp, cartState, ...axe });
      summary.pages.push({
        page: pg.id, url: pg.url, viewport: vp.name, ms: Date.now() - t0,
        ...axe.violationCounts,
        rules: axe.violations.map((v) => `${v.id}(${v.impact},${v.nodes})`),
        incomplete: axe.incomplete.map((i) => `${i.id}(${i.nodes})`),
        cartState,
      });
      console.log(`      axe: ${axe.violationCounts.total} rules / ${axe.violationCounts.nodes} nodes (${axe.violationCounts.critical}c ${axe.violationCounts.serious}s ${axe.violationCounts.moderate}m ${axe.violationCounts.minor}mi) [${Date.now() - t0}ms]`);
    }
  }

  /* ---- motion: no-JS ---- */
  console.log('  -> motion probes (home)');
  await cdp.send('Emulation.setEmulatedMedia', { features: [] });
  await cdp.send('Emulation.setScriptExecutionDisabled', { value: true });
  await navigate(cdp, `${BASE}/`, 1200);
  const noJs = await cdp.evalExpr(`(() => {
    const revs = [...document.querySelectorAll('.reveal')];
    const hidden = revs.filter(el => parseFloat(getComputedStyle(el).opacity) < 0.99);
    return {
      scriptExecutionDisabled: true,
      revealTotal: revs.length,
      hiddenCount: hidden.length,
      hiddenSample: hidden.slice(0,10).map(el => ({
        text: (el.textContent||'').trim().replace(/\\s+/g,' ').slice(0,60),
        opacity: getComputedStyle(el).opacity
      })),
      heroVisible: !!document.querySelector('h1') && parseFloat(getComputedStyle(document.querySelector('h1')).opacity) > 0.99
    };
  })()`);
  write('motion-nojs-home.json', noJs);
  await cdp.send('Emulation.setScriptExecutionDisabled', { value: false });

  /* ---- motion: prefers-reduced-motion ---- */
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await navigate(cdp, `${BASE}/`, 1500);
  const reduced = await cdp.evalExpr(`(() => {
    const revs = [...document.querySelectorAll('.reveal')];
    return {
      matchesReduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
      revealTotal: revs.length,
      hiddenCount: revs.filter(el => parseFloat(getComputedStyle(el).opacity) < 0.99).length,
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
      sampleOpacity: revs.slice(0,6).map(el => getComputedStyle(el).opacity)
    };
  })()`);
  write('motion-reduced-home.json', reduced);
  await cdp.send('Emulation.setEmulatedMedia', { features: [] });

  write('axe-summary.json', summary);
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  ws.close();
  await chrome.kill();
  console.log(`done in ${Math.round((Date.now() - started) / 1000)}s`);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
