#!/usr/bin/env node
/**
 * Read-only live probe: why is the focused skip link not painted?
 *  - computed clip/clip-path/position/zIndex at :focus
 *  - elementFromPoint(50,28): which element actually paints there
 *  - stacking: skip link vs .site-header
 *  - fresh home viewport screenshot -> md5 (identity vs A4B56E05 group)
 * Writes debug-skiplink.json
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const OUT = path.join(__dirname, '..');
const BASE = 'http://localhost:8889';
const chromeLauncher = require(path.join('D:/my work/p1-fashion-store/node_modules/chrome-launcher'));
const WebSocket = require(path.join('D:/my work/p1-fashion-store/node_modules/ws'));

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
    await new Promise((r) => setTimeout(r, settle));
  }
}

(async () => {
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
  await cdp.navigate(`${BASE}/`);

  const pre = await cdp.evalExpr(`(() => {
    const s = document.querySelector('.skip-link');
    if (!s) return { present: false };
    const cs = getComputedStyle(s);
    const r = s.getBoundingClientRect();
    return { present: true, rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      clip: cs.clip, clipPath: cs.clipPath, position: cs.position, zIndex: cs.zIndex,
      opacity: cs.opacity, visibility: cs.visibility };
  })()`);

  // real first Tab stop = skip link
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await new Promise((r) => setTimeout(r, 300));

  const post = await cdp.evalExpr(`(() => {
    const s = document.querySelector('.skip-link');
    const cs = getComputedStyle(s);
    const r = s.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
    const hitEdge = document.elementFromPoint(Math.round(r.x + 8), Math.round(r.y + 8));
    const hdr = document.querySelector('.site-header');
    const hcs = hdr ? getComputedStyle(hdr) : null;
    const hr = hdr ? hdr.getBoundingClientRect() : null;
    const zIndexChain = (() => {
      const chain = []; let el = s;
      while (el && el !== document.documentElement) {
        const c = getComputedStyle(el);
        if (c.zIndex !== 'auto' || c.position === 'fixed' || c.position === 'sticky') {
          chain.push({ el: el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0], position: c.position, z: c.zIndex });
        }
        el = el.parentElement;
      }
      return chain;
    })();
    return {
      active: document.activeElement.className || document.activeElement.tagName,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      clip: cs.clip, clipPath: cs.clipPath, position: cs.position, zIndex: cs.zIndex,
      background: cs.backgroundColor, outline: cs.outline,
      focusVisible: s.matches(':focus-visible'),
      hitAtCenter: hit ? hit.tagName.toLowerCase() + '.' + String(hit.className || '').split(' ').slice(0,2).join('.') : null,
      hitAtTopLeft: hitEdge ? hitEdge.tagName.toLowerCase() + '.' + String(hitEdge.className || '').split(' ').slice(0,2).join('.') : null,
      header: hcs ? { position: hcs.position, z: hcs.zIndex, rect: { y: hr.y, h: hr.height }, bg: hcs.backgroundColor, backdrop: hcs.backdropFilter } : null,
      zIndexChain,
    };
  })()`);

  // fresh home viewport screenshot -> md5 for identity of the A4B56E05 group
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(data, 'base64');
  const md5 = crypto.createHash('md5').update(buf).digest('hex').toUpperCase();
  fs.writeFileSync(path.join(OUT, 'screens', 'skiplink-live-focused.png'), buf);

  const out = { generatedAt: new Date().toISOString(), pre, post, freshHomeMd5: md5,
    groupMd5: 'A4B56E05 (truncated)', freshBytes: buf.length };
  fs.writeFileSync(path.join(OUT, 'debug-skiplink.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
  await chrome.kill();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
