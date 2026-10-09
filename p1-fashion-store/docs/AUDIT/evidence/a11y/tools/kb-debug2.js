#!/usr/bin/env node
/**
 * Isolate add-to-cart activation: JS .click() vs real Enter keypress vs pointer
 * mouse event; capture wc-ajax network results + console errors.
 * Writes: kb-debug2.json
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
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 700));
    return r.result.value;
  };
  const nav = async (url) => {
    const loaded = new Promise((res) => { const fn = (m) => { if (m.method === 'Page.loadEventFired') { ws.off('message', fn); res(); } }; ws.on('message', fn); });
    await send('Page.navigate', { url });
    await Promise.race([loaded, new Promise((r) => setTimeout(r, 45000))]);
    await new Promise((r) => setTimeout(r, 2000));
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  const netLog = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    if (m.method === 'Network.responseReceived') {
      const u = m.params.response.url;
      if (/wc-ajax|add-to-cart|\/cart/.test(u)) netLog.push({ url: u.slice(0, 160), status: m.params.response.status });
    }
    if (m.method === 'Network.loadingFailed') netLog.push({ failed: m.params.errorText, req: m.params.requestId });
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
      netLog.push({ console: m.params.type, text: m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 200) });
    }
  });

  const count = () => ev(`fetch('/wp-json/wc/store/v1/cart',{credentials:'same-origin'}).then(r=>r.json()).then(c=>c.items_count)`);
  const out = {};

  await nav(`${BASE}/shop/`);
  out.countStart = await count();

  // A: plain JS .click()
  out.jsClick = await ev(`(async () => {
    const b = document.querySelector('button.add_to_cart_button[data-product_id]');
    if (!b) return { found: false };
    b.click();
    await new Promise(r => setTimeout(r, 3000));
    return { found: true, pid: b.getAttribute('data-product_id'), cookie: document.cookie.includes('woocommerce_items_in_cart') };
  })()`);
  out.countAfterJsClick = await count();

  // reset cart
  await ev(`fetch('/wp-json/wc/store/v1/cart/items',{method:'DELETE',credentials:'same-origin',headers:{'Nonce':''}}).catch(()=>0)`);
  await new Promise((r) => setTimeout(r, 800));

  // B: focus + real Enter key
  await ev(`(() => { const b = document.querySelector('button.add_to_cart_button[data-product_id]'); b.focus(); return document.activeElement === b; })()`);
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await new Promise((r) => setTimeout(r, 3000));
  out.countAfterEnter = await count();
  out.focusAfterEnter = await ev(`document.activeElement.tagName + '.' + (document.activeElement.className||'').slice(0,60)`);
  out.netLog = netLog.slice(-14);

  fs.writeFileSync(path.join(OUT, 'kb-debug2.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1).slice(0, 3000));
  ws.close(); await chrome.kill();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
