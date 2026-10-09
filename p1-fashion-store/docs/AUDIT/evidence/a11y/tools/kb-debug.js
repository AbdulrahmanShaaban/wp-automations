#!/usr/bin/env node
/**
 * Focused debug for kb-pass.js failures (2026-10-06):
 *  1) why Enter on the shop add-to-cart button did not change items_count
 *  2) what the "same element repeated" stops actually are (trap vs key collision)
 * Writes: kb-debug.json
 */
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..');
const chromeLauncher = require('chrome-launcher');
const WebSocket = require('ws');
const BASE = 'http://localhost:8888';

const uidExpr = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return 'body';
  const parts = [];
  let n = el;
  while (n && n.nodeType === 1 && n !== document.documentElement) {
    const parent = n.parentElement;
    let idx = 1, s = n.previousElementSibling;
    while (s) { if (s.tagName === n.tagName) idx++; s = s.previousElementSibling; }
    parts.unshift(n.tagName.toLowerCase() + ':nth-of-type(' + idx + ')');
    n = parent;
  }
  return parts.join('>');
})()`;

const snapExpr = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return { tag: 'body' };
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    tag: el.tagName.toLowerCase(),
    cls: (el.className||'').toString().slice(0,80),
    text: (el.textContent||el.value||'').trim().replace(/\\s+/g,' ').slice(0,60),
    href: el.getAttribute('href'),
    productId: el.getAttribute('data-product_id'),
    aria: el.getAttribute('aria-label'),
    disabled: el.disabled === true,
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    inViewport: r.top < innerHeight && r.bottom > 0,
    html: el.outerHTML.slice(0, 320),
    outline: cs.outlineStyle + ' ' + cs.outlineWidth,
    uid: ${uidExpr},
  };
})()`;

(async () => {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars'] });
  const targets = await (await fetch(`http://127.0.0.1:${chrome.port}/json/list`)).json();
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  let id = 0; const pending = new Map();
  ws.on('message', (raw) => { const m = JSON.parse(String(raw)); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600));
    return r.result.value;
  };
  const nav = async (url) => {
    const loaded = new Promise((res) => { const fn = (m) => { if (m.method === 'Page.loadEventFired') { ws.off('message', fn); res(); } }; ws.on('message', fn); });
    await send('Page.navigate', { url });
    await Promise.race([loaded, new Promise((r) => setTimeout(r, 45000))]);
    await new Promise((r) => setTimeout(r, 1500));
  };
  const tab = async () => {
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await new Promise((r) => setTimeout(r, 140));
  };
  const enter = async () => {
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await new Promise((r) => setTimeout(r, 3000));
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  const out = {};

  /* ---- 1. shop add-to-cart ---- */
  await nav(`${BASE}/shop/`);
  out.shopFocusables = await ev(`[...document.querySelectorAll('a[href],button,input,select,textarea')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0}).map(e=>({tag:e.tagName.toLowerCase(),cls:(e.className||'').toString().slice(0,60),text:(e.textContent||'').trim().slice(0,30),pid:e.getAttribute('data-product_id')})).slice(0,45)`);
  let atc = null; const visited = [];
  for (let i = 0; i < 40 && !atc; i++) {
    await tab();
    const s = await ev(snapExpr);
    visited.push({ i: i + 1, tag: s.tag, cls: (s.cls || '').slice(0, 50), text: s.text, uid: s.uid.slice(-40) });
    if (s.tag === 'button' && (/سلة/.test(s.text || '') || s.productId)) atc = { step: i + 1, ...s };
  }
  out.atcFound = atc ? { step: atc.step, cls: atc.cls, text: atc.text, pid: atc.productId, disabled: atc.disabled, rect: atc.rect, inViewport: atc.inViewport, html: atc.html } : null;
  if (atc) {
    out.before = await ev(`fetch('/wp-json/wc/store/v1/cart',{credentials:'same-origin'}).then(r=>r.json()).then(c=>c.items_count)`);
    await enter();
    out.after = await ev(`fetch('/wp-json/wc/store/v1/cart',{credentials:'same-origin'}).then(r=>r.json()).then(c=>c.items_count)`);
    out.urlAfter = await ev(`location.pathname`);
    out.notice = await ev(`([...document.querySelectorAll('[class*=notice],[class*=alert],[role=status],[role=alert],.woocommerce-message')].map(e=>e.textContent.trim()).filter(Boolean)).slice(0,4)`);
    out.cookie = await ev(`document.cookie.split(';').map(c=>c.trim()).filter(c=>/cart|items/.test(c))`);
  }
  out.shopVisitedTail = visited.slice(-12);

  /* ---- 2. repeat-key check on home ---- */
  await nav(`${BASE}/`);
  const chain = [];
  for (let i = 0; i < 34; i++) { await tab(); chain.push(await ev(snapExpr)); }
  const runs = [];
  let cur = { uid: chain[0].uid, start: 1, items: [chain[0]] };
  for (let i = 1; i < chain.length; i++) {
    if (chain[i].uid === cur.uid) { cur.items.push(chain[i]); } else { runs.push(cur); cur = { uid: chain[i].uid, start: i + 1, items: [chain[i]] }; }
  }
  runs.push(cur);
  out.longestRuns = runs.filter((r) => r.items.length > 1).sort((a, b) => b.items.length - a.items.length).slice(0, 4)
    .map((r) => ({ len: r.items.length, startStep: r.start, uid: r.uid.slice(-70), tag: r.items[0].tag, cls: (r.items[0].cls || '').slice(0, 60), text: r.items[0].text }));

  fs.writeFileSync(path.join(OUT, 'kb-debug.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ atc: out.atcFound, before: out.before, after: out.after, urlAfter: out.urlAfter, notice: out.notice, cookie: out.cookie, longestRuns: out.longestRuns }, null, 1));
  ws.close(); await chrome.kill();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
