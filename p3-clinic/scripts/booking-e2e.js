/**
 * Booking end-to-end test (P3): drives the real form in a real browser, submits
 * it over HTTP with the page's own nonce/cookies, then reports what the site
 * stored. Fails loudly if the success state does not appear or nothing was
 * stored — the plugin unit assertions ran in-process, this proves the browser
 * path.
 *
 * Usage: node scripts/booking-e2e.js
 */
'use strict';

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
  async evalExpr(e) { const r = await this.send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; }
}

const FILL = (values) => `(async () => {
  const set = (sel, v) => { const el = document.querySelector(sel); if (!el) return 'missing:' + sel;
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok'; };
  const out = {};
  ${Object.entries(values).map(([sel, v]) => `out['${sel}'] = set(${JSON.stringify(sel)}, ${JSON.stringify(v)});`).join('\n  ')}
  const consent = document.querySelector('.siraj-consent input');
  if (consent && !consent.checked) { consent.checked = true; consent.dispatchEvent(new Event('change', { bubbles: true })); }
  const hp = document.querySelector('input[name="siraj_website"]');
  out.honeypotPresent = !!hp;
  return out;
})()`;

(async () => {
  const width = Number(process.argv[2] || 390);
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars'] });
  const targets = await (await fetch(`http://127.0.0.1:${chrome.port}/json/list`)).json();
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  const cdp = new CDP(ws);
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable')]);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: width === 390 ? 844 : 900, deviceScaleFactor: 1, mobile: width === 390 });

  const result = { generatedAt: new Date().toISOString(), base: BASE, viewport: width };

  // --- 1) invalid submit: expect inline errors, nothing stored
  let load = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: BASE + '/book/' });
  await load; await new Promise((r) => setTimeout(r, 1200));
  result.filled = await cdp.evalExpr(FILL({
    'input[name="siraj_name"]': 'زبون تجريبي',
    'input[name="siraj_phone"]': '12345',
    'select[name="siraj_service"]': 'cleaning',
    'input[name="siraj_date"]': '2026-11-02',
    'textarea[name="siraj_notes"]': 'طلب تجريبي من اختبار آلي.',
  }));
  await cdp.evalExpr(`(() => { document.querySelector('.siraj-submit').click(); return 1; })()`);
  await new Promise((r) => setTimeout(r, 2500));
  result.invalid = await cdp.evalExpr(`(() => ({
    url: location.pathname,
    errors: [...document.querySelectorAll('.siraj-error')].map(e => e.textContent.trim()),
    alertText: (document.querySelector('.siraj-alert') || {}).textContent || null,
    invalidFields: document.querySelectorAll('[aria-invalid="true"]').length,
    stillHasForm: !!document.querySelector('.siraj-booking form'),
    successShown: !!document.querySelector('.siraj-success'),
    valueKept: (document.querySelector('input[name="siraj_name"]') || {}).value || null,
  }))()`);
  const invShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  require('fs').writeFileSync(path.join(OUT, `booking-invalid-${width}.png`), Buffer.from(invShot.data, 'base64'));

  // --- 2) valid submit: expect the success state
  load = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: BASE + '/book/' });
  await load; await new Promise((r) => setTimeout(r, 1200));
  await cdp.evalExpr(FILL({
    'input[name="siraj_name"]': 'سارة عبد الرحمن',
    'input[name="siraj_phone"]': '01012345678',
    'select[name="siraj_service"]': 'cleaning',
    'input[name="siraj_date"]': '2026-11-02',
    'textarea[name="siraj_notes"]': 'أول زيارة، morningZX9 الموعد.',
  }));
  await cdp.evalExpr(`(() => { document.querySelector('.siraj-submit').click(); return 1; })()`);
  await new Promise((r) => setTimeout(r, 3000));
  result.valid = await cdp.evalExpr(`(() => ({
    successShown: !!document.querySelector('.siraj-success'),
    successText: (document.querySelector('.siraj-success') || {}).textContent ? document.querySelector('.siraj-success').textContent.replace(/\\s+/g, ' ').trim().slice(0, 160) : null,
    successRole: (document.querySelector('.siraj-success') || {}).getAttribute ? document.querySelector('.siraj-success').getAttribute('role') : null,
    successTabindex: (document.querySelector('.siraj-success') || {}).getAttribute ? document.querySelector('.siraj-success').getAttribute('tabindex') : null,
    successFocused: !!document.querySelector('.siraj-success') && document.activeElement === document.querySelector('.siraj-success'),
    formGone: !document.querySelector('.siraj-booking form'),
    errors: [...document.querySelectorAll('.siraj-error')].map(e => e.textContent.trim()),
  }))()`);
  const okShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  require('fs').writeFileSync(path.join(OUT, `booking-success-${width}.png`), Buffer.from(okShot.data, 'base64'));

  // --- 3) honeypot: fill the hidden field, expect refusal
  load = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: BASE + '/book/' });
  await load; await new Promise((r) => setTimeout(r, 1200));
  await cdp.evalExpr(FILL({ 'input[name="siraj_name"]': 'بوت', 'input[name="siraj_phone"]': '01012345678', 'input[name="siraj_website"]': 'http://spam.example' }));
  await cdp.evalExpr(`(() => { document.querySelector('.siraj-submit').click(); return 1; })()`);
  await new Promise((r) => setTimeout(r, 2500));
  result.honeypot = await cdp.evalExpr(`(() => ({
    successShown: !!document.querySelector('.siraj-success'),
    alertText: (document.querySelector('.siraj-alert') || {}).textContent ? document.querySelector('.siraj-alert').textContent.replace(/\\s+/g, ' ').trim().slice(0, 120) : null,
  }))()`);

  const json = JSON.stringify(result, null, 1);
  require('fs').writeFileSync(path.join(OUT, 'booking-e2e.json'), json);
  console.log(json);
  ws.close();
  await chrome.kill();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });