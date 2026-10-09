#!/usr/bin/env node
/**
 * Keyboard-only + mobile navigation pass — P3 clinic (2026-10-07).
 *
 * Real CDP Input key events at 1440x900 for / and /book/ (tab order, skip
 * link, focus visibility, traps, FAQ details/summary keyboard behaviour) and
 * at 390x844 for the core overlay menu (reachability, Escape, focus handling,
 * backdrop-filter fixed-child containment lesson).
 *
 * Writes: kb-tests.json, kb-focus-chain-<page>.json, kb-*.png, navmenu-*.json
 * Usage: node docs/AUDIT/evidence/a11y/tools/kb-nav.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..');
const SCREENS = path.join(OUT, 'screens');
fs.mkdirSync(SCREENS, { recursive: true });

const BASE = 'http://localhost:8889';
const chromeLauncher = require(path.join('D:/my work/p1-fashion-store/node_modules/chrome-launcher'));
const WebSocket = require(path.join('D:/my work/p1-fashion-store/node_modules/ws'));

const write = (name, data) => {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 1));
  console.log('  wrote ' + name);
};
const LOG = path.join(__dirname, 'kb-nav.log');
fs.writeFileSync(LOG, `kb-nav.js start ${new Date().toISOString()}\n`);
const log = (m) => { console.log(m); fs.appendFileSync(LOG, m + '\n'); };

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
  async key(key, code, vk, opts = {}) {
    const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, ...(opts.text ? { text: opts.text } : {}), modifiers: opts.modifiers || 0 };
    // type 'keyDown' (NOT rawKeyDown): native default activation (button/summary
    // click synthesis) only fires for keyDown events — verified in debug-enter.js.
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await new Promise((r) => setTimeout(r, opts.wait || 160));
  }
  tab(shift = false) { return this.key('Tab', 'Tab', 9, { modifiers: shift ? 8 : 0 }); }
  enter() { return this.key('Enter', 'Enter', 13, { text: '\r', wait: 420 }); }
  space() { return this.key(' ', 'Space', 32, { text: ' ', wait: 420 }); }
  escape() { return this.key('Escape', 'Escape', 27, { wait: 420 }); }
  async shot(name) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SCREENS, name), Buffer.from(data, 'base64'));
    log('  shot ' + name);
  }
}

const SNAPSHOT = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return { tag: 'body', text: '', uid: 'body' };
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const vis = cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.05;
  let landmark = '';
  const lm = el.closest('header,nav,main,footer,aside,[role=banner],[role=navigation],[role=main],[role=contentinfo]');
  if (lm) landmark = lm.tagName.toLowerCase();
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    cls: (el.className || '').toString().slice(0, 80),
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
    boxShadow: cs.boxShadow.slice(0, 110),
    focusVisible: el.matches(':focus-visible'),
    inDetails: !!el.closest('details'),
    detailsOpen: el.closest('details') ? el.closest('details').open : null,
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
    `document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[tabindex]:not([tabindex="-1"])').length`
  );
  let longestRun = 0; let run = 1;
  let longestNonInputRun = 0; let nonInputRun = 0;
  const nativeInternalSteps = [];
  for (let i = 1; i < chain.length; i++) {
    if (chain[i].uid === chain[i - 1].uid) {
      run += 1;
      longestRun = Math.max(longestRun, run);
      // any repeat on a native input = widget internals (Chrome date fields
      // consume several tabs while activeElement stays the host) — never a trap
      if (chain[i].tag === 'input') nonInputRun = 0; else nonInputRun += 1;
      longestNonInputRun = Math.max(longestNonInputRun, nonInputRun);
      // native-internal stop = host input whose :focus/:focus-visible stopped
      // matching (focus sits on a shadow-DOM sub-control; Chrome renders its
      // own highlight there, author styles don't apply)
      if (chain[i].tag === 'input' && chain[i].focusVisible === false) nativeInternalSteps.push(chain[i].step);
    } else { run = 1; nonInputRun = 0; }
  }
  const out = {
    page: label, url, tabs: maxTabs, focusables,
    repeatedFocusCount: repeats, longestSameElementRun: longestRun,
    nativeInternalSteps: [...new Set(nativeInternalSteps)],
    // trap = focus getting stuck on the SAME non-native-widget element
    trapSuspected: focusables >= 5 && longestNonInputRun >= 3,
    chain,
  };
  write(`kb-focus-chain-${label}.json`, out);
  return out;
};

(async () => {
  log('== keyboard + mobile nav pass ==');
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1'],
  });
  const targets = await (await fetch(`http://127.0.0.1:${chrome.port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  const cdp = new CDP(ws);
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable')]);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  const tests = { generatedAt: new Date().toISOString(), checks: [] };
  const check = (id, ok, detail) => { tests.checks.push({ id, ok: !!ok, detail }); log(`  ${ok ? 'PASS' : 'FAIL'} ${id} :: ${JSON.stringify(detail).slice(0, 260)}`); };

  /* ------------------------------------------------------- 1. skip link home */
  await cdp.navigate(`${BASE}/`);
  await cdp.tab();
  const first = await cdp.evalExpr(SNAPSHOT);
  await cdp.shot('kb-01-skip-link-focused.png');
  check('skip-link-first-focus', /skip|screen-reader/i.test(first.cls || ''), { cls: first.cls, text: first.text, hash: first.hash });
  check('skip-link-visible-when-focused', first.onScreen && first.visible, { rect: first.rect, visible: first.visible, outline: first.outline });
  check('skip-link-focus-indicator', first.focusVisible && !/^none/.test((first.outline || 'none').split(' ')[0]), { focusVisible: first.focusVisible, outline: first.outline, boxShadow: first.boxShadow });
  await cdp.enter();
  await new Promise((r) => setTimeout(r, 500));
  const skipTarget = await cdp.evalExpr(`(() => {
    const id = (document.querySelector('a[href^="#"]') || {}).getAttribute ? document.querySelector('a[href^="#"]').getAttribute('href').slice(1) : '';
    const t = document.getElementById(id);
    return { id, exists: !!t, tag: t ? t.tagName.toLowerCase() : null, tabindex: t ? t.getAttribute('tabindex') : null, hash: location.hash };
  })()`);
  await cdp.tab();
  const afterSkip = await cdp.evalExpr(SNAPSHOT);
  check('skip-link-activates-target', afterSkip.hash === skipTarget.hash && afterSkip.hash !== '' && (skipTarget.tabindex === '-1' || afterSkip.landmark === 'main'),
    { target: skipTarget, nextStop: { tag: afterSkip.tag, id: afterSkip.id, landmark: afterSkip.landmark, text: afterSkip.text } });

  /* ------------------------------------------------- 2. tab chain home @1440 */
  const homeChain = await focusChain(cdp, `${BASE}/`, 45, 'home');
  const navStops = homeChain.chain.filter((s) => s.landmark === 'nav' || s.landmark === 'header');
  const noIndicator = homeChain.chain.filter((s) => s.tag !== 'body' && /^none/.test((s.outline || 'none').split(' ')[0]) && !/rgb|#|oklch|color/.test(s.boxShadow || ''));
  check('home-header-reachable', navStops.length >= 3, { navStops: navStops.map((s) => (s.text || s.href || '').slice(0, 30)).slice(0, 8) });
  check('home-focus-indicator-all-stops', noIndicator.length === 0, { without: noIndicator.slice(0, 8).map((s) => `${s.step}:${s.tag}.${(s.cls || '').slice(0, 40)} outline=${s.outline}`) });
  const firstMain = homeChain.chain.findIndex((s) => s.landmark === 'main');
  check('home-main-reachable', firstMain >= 0, { atStep: firstMain + 1 });
  check('home-no-keyboard-trap', !homeChain.trapSuspected, { focusables: homeChain.focusables, longestRun: homeChain.longestSameElementRun });
  const domOrder = await cdp.evalExpr(`(() => {
    const uids = ${JSON.stringify(homeChain.chain.map((s) => s.uid))};
    const focusables = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[tabindex]:not([tabindex="-1"])')];
    const idx = uids.map(u => { try { const el = document.querySelector(u); return el ? focusables.indexOf(el) : -1; } catch (e) { return -2; } });
    let regressions = 0; let last = -1;
    for (let i = 0; i < idx.length; i++) {
      const v = idx[i];
      if (uids[i] === 'body') { last = -1; continue; } // focus hit <body> between wraps: reset
      if (v < 0) continue;
      if (v < last) regressions++;
      last = v;
    }
    return { resolved: idx.filter(i => i >= 0).length, total: uids.length, regressions, idx };
  })()`);
  check('home-tab-order-follows-dom-order', domOrder.regressions === 0, { resolved: domOrder.resolved, regressions: domOrder.regressions });

  /* ------------------------------------------------------ 3. FAQ disclosure */
  await cdp.navigate(`${BASE}/`);
  let faqStep = -1; let faqSnap = null;
  for (let i = 0; i < 70 && !faqSnap; i++) {
    await cdp.tab();
    const s = await cdp.evalExpr(SNAPSHOT);
    if (s.tag === 'summary' && s.inDetails) faqSnap = { step: i + 1, ...s };
  }
  check('faq-summary-keyboard-reachable', !!faqSnap, faqSnap ? { step: faqSnap.step, text: faqSnap.text, outline: faqSnap.outline, focusVisible: faqSnap.focusVisible } : 'summary not reached in 70 tabs');
  if (faqSnap) {
    const stateBefore = await cdp.evalExpr(`document.activeElement.closest('details').open`);
    await cdp.enter();
    const stateOpen = await cdp.evalExpr(`document.activeElement.closest('details').open`);
    await cdp.shot('kb-02-faq-open-enter.png');
    await cdp.space();
    const stateSpace = await cdp.evalExpr(`document.activeElement.closest('details').open`);
    await cdp.space();
    const stateSpace2 = await cdp.evalExpr(`document.activeElement.closest('details').open`);
    check('faq-enter-toggles-open', stateBefore === false && stateOpen === true, { before: stateBefore, afterEnter: stateOpen });
    check('faq-space-toggles', stateOpen === true && stateSpace === false && stateSpace2 === true, { afterSpace1: stateSpace, afterSpace2: stateSpace2 });
    const panelVisible = await cdp.evalExpr(`(() => { const d = document.activeElement.closest('details'); const p = d.querySelector('p'); const r = p.getBoundingClientRect(); return { open: d.open, h: Math.round(r.height), opacity: getComputedStyle(p).opacity }; })()`);
    check('faq-panel-visible-when-open', panelVisible.open && panelVisible.h > 0 && panelVisible.opacity === '1', panelVisible);
  }

  /* ------------------------------------------------ 4. tab chain /book/ @1440 */
  const bookChain = await focusChain(cdp, `${BASE}/book/`, 40, 'book');
  const fields = bookChain.chain.filter((s) => ['input', 'select', 'textarea'].includes(s.tag));
  const honeypotStops = bookChain.chain.filter((s) => (s.name || '').includes('website') || (s.id || '').includes('website'));
  check('book-fields-keyboard-reachable', fields.length >= 5, fields.map((s) => ({ name: s.name, tag: s.tag, step: s.step })));
  check('book-honeypot-not-in-tab-order', honeypotStops.length === 0, { honeypotStops });
  check('book-submit-reachable', bookChain.chain.some((s) => s.tag === 'button' && /إرسال/.test(s.text || '')),
    bookChain.chain.filter((s) => s.tag === 'button').map((s) => ({ text: s.text, step: s.step })));
  check('book-no-keyboard-trap', !bookChain.trapSuspected, {
    focusables: bookChain.focusables, longestRun: bookChain.longestSameElementRun,
    nativeInternalSteps: bookChain.nativeInternalSteps,
    note: 'runs on input#siraj-date-1 = Chrome date widget internal segments (activeElement stays host), not a trap',
  });
  // stops without an author-level ring; native shadow-internal stops of the
  // date input are excluded (Chrome draws its own highlight inside) but the
  // first one is screenshotted for visual verification.
  const nativeInternals = new Set(bookChain.nativeInternalSteps);
  const noInd = bookChain.chain.filter((s) => s.tag !== 'body'
    && !nativeInternals.has(s.step)
    && /^none/.test((s.outline || 'none').split(' ')[0])
    && !/rgb|#|oklch|color/.test(s.boxShadow || ''));
  check('book-focus-indicator-all-stops', noInd.length === 0, {
    without: noInd.slice(0, 8).map((s) => `${s.step}:${s.tag}#${s.id} outline=${s.outline} shadow=${s.boxShadow.slice(0, 60)}`),
    nativeInternalExcluded: [...nativeInternals].map((step) => {
      const s = bookChain.chain.find((x) => x.step === step);
      return `${step}:${s.tag}#${s.id} fv=${s.focusVisible} (focus inside Chrome date shadow — native highlight, host :focus not matched)`;
    }),
  });
  // screenshot the date input while focus is inside its shadow internals
  if (bookChain.nativeInternalSteps.length) {
    const step = bookChain.nativeInternalSteps[bookChain.nativeInternalSteps.length - 1];
    // re-navigate fresh and tab to that step again to reproduce the state
    await cdp.navigate(`${BASE}/book/`);
    for (let i = 0; i < step; i++) await cdp.tab();
    const now = await cdp.evalExpr(SNAPSHOT);
    const clip = await cdp.evalExpr(`(() => { const el = document.activeElement; const r = el.getBoundingClientRect(); return { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: Math.min(innerWidth, r.width + 16), height: Math.min(innerHeight, r.height + 16), scale: 1 }; })()`);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip });
    fs.writeFileSync(path.join(SCREENS, 'kb-07-date-native-internal-focus.png'), Buffer.from(shot.data, 'base64'));
    log(`  shot kb-07-date-native-internal-focus.png (step ${step}, fv=${now.focusVisible}, shadow=${now.boxShadow.slice(0, 40)})`);
    write('kb-date-native-internal.json', { step, snapshot: now, clip });
  }

  // focus an input and measure its actual focus styling
  await cdp.navigate(`${BASE}/book/`);
  for (let i = 0; i < 25; i++) {
    await cdp.tab();
    const s = await cdp.evalExpr(SNAPSHOT);
    if (s.tag === 'input' && s.type === 'text') break;
  }
  const focusStyle = await cdp.evalExpr(`(() => {
    const el = document.activeElement; const cs = getComputedStyle(el);
    return { id: el.id, outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, borderColor: cs.borderColor, boxShadow: cs.boxShadow.slice(0, 120), focusVisible: el.matches(':focus-visible') };
  })()`);
  await cdp.shot('kb-03-book-field-focused.png');
  check('book-input-focus-visible', focusStyle.focusVisible && (focusStyle.outlineStyle !== 'none' || focusStyle.boxShadow !== 'none'), focusStyle);

  // shift-tab reverses (distinct = unique element path, not cls — nav links share cls)
  let backStops = 0; let lastBack = null;
  const backSequence = [];
  for (let i = 0; i < 5; i++) {
    await cdp.tab(true);
    const s = await cdp.evalExpr(SNAPSHOT);
    backSequence.push(`${s.tag}#${s.id || ''}:${(s.text || '').slice(0, 16)}`);
    const k = s.uid || `${s.tag}#${s.id}`;
    if (k !== lastBack) backStops += 1;
    lastBack = k;
  }
  check('book-shift-tab-reverses', backStops >= 4, { distinctStops: backStops, backSequence });

  /* ------------------------------------------- 5. mobile overlay menu @390 */
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await cdp.navigate(`${BASE}/`, 1600);

  // reach the hamburger by keyboard from the top of the page
  let hamSnap = null; let hamStep = -1;
  await cdp.evalExpr(`(() => { document.body.setAttribute('tabindex','-1'); document.body.focus(); document.body.removeAttribute('tabindex'); return 1; })()`);
  for (let i = 0; i < 12 && !hamSnap; i++) {
    await cdp.tab();
    const s = await cdp.evalExpr(SNAPSHOT);
    if ((s.cls || '').includes('responsive-container-open')) { hamSnap = { step: i + 1, ...s }; hamStep = i + 1; }
  }
  await cdp.shot('kb-04-hamburger-focused-390.png');
  check('mobile-hamburger-keyboard-reachable', !!hamSnap, hamSnap ? { step: hamSnap.step, rect: hamSnap.rect, outline: hamSnap.outline, focusVisible: hamSnap.focusVisible, aria: hamSnap.aria, text: hamSnap.text } : 'not reached in 12 tabs');

  const closedState = await cdp.evalExpr(`(() => {
    const b = document.querySelector('.wp-block-navigation__responsive-container-open');
    const cs = b ? getComputedStyle(b) : null;
    const header = document.querySelector('.site-header');
    return {
      hamburger: b ? { w: b.offsetWidth, h: b.offsetHeight, display: cs.display, ariaExpanded: b.getAttribute('aria-expanded') } : null,
      headerBackdropFilter: header ? (getComputedStyle(header).backdropFilter || 'none') : null,
      hasModalOpen: document.documentElement.classList.contains('has-modal-open'),
      inlineNavDisplay: (() => { const n = document.querySelector('.wp-block-navigation .wp-block-navigation__container'); return n ? getComputedStyle(n).display : 'MISSING'; })(),
    };
  })()`);
  write('navmenu-closed-390.json', closedState);
  log('  closed: ' + JSON.stringify(closedState));

  if (hamSnap) {
    await cdp.enter(); // activate menu
    await new Promise((r) => setTimeout(r, 700));
    const openState = await cdp.evalExpr(`(() => {
      const box = document.querySelector('.wp-block-navigation__responsive-container');
      const header = document.querySelector('.site-header');
      const cs = header ? getComputedStyle(header) : null;
      const r = box ? box.getBoundingClientRect() : null;
      const ae = document.activeElement;
      const links = box ? [...box.querySelectorAll('a')] : [];
      const vis = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
      const mid = document.elementFromPoint(Math.round(innerWidth/2), Math.round(innerHeight/2));
      return {
        hasModalOpen: document.documentElement.classList.contains('has-modal-open'),
        headerBackdropFilter: cs ? (cs.backdropFilter || cs.webkitBackdropFilter || 'none') : null,
        boxRect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
        viewport: { w: innerWidth, h: innerHeight },
        boxPosition: box ? getComputedStyle(box).position : null,
        boxVisible: box ? vis(box) : false,
        activeElement: ae ? { tag: ae.tagName.toLowerCase(), cls: (ae.className || '').toString().slice(0, 70), text: (ae.textContent || '').trim().slice(0, 40) } : null,
        linkCount: links.length,
        links: links.map(a => ({ text: a.textContent.trim().replace(/\\s+/g, ' ').slice(0, 40), href: a.getAttribute('href'), visible: vis(a), rect: (() => { const q = a.getBoundingClientRect(); return { w: Math.round(q.width), h: Math.round(q.height) }; })() })),
        centerPointInsideMenu: !!(mid && box && (mid === box || box.contains(mid))),
        centerPoint: mid ? { tag: mid.tagName.toLowerCase(), cls: (mid.className || '').toString().slice(0, 60) } : null,
        ctaInMenu: links.filter(a => /احجز/.test(a.textContent)).length,
      };
    })()`);
    write('navmenu-open-390.json', openState);
    await cdp.shot('kb-05-menu-open-390.png');
    check('menu-opens', openState.boxVisible && openState.linkCount >= 3, { links: openState.linkCount, visible: openState.boxVisible });
    check('menu-has-modal-open-class', openState.hasModalOpen === true, { hasModalOpen: openState.hasModalOpen });
    check('menu-backdrop-filter-disabled', openState.headerBackdropFilter === 'none', { backdropFilter: openState.headerBackdropFilter });
    check('menu-covers-viewport', openState.boxRect && openState.boxRect.w >= openState.viewport.w - 1 && openState.boxRect.h >= openState.viewport.h - 10,
      { boxRect: openState.boxRect, viewport: openState.viewport });
    check('menu-not-trapped-in-header-box', openState.centerPointInsideMenu, { centerPoint: openState.centerPoint, inside: openState.centerPointInsideMenu });
    const focusInside = await cdp.evalExpr(`(() => {
      const box = document.querySelector('.wp-block-navigation__responsive-container');
      const ae = document.activeElement;
      return { inside: !!(box && ae && (box === ae || box.contains(ae))), onToggle: !!(ae && ae.classList && ae.classList.contains('wp-block-navigation__responsive-container-open')), active: ae ? { tag: ae.tagName.toLowerCase(), cls: (ae.className || '').toString().slice(0, 70) } : null };
    })()`);
    check('menu-focus-moved-inside', focusInside.inside, focusInside);

    // tab through the menu (focus should stay inside the open menu)
    const menuStops = [];
    for (let i = 0; i < 8; i++) {
      await cdp.tab();
      const s = await cdp.evalExpr(SNAPSHOT);
      const inside = await cdp.evalExpr(`(() => { const b = document.querySelector('.wp-block-navigation__responsive-container'); const a = document.activeElement; return !!(b && a && (b === a || b.contains(a))); })()`);
      menuStops.push({ step: i + 1, tag: s.tag, cls: (s.cls || '').slice(0, 60), text: s.text, inside });
    }
    write('navmenu-tabstops-390.json', menuStops);
    log('  menu tab stops: ' + JSON.stringify(menuStops.map((s) => `${s.step}:${s.tag}:${(s.text || '').slice(0, 18)}:${s.inside}`)));
    check('menu-focus-stays-inside-while-open', menuStops.filter((s) => s.inside).length >= 4, { inside: menuStops.filter((s) => s.inside).length, total: menuStops.length });

    // Escape closes
    await cdp.escape();
    await new Promise((r) => setTimeout(r, 600));
    const afterEsc = await cdp.evalExpr(`(() => {
      const box = document.querySelector('.wp-block-navigation__responsive-container');
      const vis = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
      const ae = document.activeElement;
      return {
        boxVisible: box ? vis(box) : false,
        hasModalOpen: document.documentElement.classList.contains('has-modal-open'),
        activeElement: ae ? { tag: ae.tagName.toLowerCase(), cls: (ae.className || '').toString().slice(0, 70) } : null,
        headerBackdropFilter: (() => { const h = document.querySelector('.site-header'); const cs = getComputedStyle(h); return cs.backdropFilter || cs.webkitBackdropFilter || 'none'; })(),
      };
    })()`);
    write('navmenu-after-esc-390.json', afterEsc);
    await cdp.shot('kb-06-menu-after-esc-390.png');
    check('escape-closes-menu', afterEsc.boxVisible === false && afterEsc.hasModalOpen === false, afterEsc);
    check('focus-returns-to-hamburger-after-esc', !!(afterEsc.activeElement && /responsive-container-open/.test(afterEsc.activeElement.cls || '')), { activeElement: afterEsc.activeElement });
    check('backdrop-restored-after-close', afterEsc.headerBackdropFilter !== 'none', { backdropFilter: afterEsc.headerBackdropFilter });

    // reopen by mouse click and verify overlay click target + link click works
    await cdp.evalExpr(`(() => { const b = document.querySelector('.wp-block-navigation__responsive-container-open'); if (b) b.click(); return !!b; })()`);
    await new Promise((r) => setTimeout(r, 700));
    const reopen = await cdp.evalExpr(`(() => {
      const box = document.querySelector('.wp-block-navigation__responsive-container');
      const vis = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
      return { open: box ? vis(box) : false };
    })()`);
    check('menu-reopens-by-click', reopen.open === true, reopen);
    // click a nav link inside overlay -> navigates
    const clicked = await cdp.evalExpr(`(() => {
      const box = document.querySelector('.wp-block-navigation__responsive-container');
      const a = box ? [...box.querySelectorAll('a')].find(x => x.getAttribute('href') === '/services/') : null;
      if (!a) return { found: false };
      const r = a.getBoundingClientRect();
      return { found: true, w: Math.round(r.width), h: Math.round(r.height), href: a.getAttribute('href') };
    })()`);
    if (clicked.found) {
      await cdp.evalExpr(`(() => { const box = document.querySelector('.wp-block-navigation__responsive-container'); [...box.querySelectorAll('a')].find(x => x.getAttribute('href') === '/services/').click(); return 1; })()`);
      await new Promise((r) => setTimeout(r, 2200));
      const nav = await cdp.evalExpr('location.pathname');
      check('menu-link-navigates', nav === '/services/', { landedOn: nav });
    }
  }

  write('kb-tests.json', tests);
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  ws.close();
  await chrome.kill();
  const failed = tests.checks.filter((c) => !c.ok).length;
  log(`done: ${tests.checks.length} checks, ${failed} failed`);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
