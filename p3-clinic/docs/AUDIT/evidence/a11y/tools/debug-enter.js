#!/usr/bin/env node
/** Debug: does Enter activate <summary> and the hamburger via CDP key events? */
'use strict';
const path = require('path');
const chromeLauncher = require(path.join('D:/my work/p1-fashion-store/node_modules/chrome-launcher'));
const WebSocket = require(path.join('D:/my work/p1-fashion-store/node_modules/ws'));
const BASE = 'http://localhost:8889';

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = new Map();
    ws.on('message', (raw) => { const m = JSON.parse(String(raw));
      if (m.id && this.pending.has(m.id)) { const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
      else if (m.method) (this.listeners.get(m.method) || []).forEach((fn) => fn(m.params)); }); }
  send(method, params = {}) { const id = ++this.id; return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async evalExpr(expression) { const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600)); return r.result.value; }
  async key(spec) {
    await this.send('Input.dispatchKeyEvent', { type: spec.downType || 'rawKeyDown', key: spec.key, code: spec.code, windowsVirtualKeyCode: spec.vk, nativeVirtualKeyCode: spec.vk, ...(spec.text ? { text: spec.text } : {}), modifiers: 0 });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: spec.key, code: spec.code, windowsVirtualKeyCode: spec.vk, nativeVirtualKeyCode: spec.vk, modifiers: 0 });
    await new Promise((r) => setTimeout(r, 450));
  }
}
(async () => {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars'] });
  const targets = await (await fetch(`http://127.0.0.1:${chrome.port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  const cdp = new CDP(ws);
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable')]);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  // --- summary Enter: variant A (rawKeyDown) ---
  await cdp.send('Page.navigate', { url: `${BASE}/` });
  await new Promise((r) => setTimeout(r, 2500));
  await cdp.evalExpr(`(() => { document.querySelectorAll('summary')[0].focus(); return document.activeElement.tagName; })()`);
  await cdp.key({ key: 'Enter', code: 'Enter', vk: 13, text: '\r' });
  console.log('A summary rawKeyDown+text open =', await cdp.evalExpr(`document.querySelectorAll('details')[0].open`));

  // variant B: keyDown type
  await cdp.evalExpr(`(() => { document.querySelectorAll('details')[0].open = false; return 1; })()`);
  await cdp.key({ downType: 'keyDown', key: 'Enter', code: 'Enter', vk: 13, text: '\r' });
  console.log('B summary keyDown+text open =', await cdp.evalExpr(`document.querySelectorAll('details')[0].open`));

  // variant C: rawKeyDown no text
  await cdp.evalExpr(`(() => { document.querySelectorAll('details')[0].open = false; return 1; })()`);
  await cdp.key({ key: 'Enter', code: 'Enter', vk: 13 });
  console.log('C summary rawKeyDown no-text open =', await cdp.evalExpr(`document.querySelectorAll('details')[0].open`));

  // variant D: dispatchMouseEvent click (sanity)
  await cdp.evalExpr(`(() => { document.querySelectorAll('details')[0].open = false; return 1; })()`);
  await cdp.evalExpr(`document.querySelectorAll('summary')[0].click()`);
  console.log('D summary el.click() open =', await cdp.evalExpr(`document.querySelectorAll('details')[0].open`));

  // --- hamburger Enter @390 ---
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp.send('Page.navigate', { url: `${BASE}/` });
  await new Promise((r) => setTimeout(r, 2500));
  await cdp.evalExpr(`(() => { const b = document.querySelector('.wp-block-navigation__responsive-container-open'); b.focus(); return document.activeElement.className; })()`);
  await cdp.key({ key: 'Enter', code: 'Enter', vk: 13, text: '\r' });
  console.log('E hamburger rawKeyDown+text open =', await cdp.evalExpr(`(() => { const box = document.querySelector('.wp-block-navigation__responsive-container'); const vis = el => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length)); return vis(box); })()`));

  await cdp.evalExpr(`(() => { const c = document.querySelector('.wp-block-navigation__responsive-container-close'); if (c) c.click(); return 1; })()`);
  await new Promise((r) => setTimeout(r, 500));
  await cdp.key({ downType: 'keyDown', key: 'Enter', code: 'Enter', vk: 13, text: '\r' });
  console.log('F hamburger keyDown+text open =', await cdp.evalExpr(`(() => { const box = document.querySelector('.wp-block-navigation__responsive-container'); const vis = el => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length)); return vis(box); })()`));

  // variant G: Space on summary (known-working from kb-nav)
  ws.close(); await chrome.kill();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
