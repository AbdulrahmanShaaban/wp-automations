// probe-paint.js — READ-ONLY audit helper (docs/AUDIT/evidence/perf only).
// Diagnoses Lighthouse NO_FCP: measures real paint timings + whether .reveal
// elements start hidden. Saves probe-paint.json.
// Usage: node probe-paint.js [path ...]
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { pathToFileURL } = require('url');

const BASE = 'http://localhost:8889';
const OUT = __dirname;
const NODE_PATH = 'D:\\my work\\p1-fashion-store\\node_modules';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const PATHS = process.argv.slice(2).length ? process.argv.slice(2) : ['/', '/services/', '/team/', '/contact/', '/book/'];

(async () => {
  const { launch } = require(path.join(NODE_PATH, 'chrome-launcher'));
  const chrome = await launch({
    chromePath: CHROME,
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  const out = { generatedAt: new Date().toISOString(), pages: {} };
  try {
    for (const p of PATHS) {
      const url = BASE + p;
      const tab = await newTarget(chrome.port);
      const client = await CDP(tab);
      const page = [];
      await client.send('Page.enable');
      await client.send('Runtime.enable');
      await client.send('Network.enable');
      await client.send('Network.setCacheDisabled', { cacheDisabled: true });
      await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      await client.send('Page.navigate', { url });
      const netStart = Date.now();
      await new Promise((resolve) => {
        const onEvt = (msg) => {
          const m = msg.method || '';
          if (m === 'Page.loadEventFired') { client.off('Page.loadEventFired', onEvt); resolve(); }
          if (m === 'Network.responseReceived') {
            const r = msg.params.response;
            if (r.request.url.includes('/wp-json') || r.request.url.includes('admin')) return;
            page.push({ url: r.request.url.replace(BASE, ''), status: r.response.status,
              mimeType: r.response.mimeType, protocol: r.response.protocol,
              encodedDataLength: r.response.encodedDataLength,
              sendAt: Math.round(msg.params.timestamp * 1000) });
          }
        };
        client.on('Page.loadEventFired', onEvt);
        setTimeout(resolve, 120000);
      });
      const loadMs = Date.now() - netStart;
      // wait a bit for paint/reveal transitions
      await new Promise((r) => setTimeout(r, 3000));
      const probe = await client.send('Runtime.evaluate', {
        expression: `JSON.stringify({
          fcp: (performance.getEntriesByType('paint').find(e=>e.name==='first-contentful-paint')||{}).startTime,
          fp: (performance.getEntriesByType('paint').find(e=>e.name==='first-paint')||{}).startTime,
          nav: (()=>{const n=performance.getEntriesByType('navigation')[0]||{};return {
            ttfb:n.responseStart, dcl:n.domContentLoadedEventStart, load:n.loadEventEnd,
            respSize:n.transferSize, encSize:n.encodedBodySize, decSize:n.decodedBodySize,
            protocol:n.nextHopProtocol};})(),
          resources: performance.getEntriesByType('resource').length,
          docHeight: document.documentElement.scrollHeight,
          revealTotal: document.querySelectorAll('.reveal').length,
          revealHidden: [...document.querySelectorAll('.reveal')].filter(e=>getComputedStyle(e).opacity==='0').length,
          revealIn: [...document.querySelectorAll('.reveal')].filter(e=>e.classList.contains('in')).length,
          jsMotion: document.documentElement.classList.contains('js-motion'),
          h1Opacity: (()=>{const h=document.querySelector('h1'); return h?getComputedStyle(h).opacity:null})(),
          firstScreenText: (()=>{const h=document.querySelector('h1');return h?h.textContent.trim().slice(0,40):null})()
        })`,
        returnByValue: true,
      });
      let parsed = null;
      try { parsed = JSON.parse(probe.result.value); } catch (e) { parsed = { raw: probe.result.value }; }
      out.pages[p] = { url, loadMs, paint: parsed, responses: page };
      console.log('PROBE', p, 'load=' + loadMs + 'ms', JSON.stringify(parsed));
      await client.send('Target.closeTarget', { targetId: tab.id }).catch(() => {});
    }
  } finally {
    await chrome.kill();
  }
  fs.writeFileSync(path.join(OUT, 'probe-paint.json'), JSON.stringify(out, null, 2));
  console.log('done -> probe-paint.json');
})();

function newTarget(port) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/json/new?about:blank', method: 'PUT' }, (res) => {
      let b = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { b += c; });
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

async function CDP(tab) {
  const wsMod = require(path.join(NODE_PATH, 'ws'));
  const WebSocket = wsMod;
  const url = tab.webSocketDebuggerUrl;
  const socket = new WebSocket(url, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0;
  const pending = new Map();
  await new Promise((resolve, reject) => {
    socket.on('open', resolve);
    socket.on('error', reject);
  });
  socket.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch (e) { return; }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
    }
  });
  return {
    send(method, params) {
      const mid = ++id;
      return new Promise((resolve, reject) => {
        pending.set(mid, { resolve, reject });
        socket.send(JSON.stringify({ id: mid, method, params: params || {} }));
        setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); reject(new Error('timeout ' + method)); } }, 180000);
      });
    },
    on(evt, fn) { socket.on('message', (data) => { let m; try { m = JSON.parse(data.toString()); } catch (e) { return; } if (m.method === evt) fn(m); }); },
    off() {},
  };
}
