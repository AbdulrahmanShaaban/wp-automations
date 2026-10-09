#!/usr/bin/env node
/**
 * Re-runs probes + axe for /cart/ and /checkout/ with a REAL in-browser cart
 * session (Store API add-item executed in the page, so cookies are native).
 * First pass (run-audit.js) seeded the cart from Node and the cookie did not
 * reach the browser, so WooCommerce redirected /checkout/ -> /cart/.
 *
 * Writes: probe-cart-*.json, axe-cart-*.json, targets-cart-390.json,
 *         probe-checkout-*.json, axe-checkout-*.json, targets-checkout-390.json,
 *         session-seed-browser.json
 * Usage: node docs/AUDIT/evidence/a11y/tools/run-cart-checkout.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..');
const AXE_SRC = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const chromeLauncher = require('chrome-launcher');
const WebSocket = require('ws');

const BASE = 'http://localhost:8888';
const PAGES = [
  { id: 'cart', url: `${BASE}/cart/` },
  { id: 'checkout', url: `${BASE}/checkout/` },
];
const VIEWPORTS = [
  { name: 'desktop', w: 1440, h: 900, mobile: false },
  { name: 'mobile', w: 390, h: 844, mobile: true },
];
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

const write = (name, data) => {
  fs.writeFileSync(path.join(OUT, name), typeof data === 'string' ? data : JSON.stringify(data, null, 1));
  console.log('  wrote ' + name);
};

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
  async evalExpr(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
    return r.result.value;
  }
}

async function navigate(cdp, url, settleMs = 1500) {
  const loading = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url });
  await Promise.race([loading, new Promise((r) => setTimeout(r, 60000))]);
  await cdp.evalExpr(
    `(async () => { if (document.readyState !== 'complete') await new Promise(r => { document.addEventListener('load', r, {once:true}); setTimeout(r, 12000); }); return document.readyState; })()`
  );
  await new Promise((r) => setTimeout(r, settleMs));
}

async function scrollThrough(cdp) {
  await cdp.evalExpr(
    `(async () => {
      const step = Math.round(window.innerHeight * 0.8);
      for (let y = 0; y < document.body.scrollHeight + step; y += step) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); }
      window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 350)); return 'ok';
    })()`
  );
}

const SEED = `(async () => {
  const g = await fetch('/wp-json/wc/store/v1/cart', { credentials: 'same-origin' });
  const nonce = g.headers.get('Nonce');
  const before = await g.json();
  const pr = await fetch('/wp-json/wc/store/v1/products?per_page=5', { credentials: 'same-origin' });
  const products = await pr.json();
  const p = products.find(x => x.is_in_stock) || products[0];
  const post = await fetch('/wp-json/wc/store/v1/cart/add-item', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Nonce: nonce || '' },
    body: JSON.stringify({ id: p.id, quantity: 1 })
  });
  const after = await post.json();
  return { product: { id: p.id, name: p.name, permalink: p.permalink }, status: post.status,
           before: before.items_count, after: after.items_count,
           subtotal: after.totals && after.totals.total_items,
           currency: after.totals && after.totals.currency_code,
           cookieNames: document.cookie.split(';').map(c => c.split('=')[0].trim()) };
})()`;

const PROBE = function () {
  const out = {};
  const de = document.documentElement;
  out.lang = de.getAttribute('lang');
  out.dir = de.getAttribute('dir');
  out.title = document.title;
  out.url = location.pathname + location.search;
  out.actualPath = location.pathname;
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

  out.headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => ({
    level: Number(h.tagName[1]),
    text: (h.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 90),
    visible: visible(h),
  }));
  out.h1Count = out.headings.filter((h) => h.level === 1).length;
  out.landmarks = {
    header: document.querySelectorAll('header').length,
    nav: document.querySelectorAll('nav').length,
    main: document.querySelectorAll('main').length,
    footer: document.querySelectorAll('footer').length,
    aside: document.querySelectorAll('aside').length,
  };

  const focusables = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"])')];
  out.focusableCount = focusables.filter(visible).length;
  out.skipLink = (() => {
    const a = document.querySelector('.skip-link, a[href="#wp--skip-link--target"], a[href="#content"], a[href="#main"]');
    if (!a) return { present: false };
    return { present: true, href: a.getAttribute('href'), text: (a.textContent || '').trim(), isFirstFocusable: focusables[0] === a };
  })();
  out.firstFocusable = focusables.slice(0, 4).map((el) => ({
    tag: el.tagName.toLowerCase(),
    text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 50),
    href: el.getAttribute('href'),
  }));

  out.bodyTextLen = document.body.innerText.length;
  out.cartEmpty = /سلة مشترياتك فارغة/.test(document.body.innerText);

  out.forms = [...document.querySelectorAll('input,select,textarea')].map((el) => {
    const lbl = el.labels && el.labels[0] ? (el.labels[0].textContent || '').trim().slice(0, 60) : null;
    const r = el.getBoundingClientRect();
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
      invalid: el.getAttribute('aria-invalid'),
      required: el.required || el.getAttribute('aria-required') === 'true',
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  });

  const inter = focusables.filter(visible);
  out.targets = inter.slice(0, 140).map((el) => {
    const r = el.getBoundingClientRect();
    let group = 'other';
    if (el.closest('.site-header')) group = 'header';
    else if (el.closest('.dock')) group = 'dock';
    else if (el.closest('form')) group = 'form';
    else if (el.closest('.wc-block-cart') || el.closest('.wp-block-woocommerce-cart')) group = 'cart';
    else if (el.closest('main')) group = 'main';
    else if (el.closest('.site-footer')) group = 'footer';
    return {
      group, tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 60),
      text: (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
    };
  });
  out.targetTotal = inter.length;

  // cart line items (quantity controls / remove links) sizes
  out.cartControls = [...document.querySelectorAll('button, a')].filter((el) =>
    /كمية|زيادة|إنقاص|إزالة|Remove|quantity/i.test((el.getAttribute('aria-label') || '') + (el.textContent || '') + el.className)
  ).slice(0, 20).map((el) => {
    const r = el.getBoundingClientRect();
    return { tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 50), aria: el.getAttribute('aria-label'),
             text: (el.textContent || '').trim().slice(0, 30), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
  });

  out.foreignRuns = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (out.foreignRuns.length >= 25) break;
    const s = (n.nodeValue || '').trim();
    if (s.length < 3 || !/[A-Za-z]/.test(s) || /[\u0600-\u06FF]/.test(s)) continue;
    const p = n.parentElement;
    if (!p || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(p.tagName)) continue;
    out.foreignRuns.push({ text: s.slice(0, 60), parentLang: p.closest('[lang]') ? p.closest('[lang]').getAttribute('lang') : null });
  }

  out.digits = {
    latin: ((document.body.innerText.match(/[0-9]/g) || []).length),
    eastern: ((document.body.innerText.match(/[\u0660-\u0669]/g) || []).length),
  };
  out.notice = (() => {
    const el = document.querySelector('.nilad-fs');
    return el ? { present: true, hidden: el.hidden, role: el.getAttribute('role'), text: (el.textContent || '').trim().slice(0, 120) } : { present: false };
  })();
  return out;
};

async function runAxe(cdp) {
  const already = await cdp.evalExpr('typeof window.axe');
  if (already !== 'object') {
    const inj = await cdp.send('Runtime.evaluate', { expression: AXE_SRC, returnByValue: false });
    if (inj.exceptionDetails) throw new Error('axe inject failed');
  }
  const raw = await cdp.evalExpr(
    `(async () => {
      const r = await axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(AXE_TAGS)} } });
      return JSON.stringify({
        violations: r.violations.map(rule => ({
          id: rule.id, impact: rule.impact, help: rule.help, tags: rule.tags.filter(t => t.startsWith('wcag') || t === 'best-practice'),
          nodes: rule.nodes.length,
          sample: rule.nodes.slice(0,5).map(nd => ({ target: nd.target.join(' '), html: nd.html.slice(0,300), failureSummary: (nd.failureSummary||'').slice(0,400) }))
        })),
        incomplete: r.incomplete.map(x => ({ id: x.id, impact: x.impact, nodes: x.nodes.length, sample: x.nodes.slice(0,3).map(nd=>({target:nd.target.join(' '), html: nd.html.slice(0,200)})) })),
        passes: r.passes.map(x => x.id),
        inapplicable: r.inapplicable.map(x => x.id),
        engine: r.testEngine, runner: r.testRunner, timestamp: r.timestamp
      });
    })()`
  );
  const p = JSON.parse(raw);
  const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  p.violations.forEach((v) => { if (byImpact[v.impact] !== undefined) byImpact[v.impact] += 1; });
  return { ...p, violationCounts: { ...byImpact, total: p.violations.length, nodes: p.violations.reduce((s, v) => s + v.nodes, 0) } };
}

(async () => {
  console.log('== cart/checkout audit with live cart session ==');
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1'],
  });
  const targets = await (await fetch(`http://127.0.0.1:${chrome.port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  const cdp = new CDP(ws);
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable'), cdp.send('Network.enable')]);

  // seed cart in the browser (native cookies)
  await navigate(cdp, `${BASE}/shop/`, 1500);
  const seed = await cdp.evalExpr(SEED);
  write('session-seed-browser.json', { ...seed, capturedAt: new Date().toISOString(), note: 'Store API add-item executed in page context (same-origin cookies)' });
  console.log('  seeded:', JSON.stringify(seed));

  const summary = [];
  for (const vp of VIEWPORTS) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.mobile });
    console.log(`-- viewport ${vp.name}`);
    for (const pg of PAGES) {
      const t0 = Date.now();
      await navigate(cdp, pg.url, 2500);
      await scrollThrough(cdp);
      const probe = await cdp.evalExpr(`(${PROBE.toString()})()`);
      const redirected = probe.actualPath !== new URL(pg.url).pathname;
      write(`probe-${pg.id}-${vp.name}.json`, { page: pg.id, url: pg.url, viewport: vp, redirected, probe });
      if (vp.name === 'mobile') {
        const small = probe.targets.filter((t) => t.w < 24 || t.h < 24);
        write(`targets-${pg.id}-390.json`, {
          page: pg.id, redirected, total: probe.targetTotal, measured: probe.targets.length,
          below24: small.length, minW: Math.min(...probe.targets.map((t) => t.w)), minH: Math.min(...probe.targets.map((t) => t.h)),
          below24List: small, smallest: [...probe.targets].sort((a, b) => a.h * a.w - b.h * b.w).slice(0, 12),
          cartControls: probe.cartControls,
        });
      }
      const axe = await runAxe(cdp);
      write(`axe-${pg.id}-${vp.name}.json`, { page: pg.id, url: pg.url, viewport: vp, redirected, cartEmpty: probe.cartEmpty, ...axe });
      summary.push({ page: pg.id, viewport: vp.name, redirected, cartEmpty: probe.cartEmpty, forms: probe.forms.length, ...axe.violationCounts,
        rules: axe.violations.map((v) => `${v.id}(${v.impact},${v.nodes})`),
        incomplete: axe.incomplete.map((i) => `${i.id}(${i.nodes})`),
        ms: Date.now() - t0 });
      console.log(`  ${pg.id}/${vp.name}: redirect=${redirected} empty=${probe.cartEmpty} forms=${probe.forms.length} axe=${axe.violationCounts.total}(${axe.violationCounts.nodes} nodes) [${Date.now() - t0}ms]`);
    }
  }
  write('axe-summary-cart-checkout.json', summary);

  await cdp.send('Emulation.clearDeviceMetricsOverride');
  ws.close();
  await chrome.kill();
  console.log('done');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
