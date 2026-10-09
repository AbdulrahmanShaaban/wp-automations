/** Probe: .siraj-field children structure + hidden inputs + native constraints */
'use strict';
const path = require('path');
const chromeLauncher = require(path.join('D:/my work/p1-fashion-store/node_modules/chrome-launcher'));
const WebSocket = require(path.join('D:/my work/p1-fashion-store/node_modules/ws'));

(async () => {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars'] });
  const targets = await (await fetch(`http://127.0.0.1:${chrome.port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.once('open', r));
  let id = 0; const pending = new Map();
  ws.on('message', (raw) => { const m = JSON.parse(String(raw)); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
  const send = (method, params = {}) => { const i = ++id; return new Promise((res) => { pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); }); };
  const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://localhost:8889/book/' });
  await new Promise((r) => setTimeout(r, 2500));
  console.log(await ev(`JSON.stringify({
    fields: [...document.querySelectorAll('.siraj-field')].map(f => ({
      ctl: (f.querySelector('input,select,textarea') || {}).name,
      kids: [...f.children].map(c => c.tagName.toLowerCase() + '#' + (c.id || '') + '.' + (c.className || '').toString().slice(0, 40)),
    })),
    hidden: [...document.querySelectorAll('.siraj-booking input[type=hidden]')].map(i => i.name || i.id),
    constraints: [...document.querySelectorAll('.siraj-booking input,.siraj-booking select')].map(i => ({ n: i.name, required: i.required, min: i.min || null, pattern: !!i.pattern })),
  }, null, 1)`));
  ws.close(); await chrome.kill();
})().catch((e) => { console.error(e); process.exit(1); });
