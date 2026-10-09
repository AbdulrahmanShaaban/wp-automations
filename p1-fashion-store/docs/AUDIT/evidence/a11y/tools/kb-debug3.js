#!/usr/bin/env node
/**
 * Definitive activation test: does the shop add-to-cart button respond to
 * keyboard (Enter/Space) vs pointer click? Cart is reset between attempts via
 * Store API DELETE with a fresh Nonce. Writes kb-debug3.json
 */
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..');
const chromeLauncher = require('chrome-launcher');
const WebSocket = require('ws');
const BASE = 'http://localhost:8888';

(async () => {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars'] });
  const targets = await (await fetch(`http://127.0.0.1:${chrome.port}/json/list`)).json();
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  let id = 0; const pending = new Map();
  ws.on('message', (raw) => { const m = JSON.parse(String(raw)); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej: (e) => rej(new Error(method + ' -> ' + e.message + ' :: ' + JSON.stringify(params).slice(0, 260))) });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 700));
    return r.result.value;
  };
  const nav = async (url) => {
    const loaded = new Promise((res) => { const fn = (m) => { if (m.method === 'Page.loadEventFired') { ws.off('message', fn); res(); } }; ws.on('message', fn); });
    await send('Page.navigate', { url });
    await Promise.race([loaded, new Promise((r) => setTimeout(r, 45000))]);
    await new Promise((r) => setTimeout(r, 2200));
  };
  const key = async (type, opts) => { await send('Input.dispatchKeyEvent', { type, ...opts }); await new Promise((r) => setTimeout(r, 120)); };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  const count = () => ev(`fetch('/wp-json/wc/store/v1/cart',{credentials:'same-origin'}).then(r=>r.json()).then(c=>c.items_count)`);
  const reset = () => ev(`(async () => {
    const g = await fetch('/wp-json/wc/store/v1/cart', { credentials: 'same-origin' });
    const nonce = g.headers.get('Nonce');
    const c = await g.json();
    if (c.items_count === 0) return { cleared: true, was: 0 };
    const d = await fetch('/wp-json/wc/store/v1/cart/items', { method: 'DELETE', credentials: 'same-origin', headers: { Nonce: nonce || '' } });
    const after = await d.json();
    return { cleared: d.status, was: c.items_count, now: after.items_count !== undefined ? after.items_count : 'n/a', status: d.status };
  })()`);
  const focusBtn = () => ev(`(() => { const b = document.querySelector('button.add_to_cart_button[data-product_id]'); if (!b) return false; b.scrollIntoView({block:'center'}); b.focus(); return document.activeElement === b; })()`);
  const countEvents = () => ev(`(async () => {
    const b = document.querySelector('button.add_to_cart_button[data-product_id]');
    window.__ev = [];
    ['click','keydown','keyup'].forEach(t => b.addEventListener(t, e => window.__ev.push(t + ':' + (e.key||'') + ':' + e.detail)));
    return 'listener-attached';
  })()`);

  const out = {};

  await nav(`${BASE}/shop/`);
  out.startCount = await count();

  // 1. pointer click (baseline)
  const rect = await ev(`(() => { const b = document.querySelector('button.add_to_cart_button[data-product_id]'); const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await new Promise((r) => setTimeout(r, 3000));
  out.afterPointerClick = await count();
  out.reset1 = await reset();

  // 2. focus + Enter (rawKeyDown with text)
  await focusBtn(); await countEvents();
  await key('rawKeyDown', { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r' });
  await key('keyUp', { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await new Promise((r) => setTimeout(r, 3000));
  out.afterEnterRaw = await count();
  out.eventsAfterEnterRaw = await ev(`window.__ev ? window.__ev.slice() : null`);
  out.reset2 = await reset();

  // 3. focus + Enter (keyDown type, no raw)
  await focusBtn(); await countEvents();
  await key('keyDown', { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r' });
  await key('keyUp', { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await new Promise((r) => setTimeout(r, 3000));
  out.afterEnterKeyDown = await count();
  out.eventsAfterEnterKeyDown = await ev(`window.__ev ? window.__ev.slice() : null`);
  out.reset3 = await reset();

  // 4. focus + Space
  await focusBtn(); await countEvents();
  await key('rawKeyDown', { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32, text: ' ' });
  await key('keyUp', { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
  await new Promise((r) => setTimeout(r, 3000));
  out.afterSpace = await count();
  out.eventsAfterSpace = await ev(`window.__ev ? window.__ev.slice() : null`);

  fs.writeFileSync(path.join(OUT, 'kb-debug3.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
  ws.close(); await chrome.kill();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
