// cls-scroll.js — READ-ONLY audit helper (docs/AUDIT/evidence/perf only).
// Measures real layout-shift entries (with sources) on the homepage while
// scrolling, to separate font-swap CLS from reveal-animation CLS.
// Usage: node cls-scroll.js
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

const REPORT = `JSON.stringify({
  cls: (() => { const e = performance.getEntriesByType('layout-shift'); return e.reduce((s, x) => s + (x.hadRecentInput ? 0 : x.value), 0); })(),
  count: performance.getEntriesByType('layout-shift').length,
  entries: performance.getEntriesByType('layout-shift').map(e => ({
    value: Number(e.value.toFixed(4)),
    hadRecentInput: e.hadRecentInput,
    startTime: Math.round(e.startTime),
    sources: (e.sources || []).map(s => ({
      node: s.node ? (s.node.nodeName + (s.node.className ? '.' + String(s.node.className).split(' ').slice(0,2).join('.') : '')) : null,
      previousRect: s.previousRect ? {w: s.previousRect.width, h: s.previousRect.height} : null,
      currentRect: s.currentRect ? {w: s.currentRect.width, h: s.currentRect.height} : null,
    })),
  })),
  fcp: (performance.getEntriesByType('paint').find(x => x.name === 'first-contentful-paint') || {}).startTime,
  ttfb: (performance.getEntriesByType('navigation')[0] || {}).responseStart,
  fontResources: performance.getEntriesByType('resource').filter(r => r.initiatorType === 'css' || /\.woff2/.test(r.name)).map(r => ({ n: r.name.replace(location.origin,''), start: Math.round(r.startTime), end: Math.round(r.responseEnd) })),
  imgsLoaded: performance.getEntriesByType('resource').filter(r => r.initiatorType === 'img').map(r => r.name.replace(location.origin,'')),
})`;

(async () => {
  const { launch } = require(path.join(NODE_PATH, 'chrome-launcher'));
  const chrome = await launch({ chromePath: CHROME, chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars'] });
  const out = { generatedAt: new Date().toISOString(), url: BASE + '/', runs: [] };
  try {
    const tab = await newTarget(chrome.port);
    const c = await CDP(tab);
    await c.send('Page.enable');
    await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await c.send('Page.navigate', { url: BASE + '/' });
    await c.once('Page.loadEventFired');
    await new Promise((r) => setTimeout(r, 3000));
    // scroll the whole page in 700px steps, then read layout-shift buffer
    for (let i = 0; i < 14; i++) {
      await c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 195, y: 400, deltaX: 0, deltaY: 700 });
      await new Promise((r) => setTimeout(r, 650));
    }
    await new Promise((r) => setTimeout(r, 2500));
    const r = await c.send('Runtime.evaluate', { expression: REPORT, returnByValue: true });
    out.runs.push({ afterScroll: JSON.parse(r.result.value) });
    console.log('afterScroll', JSON.stringify(out.runs[0].afterScroll, null, 1));

    // second run: no scroll at all (font-only CLS)
    await c.send('Page.navigate', { url: BASE + '/?nocache=2' });
    await c.once('Page.loadEventFired');
    await new Promise((r) => setTimeout(r, 4000));
    const r2 = await c.send('Runtime.evaluate', { expression: REPORT, returnByValue: true });
    out.runs.push({ noScroll: JSON.parse(r2.result.value) });
    console.log('noScroll', JSON.stringify(out.runs[1].noScroll, null, 1));
  } finally { await chrome.kill(); }
  fs.writeFileSync(path.join(OUT, 'cls-scroll.json'), JSON.stringify(out, null, 2));
  console.log('done -> cls-scroll.json');
})();
