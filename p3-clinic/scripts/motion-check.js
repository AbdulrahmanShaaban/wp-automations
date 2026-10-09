/**
 * Motion verification (P3, 2026-10-07).
 *
 * Proves the reveal system fails safe in every mode:
 *   1. CSS scroll-driven path  — browser supports animation-timeline, JS bails out
 *   2. JS fallback path        — forced (support check disabled), IntersectionObserver arms
 *   3. No-JS                   — script execution disabled: everything must stay visible
 *   4. prefers-reduced-motion  — nothing may be hidden
 * Plus: the hero .rule is drawn, and nothing overflows horizontally while animating.
 *
 * Usage: node scripts/motion-check.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const chromeLauncher = require(path.join('D:/my work/p1-fashion-store/node_modules/chrome-launcher'));
const WebSocket = require(path.join('D:/my work/p1-fashion-store/node_modules/ws'));

const BASE = 'http://localhost:8889';
const OUT = path.join(__dirname, '..', 'docs', 'evidence');

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = new Map();
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.id && this.pending.has(m.id)) { const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id); if (m.error) rej(new Error(m.error.message)); else res(m.result); }
      else if (m.method) (this.listeners.get(m.method) || []).forEach((f) => f(m.params));
    });
  }
  send(method, params = {}) { const id = ++this.id; return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  once(method) { return new Promise((res) => { const arr = this.listeners.get(method) || []; const fn = (p) => { this.listeners.set(method, arr.filter((f) => f !== fn)); res(p); }; arr.push(fn); this.listeners.set(method, arr); }); }
  async evalExpr(e) { const r = await this.send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; }
}

async function nav(cdp, url, settle = 1200) {
  const l = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url });
  await Promise.race([l, new Promise((r) => setTimeout(r, 30000))]);
  await new Promise((r) => setTimeout(r, settle));
}

const STATE = `(() => {
  const revs = [...document.querySelectorAll('.reveal')];
  const cs = (el) => getComputedStyle(el);
  const hidden = revs.filter(el => parseFloat(cs(el).opacity) < 0.99);
  const rule = document.querySelector('.hero .rule');
  return {
    total: revs.length,
    hiddenCount: hidden.length,
    hiddenSample: hidden.slice(0, 4).map(el => ({
      cls: el.className.toString().split(' ').slice(0, 3).join('.'),
      opacity: cs(el).opacity,
      transform: cs(el).transform.slice(0, 30),
    })),
    inClass: revs.filter(el => el.classList.contains('in')).length,
    jsMotionClass: document.documentElement.classList.contains('js-motion'),
    supportsScrollTimeline: !!(CSS && CSS.supports && CSS.supports('animation-timeline', 'view')),
    animationName: revs[0] ? cs(revs[0]).animationName : null,
    ruleTransform: rule ? cs(rule).transform : null,
    heroVisible: (() => { const h = document.querySelector('h1'); return !!h && parseFloat(cs(h).opacity) > 0.99; })(),
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
})()`;

const scrollTo = (y) => `(async () => { window.scrollTo(0, ${y}); await new Promise(r => setTimeout(r, 700)); return window.scrollY; })()`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars'] });
  const t = await (await fetch(`http://127.0.0.1:${chrome.port}/json/list`)).json();
  const ws = new WebSocket(t.find((x) => x.type === 'page').webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  const cdp = new CDP(ws);
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable')]);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  const report = { generatedAt: new Date().toISOString(), base: BASE, modes: {} };

  // 1) default (scroll-driven CSS in this Chrome)
  await nav(cdp, BASE + '/');
  report.modes.cssScrollDriven_top = await cdp.evalExpr(STATE);
  await cdp.evalExpr(scrollTo(2600));
  report.modes.cssScrollDriven_mid = await cdp.evalExpr(STATE);
  const shot1 = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, 'motion-css-path-1440.png'), Buffer.from(shot1.data, 'base64'));
  await cdp.evalExpr(scrollTo(0));

  // 2) force the JS fallback by hiding the scroll-timeline feature
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: 'const _s = CSS.supports.bind(CSS); CSS.supports = function(a, b){ if (String(a).indexOf("animation-timeline") === 0) return false; return _s(a, b); };',
  });
  await nav(cdp, BASE + '/');
  report.modes.jsFallback_top = await cdp.evalExpr(STATE);
  await cdp.evalExpr(scrollTo(2600));
  report.modes.jsFallback_mid = await cdp.evalExpr(STATE);
  const shot2 = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, 'motion-js-path-1440.png'), Buffer.from(shot2.data, 'base64'));
  await cdp.evalExpr(scrollTo(0));

  // 3) no JS at all (keeps the feature shim, so CSS-only path still applies)
  await cdp.send('Emulation.setScriptExecutionDisabled', { value: true });
  await nav(cdp, BASE + '/');
  report.modes.noJs = await cdp.evalExpr(STATE);
  const shot3 = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, 'motion-nojs-1440.png'), Buffer.from(shot3.data, 'base64'));
  await cdp.send('Emulation.setScriptExecutionDisabled', { value: false });

  // 4) prefers-reduced-motion
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await nav(cdp, BASE + '/');
  report.modes.reducedMotion = await cdp.evalExpr(STATE);
  await cdp.send('Emulation.setEmulatedMedia', { features: [] });

  fs.writeFileSync(path.join(OUT, 'motion-report.json'), JSON.stringify(report, null, 1));
  for (const [k, v] of Object.entries(report.modes)) {
    console.log(`${k.padEnd(22)} total=${v.total} hidden=${v.hiddenCount} in=${v.inClass} jsMotion=${v.jsMotionClass} cssTimeline=${v.supportsScrollTimeline} anim=${v.animationName} overflowX=${v.overflowX}`);
  }
  ws.close();
  await chrome.kill();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });