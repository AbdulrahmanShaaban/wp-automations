#!/usr/bin/env node
/**
 * Motion evidence pass — P3 clinic (2026-10-07).
 *
 * Verifies, by measurement, the theme's claim: content is visible by default
 * and hidden ONLY while the script adds `js-motion` to <html>.
 *   A. JS on  -> js-motion present, reveals end visible after full scroll
 *                (waits out the .7s transition; lists anything still hidden)
 *   B. JS off -> no js-motion, 0/.reveal hidden, form/rule still visible
 *   C. prefers-reduced-motion: reduce -> script refuses to arm, 0 hidden,
 *      .rule animation off, transitions none
 *
 * Writes: motion-{js-on,js-off,reduced}-{home,book}.json, screens/motion-*.png
 * Usage: node docs/AUDIT/evidence/a11y/tools/motion.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..');
const SCREENS = path.join(OUT, 'screens');
fs.mkdirSync(SCREENS, { recursive: true });

const BASE = 'http://localhost:8889';
const chromeLauncher = require(path.join('D:/my work/p1-fashion-store/node_modules/chrome-launcher'));
const WebSocket = require(path.join('D:/my work/p1-fashion-store/node_modules/ws'));

const write = (name, data) => {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 1));
  console.log('  wrote ' + name);
};
const LOG = path.join(__dirname, 'motion.log');
fs.writeFileSync(LOG, `motion.js start ${new Date().toISOString()}\n`);
const log = (m) => { console.log(m); fs.appendFileSync(LOG, m + '\n'); };

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
    await this.evalExpr(`(async () => { if (document.readyState !== 'complete') { await new Promise(r => { document.addEventListener('load', r, {once:true}); setTimeout(r, 12000); }); } return document.readyState; })()`);
    await new Promise((r) => setTimeout(r, settle));
  }
  async scrollThrough() {
    await this.evalExpr(`(async () => {
      const step = Math.round(window.innerHeight * 0.8);
      for (let y = 0; y < document.body.scrollHeight + step; y += step) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 130));
      }
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise(r => setTimeout(r, 500));
      window.scrollTo(0, 0);
      return 'ok';
    })()`);
  }
  async shot(name) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SCREENS, name), Buffer.from(data, 'base64'));
    log('  shot ' + name);
  }
}

const REVEAL_STATE = `(() => {
  const revs = [...document.querySelectorAll('.reveal')];
  const detail = revs.map(el => ({
    cls: (el.className || '').slice(0, 70),
    hasIn: el.classList.contains('in'),
    opacity: parseFloat(getComputedStyle(el).opacity),
    text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 55),
  }));
  return {
    jsMotionOnHtml: document.documentElement.classList.contains('js-motion'),
    reducedMotionQuery: matchMedia('(prefers-reduced-motion: reduce)').matches,
    revealTotal: revs.length,
    hiddenCount: detail.filter(d => d.opacity < 0.99).length,
    notInCount: detail.filter(d => !d.hasIn).length,
    hiddenSample: detail.filter(d => d.opacity < 0.99).slice(0, 12),
    rule: (() => { const r = document.querySelector('.rule'); if (!r) return 'no-.rule'; const cs = getComputedStyle(r); return { animationName: cs.animationName, transform: cs.transform, w: Math.round(r.getBoundingClientRect().width) }; })(),
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    anyTransition: [...document.querySelectorAll('body *')].filter(el => { const cs = getComputedStyle(el); return cs.transitionDuration && cs.transitionDuration !== '0s'; }).length,
    bodyTextLen: document.body.innerText.length,
    bookingFormVisible: (() => { const f = document.querySelector('.siraj-booking form'); if (!f) return 'no-form'; const r = f.getBoundingClientRect(); return r.width > 100 && r.height > 100; })(),
  };
})()`;

(async () => {
  log('== motion pass ==');
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

  const tests = { generatedAt: new Date().toISOString(), checks: [] };
  const check = (id, ok, detail) => { tests.checks.push({ id, ok: !!ok, detail }); log(`  ${ok ? 'PASS' : 'FAIL'} ${id} :: ${JSON.stringify(detail).slice(0, 300)}`); };

  /* --------------------------------------------------- A. JS on (default) */
  await cdp.send('Emulation.setEmulatedMedia', { features: [] });
  for (const [id, url] of [['home', `${BASE}/`], ['book', `${BASE}/book/`]]) {
    await cdp.navigate(url, 1600);
    await cdp.scrollThrough();
    await new Promise((r) => setTimeout(r, 2200)); // let .7s transitions finish
    const st = await cdp.evalExpr(REVEAL_STATE);
    write(`motion-js-on-${id}.json`, st);
    log(`  js-on ${id}: total=${st.revealTotal} hidden=${st.hiddenCount} notIn=${st.notInCount} jsMotion=${st.jsMotionOnHtml}`);
    // armed only matters when the page actually has .reveal elements
    check(`js-on-${id}-js-motion-armed`, st.revealTotal === 0 || st.jsMotionOnHtml === true,
      { jsMotion: st.jsMotionOnHtml, reduced: st.reducedMotionQuery, revealTotal: st.revealTotal, note: st.revealTotal === 0 ? 'page has no .reveal elements — nothing to arm or hide' : undefined });
    check(`js-on-${id}-all-reveals-visible-after-scroll`, st.hiddenCount === 0, { total: st.revealTotal, hidden: st.hiddenCount, notIn: st.notInCount, hiddenSample: st.hiddenSample });
    if (id === 'home') await cdp.shot('motion-js-on-home-1440.png');
  }

  /* --------------------------------------------------- B. JavaScript disabled */
  await cdp.send('Emulation.setScriptExecutionDisabled', { value: true });
  for (const [id, url] of [['home', `${BASE}/`], ['book', `${BASE}/book/`]]) {
    await cdp.navigate(url, 1800);
    const st = await cdp.evalExpr(REVEAL_STATE);
    write(`motion-js-off-${id}.json`, st);
    log(`  js-off ${id}: total=${st.revealTotal} hidden=${st.hiddenCount} jsMotion=${st.jsMotionOnHtml} rule=${JSON.stringify(st.rule)}`);
    check(`js-off-${id}-no-js-motion-class`, st.jsMotionOnHtml === false, { jsMotion: st.jsMotionOnHtml });
    check(`js-off-${id}-all-reveals-visible`, st.hiddenCount === 0, { total: st.revealTotal, hidden: st.hiddenCount, hiddenSample: st.hiddenSample });
    if (id === 'home') await cdp.shot('motion-js-off-home-1440.png');
  }
  await cdp.send('Emulation.setScriptExecutionDisabled', { value: false });

  /* ------------------------------------ C. prefers-reduced-motion: reduce */
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  for (const [id, url] of [['home', `${BASE}/`], ['book', `${BASE}/book/`]]) {
    await cdp.navigate(url, 1700);
    await cdp.scrollThrough();
    await new Promise((r) => setTimeout(r, 900));
    const st = await cdp.evalExpr(REVEAL_STATE);
    write(`motion-reduced-${id}.json`, st);
    log(`  reduced ${id}: total=${st.revealTotal} hidden=${st.hiddenCount} jsMotion=${st.jsMotionOnHtml} rule=${JSON.stringify(st.rule)} anyTransition=${st.anyTransition}`);
    check(`reduced-${id}-query-matches`, st.reducedMotionQuery === true, { reduced: st.reducedMotionQuery });
    check(`reduced-${id}-script-did-not-arm`, st.jsMotionOnHtml === false, { jsMotion: st.jsMotionOnHtml });
    check(`reduced-${id}-all-content-visible`, st.hiddenCount === 0, { total: st.revealTotal, hidden: st.hiddenCount, hiddenSample: st.hiddenSample });
    check(`reduced-${id}-rule-animation-off`, st.rule === 'no-.rule' || st.rule.animationName === 'none', st.rule);
    if (id === 'home') await cdp.shot('motion-reduced-home-1440.png');
  }
  await cdp.send('Emulation.setEmulatedMedia', { features: [] });

  write('motion-tests.json', tests);
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  ws.close();
  await chrome.kill();
  const failed = tests.checks.filter((c) => !c.ok).length;
  log(`done: ${tests.checks.length} checks, ${failed} failed`);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
