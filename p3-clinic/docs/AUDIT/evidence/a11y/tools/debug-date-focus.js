/** Debug date-input focus styles @ /book/ */
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

  console.log('--- programmatic .focus() on date input ---');
  console.log(await ev(`(() => {
    const d = document.querySelector('#siraj-date-1');
    d.focus();
    const cs = getComputedStyle(d);
    const rules = [];
    for (const sh of document.styleSheets) {
      try { for (const r of sh.cssRules) {
        if (r.selectorText && /focus/.test(r.selectorText)) {
          const m = r.selectorText.split(',').some(s => s.includes('input') || s.includes(':where'));
          if (m) rules.push(r.selectorText.slice(0, 100) + ' => ' + (r.style.cssText || '').slice(0, 140));
        }
      } } catch (e) {}
    }
    return JSON.stringify({
      active: document.activeElement.id, type: d.type,
      focus: d.matches(':focus'), fv: d.matches(':focus-visible'),
      boxShadow: cs.boxShadow, borderColor: cs.borderColor, outline: cs.outline,
      matched: rules,
    }, null, 1);
  })()`));

  console.log('--- via Tab from name input ---');
  await ev(`document.querySelector('#siraj-name-1').focus(); 1`);
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await new Promise((r) => setTimeout(r, 300));
  console.log(await ev(`(() => {
    const d = document.querySelector('#siraj-date-1');
    const a = document.activeElement;
    const cs = getComputedStyle(d);
    const acs = getComputedStyle(a);
    return JSON.stringify({
      activeId: a.id, activeTag: a.tagName, activeType: a.type, activeIsDate: a === d,
      dateFocus: d.matches(':focus'), dateFV: d.matches(':focus-visible'),
      dateBS: cs.boxShadow, dateBC: cs.borderColor,
      activeBS: acs.boxShadow, activeBC: acs.borderColor,
    });
  })()`));

  ws.close(); await chrome.kill();
})().catch((e) => { console.error(e); process.exit(1); });
