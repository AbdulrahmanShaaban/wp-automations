#!/usr/bin/env node
/**
 * Keyboard-only pass (2026-10-06) using real CDP Input key events.
 * Covers: skip link, header nav, product card, add-to-cart, cart controls,
 * checkout form tab order / visible focus / no keyboard trap.
 * Writes: kb-focus-chain-<page>.json, kb-tests.json, screens/kb-*.png
 * Usage: node docs/AUDIT/evidence/a11y/tools/kb-pass.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..');
const SCREENS = path.join(OUT, 'screens');
fs.mkdirSync(SCREENS, { recursive: true });

const BASE = 'http://localhost:8888';
const chromeLauncher = require('chrome-launcher');
const WebSocket = require('ws');

const write = (name, data) => {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 1));
  console.log('  wrote ' + name);
};

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = new Map();
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      } else if (m.method) (this.listeners.get(m.method) || []).forEach((fn) => fn(m.params));
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
      const fn = (p) => { this.listeners.set(method, arr.filter((f) => f !== fn)); res(p); };
      arr.push(fn); this.listeners.set(method, arr);
    });
  }
  async evalExpr(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
    return r.result.value;
  }
  async navigate(url, settle = 1500) {
    const loaded = this.once('Page.loadEventFired');
    await this.send('Page.navigate', { url });
    await Promise.race([loaded, new Promise((r) => setTimeout(r, 45000))]);
    await this.evalExpr(`(async () => { if (document.readyState !== 'complete') { await new Promise(r => { document.addEventListener('load', r, {once:true}); setTimeout(r, 12000); }); } return document.readyState; })()`);
    await new Promise((r) => setTimeout(r, settle));
  }
  async tab(shift = false) {
    await this.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, modifiers: shift ? 8 : 0 });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, modifiers: shift ? 8 : 0 });
    await new Promise((r) => setTimeout(r, 160));
  }
  async enter() {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r' });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await new Promise((r) => setTimeout(r, 400));
  }
  async screenshot(name) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SCREENS, name), Buffer.from(data, 'base64'));
    console.log('  shot ' + name);
  }
}

const SNAPSHOT = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return { tag: 'body', text: '', rect: null };
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const vis = cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.05;
  let landmark = '';
  const lm = el.closest('header,nav,main,footer,aside,[role=banner],[role=navigation],[role=main],[role=contentinfo]');
  if (lm) landmark = lm.tagName.toLowerCase();
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    cls: (el.className || '').toString().slice(0, 70),
    type: el.getAttribute('type'),
    name: el.getAttribute('name'),
    href: el.getAttribute('href'),
    aria: el.getAttribute('aria-label'),
    text: (el.textContent || el.value || '').trim().replace(/\\s+/g, ' ').slice(0, 70),
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    onScreen: r.x >= -2 && r.y >= -2 && r.x + r.width <= innerWidth + 2 && r.y + r.height <= innerHeight + 2 && r.width > 0 && r.height > 0,
    visible: vis,
    outline: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor,
    outlineOffset: cs.outlineOffset,
    boxShadow: cs.boxShadow.slice(0, 90),
    focusVisible: el.matches(':focus-visible'),
    bg: cs.backgroundColor,
    color: cs.color,
    landmark,
    hash: location.hash,
    path: location.pathname,
    uid: (() => {
      const parts = [];
      let n = el, i2;
      while (n && n.nodeType === 1 && n !== document.documentElement) {
        const parent = n.parentElement;
        let idx = 1, s = n.previousElementSibling;
        while (s) { if (s.tagName === n.tagName) idx++; s = s.previousElementSibling; }
        parts.unshift(n.tagName.toLowerCase() + ':nth-of-type(' + idx + ')');
        n = parent;
      }
      return parts.join('>');
    })(),
  };
})()`;

const focusChain = async (cdp, url, maxTabs, label) => {
  await cdp.navigate(url);
  await cdp.evalExpr('document.body && document.body.focus && 1');
  const chain = [];
  let prev = null;
  let repeats = 0;
  for (let i = 0; i < maxTabs; i++) {
    await cdp.tab();
    const snap = await cdp.evalExpr(SNAPSHOT);
    chain.push({ step: i + 1, ...snap });
    const key = snap.uid || snap.tag;
    if (prev && key === prev) repeats += 1;
    prev = key;
  }
  const focusables = await cdp.evalExpr(
    `document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"])').length`
  );
  // A genuine trap = same element for 3+ consecutive Tab presses on a page
  // that has enough focusables. At end-of-page focus moves to browser chrome,
  // which is not observable and does not constitute a trap.
  let longestRun = 0;
  let run = 1;
  for (let i = 1; i < chain.length; i++) {
    if (chain[i].uid === chain[i - 1].uid) { run += 1; longestRun = Math.max(longestRun, run); } else run = 1;
  }
  const trapped = focusables >= 5 && longestRun >= 3;
  const out = {
    page: label, url, tabs: maxTabs, focusables,
    repeatedFocusCount: repeats, longestSameElementRun: longestRun, trapSuspected: trapped,
    chain,
  };
  write(`kb-focus-chain-${label}.json`, out);
  return out;
};

const seedCartInPage = async (cdp) => {
  await cdp.navigate(`${BASE}/shop/`);
  return cdp.evalExpr(`(async () => {
    const before = await (await fetch('/wp-json/wc/store/v1/cart', { credentials: 'same-origin' })).json();
    if (before.items_count > 0) return { already: true, before: before.items_count };
    const list = await (await fetch('/wp-json/wc/store/v1/products?per_page=5&orderby=date&order=desc')).json();
    const p = list.find(x => x.is_in_stock) || list[0];
    const nonce = (await fetch('/wp-json/wc/store/v1/cart', { credentials: 'same-origin' })).headers.get('Nonce');
    const r = await fetch('/wp-json/wc/store/v1/cart/add-item', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'Nonce': nonce || '' },
      body: JSON.stringify({ id: p.id, quantity: 1 }),
    });
    const after = await r.json();
    return { status: r.status, product: { id: p.id, name: p.name }, before: before.items_count, after: after.items_count, subtotal: after.totals && after.totals.total_items };
  })()`);
};

(async () => {
  console.log('== keyboard pass ==');
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1'],
  });
  const targets = await (await fetch(`http://127.0.0.1:${chrome.port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  const cdp = new CDP(ws);
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable'), cdp.send('Network.enable')]);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  const tests = { generatedAt: new Date().toISOString(), checks: [] };
  const check = (id, ok, detail) => { tests.checks.push({ id, ok: !!ok, detail }); console.log(`  ${ok ? 'PASS' : 'FAIL'} ${id} :: ${JSON.stringify(detail).slice(0, 220)}`); };

  /* ---------------------------------------------------------- 1. skip link */
  await cdp.navigate(`${BASE}/`);
  await cdp.tab();
  const first = await cdp.evalExpr(SNAPSHOT);
  await cdp.screenshot('kb-01-skip-link-focused.png');
  check('skip-link-first-focus', first.cls && /skip|screen-reader/.test(first.cls), first);
  check('skip-link-visible-when-focused', first.onScreen && first.visible, { rect: first.rect, visible: first.visible, outline: first.outline, path: first.path });
  check('skip-link-visible-focus-indicator', first.focusVisible && !/^none/.test(first.outline.split(' ')[0]), { focusVisible: first.focusVisible, outline: first.outline, boxShadow: first.boxShadow });
  await cdp.enter();
  await new Promise((r) => setTimeout(r, 500));
  const targetInfo = await cdp.evalExpr(`(() => {
    const t = document.getElementById('wp--skip-link--target') || document.querySelector('[id*=skip-link]');
    if (!t) return { exists: false };
    const r = t.getBoundingClientRect();
    return { exists: true, tag: t.tagName.toLowerCase(), tabindex: t.getAttribute('tabindex'), y: Math.round(r.y), hash: location.hash };
  })()`);
  await cdp.tab();
  const afterSkip = await cdp.evalExpr(SNAPSHOT);
  check('skip-link-activates-target', afterSkip.hash === '#wp--skip-link--target' && (afterSkip.landmark === 'main' || (targetInfo.exists && targetInfo.tabindex === '-1')),
    { hash: afterSkip.hash, target: targetInfo, nextStop: { tag: afterSkip.tag, id: afterSkip.id, landmark: afterSkip.landmark, text: afterSkip.text } });

  /* ------------------------------------------------------- 2. header nav */
  const homeChain = await focusChain(cdp, `${BASE}/`, 34, 'home');
  const navStops = homeChain.chain.filter((s) => s.landmark === 'nav' || (s.landmark === 'header'));
  const noIndicator = homeChain.chain.filter((s) => s.tag !== 'body' && /^none/.test((s.outline || 'none').split(' ')[0]) && !s.boxShadow.replace(/none$/, '').trim());
  check('header-nav-keyboard-reachable', navStops.length >= 3, { navStops: navStops.map((s) => s.text || s.href).slice(0, 8) });
  check('focus-indicator-on-all-home-stops', noIndicator.length === 0, { without: noIndicator.slice(0, 6).map((s) => `${s.tag}.${s.cls}`) });
  const firstMain = homeChain.chain.findIndex((s) => s.landmark === 'main');
  check('main-reachable-in-tab-order', firstMain >= 0, { atStep: firstMain + 1 });
  check('home-no-keyboard-trap', !homeChain.trapSuspected, { focusables: homeChain.focusables, longestRun: homeChain.longestSameElementRun });

  /* ------------------------------------------- 3. product card + add-to-cart */
  const shopUrl = `${BASE}/shop/`;
  await cdp.navigate(shopUrl);
  let atc = null;
  for (let i = 0; i < 40 && !atc; i++) {
    await cdp.tab();
    const snap = await cdp.evalExpr(SNAPSHOT);
    if (snap.tag === 'button' && /add|cart|أ/i.test((snap.text || '') + (snap.aria || '')) && /product/i.test(snap.cls || '')) atc = { step: i + 1, ...snap };
    if (snap.tag === 'button' && snap.cls && /add_to_cart|add-to-cart/.test(snap.cls)) atc = { step: i + 1, ...snap };
  }
  if (!atc) {
    // WooCommerce blocks often use data-product_id buttons; match by text instead
    await cdp.navigate(shopUrl);
    for (let i = 0; i < 40 && !atc; i++) {
      await cdp.tab();
      const snap = await cdp.evalExpr(SNAPSHOT);
      if (snap.tag === 'button' && snap.text && snap.text.length < 40 && /سلة|أضف|إضافة/.test(snap.text)) atc = { step: i + 1, ...snap };
    }
  }
  await cdp.screenshot('kb-02-add-to-cart-focused.png');
  check('add-to-cart-keyboard-reachable', !!atc, atc ? { step: atc.step, text: atc.text, cls: atc.cls, rect: atc.rect, focusVisible: atc.focusVisible, outline: atc.outline } : 'not found in 40 tabs');
  if (atc) {
    const countOf = `fetch('/wp-json/wc/store/v1/cart', { credentials: 'same-origin' }).then(r => r.json()).then(c => c.items_count)`;
    const before = await cdp.evalExpr(countOf);
    await cdp.enter();
    await new Promise((r) => setTimeout(r, 3000));
    const after = await cdp.evalExpr(countOf);
    check('add-to-cart-operable-by-enter', typeof after === 'number' && after > before, { itemsBefore: before, itemsAfter: after });
  }

  /* ------------------------------- 4. seed cart, then cart page keyboard pass */
  const seeded = await seedCartInPage(cdp);
  check('cart-seeded-for-keyboard-test', seeded && (seeded.already || seeded.after > 0), seeded);

  const cartChain = await focusChain(cdp, `${BASE}/cart/`, 30, 'cart');
  const cartControls = cartChain.chain.filter((s) => s.tag === 'button' || (s.cls && /qty|quantity|remove|remove_from_cart/.test(s.cls)));
  check('cart-controls-keyboard-reachable', cartControls.length >= 2, cartControls.slice(0, 6).map((s) => ({ tag: s.tag, cls: s.cls, text: s.text, rect: s.rect })));
  check('cart-no-keyboard-trap', !cartChain.trapSuspected, { focusables: cartChain.focusables, longestRun: cartChain.longestSameElementRun });

  /* ------------------------------------------------------- 5. checkout form */
  const coChain = await focusChain(cdp, `${BASE}/checkout/`, 60, 'checkout');
  const fields = coChain.chain.filter((s) => ['input', 'select', 'textarea'].includes(s.tag));
  check('checkout-form-fields-reachable', fields.length >= 5, fields.slice(0, 14).map((s) => ({ name: s.name, id: s.id, type: s.type, aria: s.aria })));
  check('checkout-no-keyboard-trap', !coChain.trapSuspected, { focusables: coChain.focusables, longestRun: coChain.longestSameElementRun });
  const focusIndMissing = coChain.chain.filter((s) => s.tag !== 'body' && /^none/.test((s.outline || 'none').split(' ')[0]) && !/rgb|#[0-9a-f]{3}/i.test(s.boxShadow || ''));
  check('checkout-focus-indicator-visible', focusIndMissing.length === 0, focusIndMissing.slice(0, 6).map((s) => `${s.step}:${s.tag}.${s.cls}`));

  // Shift+Tab reverses on checkout
  let backStops = 0;
  let lastBack = null;
  for (let i = 0; i < 5; i++) {
    await cdp.tab(true);
    const s = await cdp.evalExpr(SNAPSHOT);
    const k = s.id || s.cls || s.text;
    if (k !== lastBack) backStops += 1;
    lastBack = k;
  }
  check('shift-tab-moves-backwards', backStops >= 4, { distinctStops: backStops });

  await cdp.screenshot('kb-03-checkout-field-focused.png');
  write('kb-tests.json', tests);

  await cdp.send('Emulation.clearDeviceMetricsOverride');
  ws.close();
  await chrome.kill();
  const failed = tests.checks.filter((c) => !c.ok).length;
  console.log(`done: ${tests.checks.length} checks, ${failed} failed`);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
