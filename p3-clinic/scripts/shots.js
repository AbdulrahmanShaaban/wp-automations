/**
 * Screenshot + DOM probe runner for the P3 content build (2026-10-07).
 * Usage: node scripts/shots.js [tag]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const chromeLauncher = require(path.join('D:/my work/p1-fashion-store/node_modules/chrome-launcher'));
const WebSocket = require(path.join('D:/my work/p1-fashion-store/node_modules/ws'));

const BASE = 'http://localhost:8889';
const TAG = process.argv[2] || 'content';
const OUT = path.join(__dirname, '..', 'docs', 'evidence');
const shots = [];

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) rej(new Error(m.error.message));
        else res(m.result);
      } else if (m.method) (this.listeners.get(m.method) || []).forEach((f) => f(m.params));
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
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500));
    return r.result.value;
  }
}

async function waitLoad(cdp, ms = 60000) {
  const fired = cdp.once('Page.loadEventFired');
  await Promise.race([fired, new Promise((r) => setTimeout(r, ms))]);
  await new Promise((r) => setTimeout(r, 400));
}
async function nav(cdp, url, settle = 1400) {
  const l = waitLoad(cdp);
  await cdp.send('Page.navigate', { url });
  await l;
  await new Promise((r) => setTimeout(r, settle));
}
async function shot(cdp, name) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(OUT, `${TAG}-${name}.png`);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  shots.push(path.basename(file));
  console.log('  shot ' + path.basename(file));
}
const PROBE = `(() => {
  const vis = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  const de = document.documentElement;
  const img = [...document.querySelectorAll('img')];
  return {
    url: location.pathname,
    dir: de.getAttribute('dir'), lang: de.getAttribute('lang'),
    h1: [...document.querySelectorAll('h1')].map(h => h.textContent.trim().slice(0, 50)),
    h1Count: document.querySelectorAll('h1').length,
    sections: [...document.querySelectorAll('section[id]')].map(s => s.id),
    hashHrefs: [...new Set([...document.querySelectorAll('a[href*="#"]')].map(a => a.getAttribute('href')))],
    brokenHash: [...new Set([...document.querySelectorAll('a[href*="#"]')].map(a => a.getAttribute('href')))]
      .filter(h => { const id = h.split('#')[1]; return id && !document.getElementById(id); }),
    imgs: img.map(i => ({ src: i.currentSrc || i.src, ok: i.complete && i.naturalWidth > 0, w: i.naturalWidth, alt: (i.alt || '').slice(0, 40) })),
    imgsNoAlt: img.filter(i => !i.hasAttribute('alt')).length,
    hamburger: (() => { const b = document.querySelector('.wp-block-navigation__responsive-container-open'); return b ? { visible: vis(b), w: b.offsetWidth, h: b.offsetHeight } : null; })(),
    forms: document.querySelectorAll('form').length,
    labels: [...document.querySelectorAll('input:not([type=hidden]),select,textarea')].map(i => ({
      name: i.name || i.id, type: i.type, label: !!(i.labels && i.labels.length) || !!i.getAttribute('aria-label') })),
    unlabelled: [...document.querySelectorAll('input:not([type=hidden]),select,textarea')]
      .filter(i => !(i.labels && i.labels.length) && !i.getAttribute('aria-label')).length,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1
      ? { scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth } : null,
    smallTargets: [...document.querySelectorAll('a,button,summary,input[type=checkbox]')]
      .filter(vis).map(el => ({ t: el.tagName + '.' + (el.className || '').toString().split(' ')[0], r: el.getBoundingClientRect() }))
      .filter(x => (x.r.width && x.r.height && (x.r.width < 24 || x.r.height < 24)))
      .slice(0, 8).map(x => x.t + ' ' + Math.round(x.r.width) + 'x' + Math.round(x.r.height)),
  };
})()`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1'],
  });
  const targets = await (await fetch(`http://127.0.0.1:${chrome.port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  const cdp = new CDP(ws);
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable')]);

  const report = { generatedAt: new Date().toISOString(), base: BASE, pages: [] };

  for (const vp of [{ n: '1440', w: 1440, h: 900, m: false }, { n: '390', w: 390, h: 844, m: true }]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.m });
    for (const [name, url] of [['home', '/'], ['book', '/book/'], ['services', '/services/'], ['team', '/team/'], ['contact', '/contact/']]) {
      await nav(cdp, BASE + url);
      if (name === 'home') {
        await cdp.evalExpr(`(async()=>{ const step=Math.round(innerHeight*0.8);
          for(let y=0;y<document.body.scrollHeight+step;y+=step){scrollTo(0,y);await new Promise(r=>setTimeout(r,90));}
          scrollTo(0,0); await new Promise(r=>setTimeout(r,250)); return 1; })()`);
      }
      const probe = await cdp.evalExpr(PROBE);
      report.pages.push({ viewport: vp.n, page: name, ...probe });
      await shot(cdp, `${name}-${vp.n}`);
    }
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  fs.writeFileSync(path.join(OUT, `${TAG}-report.json`), JSON.stringify(report, null, 1));
  console.log('wrote ' + `${TAG}-report.json + ${shots.length} shots`);
  ws.close();
  await chrome.kill();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });