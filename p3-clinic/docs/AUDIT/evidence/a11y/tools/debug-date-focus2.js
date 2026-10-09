/** Deep-debug: why does #siraj-date-1 not match :focus? */
'use strict';
const path = require('path');
const chromeLauncher = require(path.join('D:/my work/p1-fashion-store/node_modules/chrome-launcher'));
const WebSocket = require(path.join('D:/my work/p1-fashion-store/node_modules/ws'));
const BASE = 'http://localhost:8889';

(async () => {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars'] });
  const targets = await (await fetch(`http://127.0.0.1:${chrome.port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.once('open', r));
  let id = 0; const pending = new Map();
  ws.on('message', (raw) => { const m = JSON.parse(String(raw)); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
  const send = (method, params = {}) => { const i = ++id; return new Promise((res) => { pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); }); };
  const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${BASE}/book/` });
  await new Promise((r) => setTimeout(r, 2500));

  console.log(await ev(`(() => {
    const out = {};
    out.dupIds = document.querySelectorAll('#siraj-date-1').length;
    const d = document.querySelector('#siraj-date-1');
    out.html = d.outerHTML.slice(0, 300);
    d.focus();
    out.activeIsD = document.activeElement === d;
    out.activeId = document.activeElement.id;
    out.dFocus = d.matches(':focus');
    out.dFocusVisible = d.matches(':focus-visible');
    out.activeFocus = document.activeElement.matches(':focus');
    // sanity: text input
    const n = document.querySelector('#siraj-name-1');
    n.focus();
    out.nameActive = document.activeElement.id;
    out.nameFocus = n.matches(':focus');
    out.nameBS = getComputedStyle(n).boxShadow.slice(0, 60);
    // back to date
    d.focus();
    out.back = { active: document.activeElement.id, focus: d.matches(':focus'), fv: d.matches(':focus-visible'), bs: getComputedStyle(d).boxShadow, bc: getComputedStyle(d).borderColor };
    // try focus({focusVisible:true}) where supported
    try { d.focus({ focusVisible: true }); out.forceFV = { fv: d.matches(':focus-visible'), focus: d.matches(':focus'), bs: getComputedStyle(d).boxShadow.slice(0, 60) }; } catch (e) { out.forceFV = String(e); }
    return JSON.stringify(out, null, 1);
  })()`));

  // Real Tab all the way: name -> phone -> service -> date
  await ev(`document.querySelector('#siraj-name-1').focus(); 1`);
  for (let i = 0; i < 3; i++) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log('after 3 Tabs:', await ev(`(() => {
    const a = document.activeElement;
    const cs = getComputedStyle(a);
    return JSON.stringify({ id: a.id, type: a.type, focus: a.matches(':focus'), fv: a.matches(':focus-visible'), bs: cs.boxShadow, bc: cs.borderColor, outline: cs.outline });
  })()`));

  // elementFromPoint over the date field to confirm hit target
  console.log('hit test:', await ev(`(() => {
    const d = document.querySelector('#siraj-date-1');
    const r = d.getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width - 24, r.y + r.height / 2);
    return JSON.stringify({ rect: { x: r.x, y: r.y, w: r.width, h: r.height }, hit: el ? el.tagName + '.' + (el.className || '').toString().slice(0, 50) : null, same: el === d, inShadow: !!(el && el.getRootNode().host) });
  })()`));

  ws.close(); await chrome.kill();
})().catch((e) => { console.error(e); process.exit(1); });
