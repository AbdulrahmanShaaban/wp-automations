// probe-reveal.js — READ-ONLY audit helper (docs/AUDIT/evidence/perf only).
// Checks the theme's reveal-on-scroll state on the homepage: are .reveal
// elements stuck at opacity 0 (invisible content), and does scrolling reveal
// them? Saves reveal-<scrollPos>.png screenshots + probe-reveal.json.
// Usage: node probe-reveal.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { pathToFileURL } = require('url');

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
  let id = 0;
  const pending = new Map();
  await new Promise((resolve, reject) => { socket.on('open', resolve); socket.on('error', reject); });
  socket.on('message', (data) => {
    let msg; try { msg = JSON.parse(data.toString()); } catch (e) { return; }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
    }
  });
  return {
    send(method, params) {
      const mid = ++id;
      return new Promise((res, rej) => {
        pending.set(mid, { resolve: res, reject: rej });
        socket.send(JSON.stringify({ id: mid, method, params: params || {} }));
        setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); rej(new Error('timeout ' + method)); } }, 180000);
      });
    },
    once(evt, timeoutMs) {
      return new Promise((res) => {
        const t = setTimeout(() => res(null), timeoutMs || 120000);
        const h = (data) => {
          let m; try { m = JSON.parse(data.toString()); } catch (e) { return; }
          if (m.method === evt) { clearTimeout(t); socket.off('message', h); res(m); }
        };
        socket.on('message', h);
      });
    },
  };
}

const STATE = `(() => {
  const els = [...document.querySelectorAll('.reveal')];
  const vh = window.innerHeight;
  return JSON.stringify({
    scrollY: Math.round(window.scrollY), vh,
    jsMotion: document.documentElement.classList.contains('js-motion'),
    total: els.length,
    inClass: els.filter(e => e.classList.contains('in')).length,
    opacityZero: els.filter(e => getComputedStyle(e).opacity === '0').length,
    inViewportHidden: els.filter(e => {
      const r = e.getBoundingClientRect();
      return r.top < vh && r.bottom > 0 && getComputedStyle(e).opacity === '0';
    }).length,
    sample: els.slice(0, 6).map(e => ({
      cls: e.className.slice(0, 60),
      tag: e.tagName,
      opacity: getComputedStyle(e).opacity,
      top: Math.round(e.getBoundingClientRect().top),
      inView: e.getBoundingClientRect().top < vh,
    })),
  });
})()`;

(async () => {
  const { launch } = require(path.join(NODE_PATH, 'chrome-launcher'));
  const chrome = await launch({ chromePath: CHROME, chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars'] });
  const out = { generatedAt: new Date().toISOString(), url: BASE + '/', steps: [] };
  try {
    const tab = await newTarget(chrome.port);
    const client = await CDP(tab);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await client.send('Page.navigate', { url: BASE + '/' });
    await client.once('Page.loadEventFired', 180000);
    const shot = async (label) => {
      const r = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(OUT, 'reveal-' + label + '.png'), Buffer.from(r.data, 'base64'));
    };
    const evalState = async (label) => {
      const r = await client.send('Runtime.evaluate', { expression: STATE, returnByValue: true });
      const s = JSON.parse(r.result.value);
      s.label = label;
      out.steps.push(s);
      console.log('STEP', label, JSON.stringify(s));
      await shot(label);
    };
    await new Promise((r) => setTimeout(r, 2500));
    await evalState('01-after-load-2.5s');
    for (const y of [400, 900, 1600, 2400, 3200, 4200, 5200, 6400, 7600]) {
      await client.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 195, y: 400, deltaX: 0, deltaY: 600 });
      await new Promise((r) => setTimeout(r, 900));
      await evalState('02-scroll-' + y);
    }
    // full page after scrolling
    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 195, y: 400, deltaX: 0, deltaY: 2000 });
    await new Promise((r) => setTimeout(r, 1500));
    const r2 = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, captureSnapshot: true });
    fs.writeFileSync(path.join(OUT, 'reveal-03-after-full-scroll.png'), Buffer.from(r2.data, 'base64'));
    await evalState('03-end');
  } finally {
    await chrome.kill();
  }
  fs.writeFileSync(path.join(OUT, 'probe-reveal.json'), JSON.stringify(out, null, 2));
  console.log('done -> probe-reveal.json');
})();
