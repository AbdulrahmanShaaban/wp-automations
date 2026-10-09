// probe-reveal-tail.js — READ-ONLY audit helper (docs/AUDIT/evidence/perf only).
// Which .reveal elements stay at opacity 0 after scrolling to the bottom?
// Usage: node probe-reveal-tail.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE = 'http://localhost:8889';
const OUT = __dirname;
const NODE_PATH = 'D:\\my work\\p1-fashion-store\\node_modules';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function newTarget(port) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path: '/json/new?about:blank', method: 'PUT' }, (res) => {
      let b = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { b += c; });
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    });
    r.on('error', reject);
    r.end();
  });
}
async function CDP(tab) {
  const WebSocket = require(path.join(NODE_PATH, 'ws'));
  const socket = new WebSocket(tab.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 268435456 });
  let id = 0; const pending = new Map();
  await new Promise((res, rej) => { socket.on('open', res); socket.on('error', rej); });
  socket.on('message', (d) => {
    let m; try { m = JSON.parse(d.toString()); } catch (e) { return; }
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result); }
  });
  return {
    send(method, params) {
      const mid = ++id;
      return new Promise((res, rej) => { pending.set(mid, { resolve: res, reject: rej }); socket.send(JSON.stringify({ id: mid, method, params: params || {} })); setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); rej(new Error('timeout ' + method)); } }, 180000); });
    },
    once(evt, t) { return new Promise((res) => { const to = setTimeout(() => res(null), t || 180000); const h = (d) => { let m; try { m = JSON.parse(d.toString()); } catch (e) { return; } if (m.method === evt) { clearTimeout(to); socket.off('message', h); res(m); } }; socket.on('message', h); }); },
  };
}

(async () => {
  const { launch } = require(path.join(NODE_PATH, 'chrome-launcher'));
  const chrome = await launch({ chromePath: CHROME, chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars'] });
  const out = { generatedAt: new Date().toISOString() };
  try {
    const tab = await newTarget(chrome.port);
    const c = await CDP(tab);
    await c.send('Page.enable');
    await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await c.send('Page.navigate', { url: BASE + '/' });
    await c.once('Page.loadEventFired');
    // scroll through the whole page in steps, then report
    const expr = `(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      return document.documentElement.scrollHeight;
    })()`;
    await c.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    await new Promise((r) => setTimeout(r, 3000));
    const probe = `JSON.stringify({
      scrollY: Math.round(window.scrollY),
      maxScroll: document.documentElement.scrollHeight - window.innerHeight,
      stillHidden: [...document.querySelectorAll('.reveal')].filter(e => getComputedStyle(e).opacity === '0').map(e => ({
        tag: e.tagName, cls: e.className, text: (e.textContent||'').trim().slice(0,70),
        rect: (({top,bottom}) => ({top:Math.round(top),bottom:Math.round(bottom)}))(e.getBoundingClientRect()),
        hasIn: e.classList.contains('in'),
      }))
    })`;
    const r = await c.send('Runtime.evaluate', { expression: probe, returnByValue: true });
    out.afterJumpToBottom = JSON.parse(r.result.value);
    // now do a slow stepped scroll to bottom and re-check
    await c.send('Runtime.evaluate', { expression: 'window.scrollTo(0,0)' });
    await new Promise((r) => setTimeout(r, 500));
    for (let i = 0; i < 14; i++) {
      await c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 195, y: 400, deltaX: 0, deltaY: 700 });
      await new Promise((r) => setTimeout(r, 700));
    }
    await new Promise((r) => setTimeout(r, 2000));
    const r2 = await c.send('Runtime.evaluate', { expression: probe, returnByValue: true });
    out.afterSlowScroll = JSON.parse(r2.result.value);
    const shot = await c.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(OUT, 'reveal-fullpage-final.png'), Buffer.from(shot.data, 'base64'));
  } finally { await chrome.kill(); }
  fs.writeFileSync(path.join(OUT, 'probe-reveal-tail.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})();
