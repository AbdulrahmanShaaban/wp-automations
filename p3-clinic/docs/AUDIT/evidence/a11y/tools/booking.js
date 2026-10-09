#!/usr/bin/env node
/**
 * Booking form (/book/) evidence pass — P3 clinic (2026-10-07).
 *
 * Static: labels/aria/honeypot/tel attributes/tab order/no-reverse-tab.
 * Dynamic: empty submit -> server errors (adjacency, aria-invalid,
 *          aria-describedby, role=alert, value retention, digit system);
 *          honeypot filled -> rejected; valid submit -> role=status success.
 * No-JS:   form visible + native submit still validates server-side.
 *
 * Writes: booking-static.json, booking-invalid.json, booking-honeypot.json,
 *         booking-success.json, booking-nojs.json, screens/booking-*.png
 * Usage: node docs/AUDIT/evidence/a11y/tools/booking.js
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
const LOG = path.join(__dirname, 'booking.log');
fs.writeFileSync(LOG, `booking.js start ${new Date().toISOString()}\n`);
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
  async shot(name) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SCREENS, name), Buffer.from(data, 'base64'));
    log('  shot ' + name);
  }
  /**
   * Trigger a form POST from inside the page and wait until the resulting
   * document is fully parsed (document.body must exist — evaluating too early
   * throws "Cannot read properties of null"). Registers the load listener
   * BEFORE the click so the event can't be missed.
   */
  async submitAndWait(clickExpr, { navTimeout = 9000, settle = 900 } = {}) {
    const loaded = this.once('Page.loadEventFired');
    await this.evalExpr(clickExpr);
    await Promise.race([loaded, new Promise((r) => setTimeout(r, navTimeout))]);
    const t0 = Date.now();
    for (;;) {
      try {
        const st = await this.evalExpr(`(document.readyState === 'complete' && !!document.body) ? 1 : 0`);
        if (st === 1) break;
      } catch (e) { /* document mid-swap, retry */ }
      if (Date.now() - t0 > 30000) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    await new Promise((r) => setTimeout(r, settle));
  }
}

/* static form state */
const STATIC = `(() => {
  const vis = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const controls = [...document.querySelectorAll('.siraj-booking input,.siraj-booking select,.siraj-booking textarea')].map((el) => {
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(), type: (el.type || '').toLowerCase(), id: el.id, name: el.name,
      label: (el.labels && el.labels[0] ? el.labels[0].textContent.trim() : null),
      ariaLabel: el.getAttribute('aria-label'),
      ariaRequired: el.getAttribute('aria-required'),
      ariaInvalid: el.getAttribute('aria-invalid'),
      describedby: el.getAttribute('aria-describedby'),
      autocomplete: el.getAttribute('autocomplete'),
      inputmode: el.getAttribute('inputmode'),
      dir: el.getAttribute('dir'),
      placeholder: el.getAttribute('placeholder'),
      tabindex: el.getAttribute('tabindex'),
      visible: vis(el),
      w: Math.round(r.width), h: Math.round(r.height),
      classVisible: getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden',
    };
  });
  const hp = document.querySelector('.siraj-hp');
  const hpInput = hp ? hp.querySelector('input') : null;
  const hpStyle = hp ? (() => { const cs = getComputedStyle(hp); const r = hp.getBoundingClientRect(); return {
    display: cs.display, visibility: cs.visibility, position: cs.position,
    width: cs.width, height: cs.height, overflow: cs.overflow, clip: cs.clip, clipPath: cs.clipPath,
    opacity: cs.opacity, rectW: Math.round(r.width), rectH: Math.round(r.height),
  }; })() : null;
  const hpInputStyle = hpInput ? (() => { const cs = getComputedStyle(hpInput); return {
    display: cs.display, visibility: cs.visibility, tabindex: hpInput.getAttribute('tabindex'),
    autocomplete: hpInput.getAttribute('autocomplete'), type: hpInput.type,
    label: (hpInput.labels && hpInput.labels[0] ? hpInput.labels[0].textContent.trim() : null),
    focusable: hpInput.matches(':focus') || hpInput.tabIndex >= 0,
  }; })() : null;
  const focusables = [...document.querySelectorAll('.siraj-booking a[href],.siraj-booking button,input:not([type=hidden]),select,textarea,summary')];
  return {
    controls,
    unlabelled: controls.filter(c => !c.label && !c.ariaLabel && c.type !== 'hidden').length,
    honeypot: { present: !!hp, wrapper: hpStyle, input: hpInputStyle,
      isDisplayNone: hpStyle ? hpStyle.display === 'none' : null },
    tel: controls.find(c => c.type === 'tel') || null,
    tabOrder: focusables.filter(vis).map(el => ({ tag: el.tagName.toLowerCase(), name: el.name || el.id, tabindex: el.getAttribute('tabindex') })),
    submitText: (document.querySelector('.siraj-submit') || {}).textContent,
    alertPresent: !!document.querySelector('[role="alert"]'),
    successPresent: !!document.querySelector('[role="status"]'),
    formMethod: (document.querySelector('.siraj-booking form') || {}).method,
    formAction: (document.querySelector('.siraj-booking form') || {}).action,
  };
})()`;

/* error state after invalid POST */
const ERRORS = `(() => {
  const vis = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const alert = document.querySelector('[role="alert"]');
  const fields = [...document.querySelectorAll('.siraj-field')].map((f) => {
    const ctl = f.querySelector('input,select,textarea');
    const err = f.querySelector('.siraj-error');
    const hint = f.querySelector('.siraj-hint');
    if (!ctl) return null;
    const db = (ctl.getAttribute('aria-describedby') || '').split(/\\s+/).filter(Boolean);
    const errIndex = err ? [...f.children].indexOf(err) : -1;
    const ctlIndex = [...f.children].indexOf(ctl);
    const prev = err ? err.previousElementSibling : null;
    // adjacent = error sits right after the control, its hint, its wrapping
    // div (consent field), or its label
    const adjacent = err ? (prev === ctl || prev === hint
      || !!(prev && prev.contains && prev.contains(ctl))
      || !!(prev && prev.tagName === 'LABEL' && prev.htmlFor === ctl.id)) : null;
    return {
      name: ctl.name, id: ctl.id,
      ariaInvalid: ctl.getAttribute('aria-invalid'),
      ariaRequired: ctl.getAttribute('aria-required'),
      describedby: db,
      describedbyResolves: db.every(id => !!document.getElementById(id)),
      errorPresent: !!err,
      errorId: err ? err.id : null,
      errorText: err ? err.textContent.trim() : null,
      errorAdjacent: adjacent,
      errorPrev: prev ? prev.tagName.toLowerCase() + (prev.id ? '#' + prev.id : '') + '.' + (prev.className || '').toString().slice(0, 40) : null,
      errorAfterControl: err ? errIndex > ctlIndex : null,
      errorVisible: err ? vis(err) : null,
      errorColor: err ? getComputedStyle(err).color : null,
      hintPresent: !!hint,
      valueRetained: ctl.type === 'checkbox' ? ctl.checked : (ctl.value || ''),
      easternDigits: err ? (err.textContent.match(/[\\u0660-\\u0669]/g) || []).length : 0,
      latinDigits: err ? (err.textContent.match(/[0-9]/g) || []).length : 0,
    };
  }).filter(Boolean);
  const text = document.body.innerText || '';
  return {
    alertPresent: !!alert,
    alertRole: alert ? alert.getAttribute('role') : null,
    alertText: alert ? alert.textContent.trim().replace(/\\s+/g, ' ').slice(0, 400) : null,
    alertItems: alert ? [...alert.querySelectorAll('li')].map(li => li.textContent.trim()) : [],
    fields,
    invalidCount: fields.filter(f => f.ariaInvalid === 'true').length,
    easternDigitsInPage: (text.match(/[\\u0660-\\u0669]/g) || []).length,
    latinDigitsInPage: (text.match(/[0-9]/g) || []).length,
    focusOn: document.activeElement ? document.activeElement.tagName.toLowerCase() + '#' + (document.activeElement.id || '') : null,
  };
})()`;

(async () => {
  log('== booking form pass ==');
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1'],
  });
  const targets = await (await fetch(`http://127.0.0.1:${chrome.port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  const cdp = new CDP(ws);
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable')]);

  const tests = { generatedAt: new Date().toISOString(), checks: [] };
  const check = (id, ok, detail) => { tests.checks.push({ id, ok: !!ok, detail }); log(`  ${ok ? 'PASS' : 'FAIL'} ${id} :: ${JSON.stringify(detail).slice(0, 280)}`); };

  /* ---------------------------------------------------------- static @1440 */
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.navigate(`${BASE}/book/`, 1600);
  const stat = await cdp.evalExpr(STATIC);
  write('booking-static.json', stat);
  check('all-controls-labelled', stat.unlabelled === 0, { unlabelled: stat.unlabelled, controls: stat.controls.map((c) => ({ name: c.name, label: c.label, aria: c.ariaLabel })) });
  check('honeypot-not-display-none', stat.honeypot.present && stat.honeypot.isDisplayNone === false, { wrapper: stat.honeypot.wrapper, input: stat.honeypot.input });
  check('honeypot-out-of-tab-order', stat.honeypot.input && (stat.honeypot.input.tabindex === '-1' || stat.honeypot.input.focusable === false), { input: stat.honeypot.input });
  check('honeypot-labelled', !!(stat.honeypot.input && stat.honeypot.input.label), { label: stat.honeypot.input && stat.honeypot.input.label });
  check('tel-field-attrs', !!(stat.tel && stat.tel.type === 'tel' && stat.tel.autocomplete === 'tel' && stat.tel.inputmode === 'tel' && stat.tel.dir === 'ltr'), stat.tel);
  check('no-placeholder-only-labels', stat.controls.every((c) => c.type === 'hidden' || (c.label && c.label.length > 0) || c.ariaLabel), stat.controls.map((c) => ({ name: c.name, label: c.label, ph: c.placeholder })));
  check('form-native-post', stat.formMethod === 'post', { method: stat.formMethod, action: stat.formAction });
  await cdp.shot('booking-1440-static.png');

  /* ------------------------------------------------- invalid submit (empty) */
  await cdp.submitAndWait(`(() => { document.querySelector('.siraj-submit').click(); return 1; })()`);
  const inval = await cdp.evalExpr(ERRORS);
  write('booking-invalid.json', inval);
  await cdp.shot('booking-1440-invalid.png');
  check('invalid-shows-alert', inval.alertPresent && inval.alertRole === 'alert', { role: inval.alertRole, items: inval.alertItems.length });
  check('invalid-aria-invalid-set', inval.invalidCount >= 4, { invalidCount: inval.invalidCount, total: inval.fields.length });
  check('invalid-describedby-resolves', inval.fields.filter((f) => f.ariaInvalid === 'true').every((f) => f.describedby.includes(f.errorId) && f.describedbyResolves),
    inval.fields.filter((f) => f.ariaInvalid === 'true').map((f) => ({ name: f.name, describedby: f.describedby, errorId: f.errorId, resolves: f.describedbyResolves })));
  check('errors-adjacent-to-control', inval.fields.filter((f) => f.errorPresent).every((f) => f.errorAdjacent && f.errorAfterControl),
    inval.fields.filter((f) => f.errorPresent).map((f) => ({ name: f.name, adjacent: f.errorAdjacent, after: f.errorAfterControl, visible: f.errorVisible })));
  check('errors-visible-not-color-only', inval.fields.filter((f) => f.errorPresent).every((f) => f.errorVisible && f.errorText && f.errorText.length > 3),
    inval.fields.filter((f) => f.errorPresent).map((f) => ({ name: f.name, text: f.errorText, color: f.errorColor })));
  check('errors-western-digits-only', inval.easternDigitsInPage === 0, { eastern: inval.easternDigitsInPage, latin: inval.latinDigitsInPage, fieldDigits: inval.fields.map((f) => ({ n: f.name, east: f.easternDigits, lat: f.latinDigits })) });

  // values retained after a filled-but-invalid POST (mobile rendering evidence).
  // date must be >= input[min] or Chrome's NATIVE validation blocks the POST
  // entirely (no navigation, no server errors) — use a future date so the POST
  // happens and the server rejects the short phone instead.
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp.navigate(`${BASE}/book/`, 1500);
  await cdp.evalExpr(`(() => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; } };
    set('siraj-name-1', 'أحمد محمد');
    set('siraj-phone-1', '123');  // invalid: too short -> server rejects
    const sel = document.getElementById('siraj-service-1'); if (sel) sel.selectedIndex = 1;
    const d = new Date(); d.setDate(d.getDate() + 7);
    set('siraj-date-1', d.toISOString().slice(0, 10)); // passes native min
    document.getElementById('siraj-consent-1').checked = true;
    return 1;
  })()`);
  await cdp.submitAndWait(`(() => { document.querySelector('.siraj-submit').click(); return 1; })()`);
  const retained = await cdp.evalExpr(`(() => ({
    name: (document.getElementById('siraj-name-1') || {}).value,
    phone: (document.getElementById('siraj-phone-1') || {}).value,
    date: (document.getElementById('siraj-date-1') || {}).value,
    alert: !!document.querySelector('[role="alert"]'),
    alertItems: [...document.querySelectorAll('[role="alert"] li')].map(li => li.textContent.trim()),
    invalidFields: [...document.querySelectorAll('[aria-invalid="true"]')].map(el => el.name),
  }))()`);
  write('booking-invalid-retained.json', retained);
  await cdp.shot('booking-390-invalid-values-retained.png');
  const expectedDate = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })();
  check('invalid-keeps-previous-values', retained.name === 'أحمد محمد' && retained.phone === '123' && retained.date === expectedDate,
    { ...retained, expectedDate });
  check('phone-error-shown', retained.alert && retained.invalidFields.includes('siraj_phone'), retained);

  /* ------------------------------------------------------ honeypot rejected */
  await cdp.navigate(`${BASE}/book/`, 1500);
  await cdp.evalExpr(`(() => {
    document.getElementById('siraj-name-1').value = 'بوت تجريبي';
    document.getElementById('siraj-phone-1').value = '01000000000';
    document.getElementById('siraj-website-1').value = 'http://spam.example';
    const sel = document.getElementById('siraj-service-1'); if (sel) sel.selectedIndex = 1;
    document.getElementById('siraj-date-1').value = '2027-01-05';
    document.getElementById('siraj-consent-1').checked = true;
    return 1;
  })()`);
  await cdp.submitAndWait(`(() => { document.querySelector('.siraj-submit').click(); return 1; })()`);
  const hp = await cdp.evalExpr(`(() => ({
    success: !!document.querySelector('[role="status"]'),
    alert: !!document.querySelector('[role="alert"]'),
    alertText: (document.querySelector('[role="alert"]') || {textContent:''}).textContent.trim().replace(/\\s+/g,' ').slice(0, 300),
    formStillThere: !!document.querySelector('.siraj-booking form'),
  }))()`);
  write('booking-honeypot.json', hp);
  check('honeypot-filled-rejected', !hp.success && hp.alert, hp);

  /* ------------------------------------------------------- valid submission */
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.navigate(`${BASE}/book/`, 1500);
  await cdp.evalExpr(`(() => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('siraj-name-1', 'سارة عبد الرحمن');
    set('siraj-phone-1', '01012345678');
    const sel = document.getElementById('siraj-service-1'); if (sel) sel.value = sel.options[1].value;
    const d = new Date(); d.setDate(d.getDate() + 7);
    set('siraj-date-1', d.toISOString().slice(0, 10));
    set('siraj-notes-1', 'أريد موعدًا صباحًا لو سمحت.');
    document.getElementById('siraj-consent-1').checked = true;
    return 1;
  })()`);
  await cdp.submitAndWait(`(() => { document.querySelector('.siraj-submit').click(); return 1; })()`);
  const succ = await cdp.evalExpr(`(() => {
    const s = document.querySelector('[role="status"]');
    return {
      successPresent: !!s,
      role: s ? s.getAttribute('role') : null,
      tabindex: s ? s.getAttribute('tabindex') : null,
      text: s ? s.textContent.trim().replace(/\\s+/g, ' ') : null,
      formGone: !document.querySelector('.siraj-booking form'),
      easternDigits: (document.body.innerText.match(/[\\u0660-\\u0669]/g) || []).length,
      latinDigits: (document.body.innerText.match(/[0-9]/g) || []).length,
      focusOn: document.activeElement ? document.activeElement.tagName.toLowerCase() + '.' + (document.activeElement.className || '') : null,
    };
  })()`);
  write('booking-success.json', succ);
  await cdp.shot('booking-1440-success.png');
  check('valid-submit-shows-status', succ.successPresent && succ.role === 'status', succ);
  check('success-replaces-form', succ.formGone === true, { formGone: succ.formGone, text: succ.text });

  /* ------------------------------------------------------------ no-JS case */
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp.send('Emulation.setScriptExecutionDisabled', { value: true });
  await cdp.navigate(`${BASE}/book/`, 1800);
  const nojs = await cdp.evalExpr(`(() => {
    const vis = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const controls = [...document.querySelectorAll('.siraj-booking input,.siraj-booking select,.siraj-booking textarea')];
    const labels = [...document.querySelectorAll('.siraj-booking label')];
    const submit = document.querySelector('.siraj-submit');
    const reveal = [...document.querySelectorAll('.reveal')];
    const hp = document.querySelector('.siraj-hp');
    return {
      scriptsDisabled: true,
      htmlHasJsMotion: document.documentElement.classList.contains('js-motion'),
      controlsTotal: controls.length,
      controlsUser: controls.filter(c => c.type !== 'hidden').length, // exclude hidden nonce/field inputs
      controlsUserVisible: controls.filter(c => c.type !== 'hidden').filter(vis).length,
      hiddenControls: controls.filter(c => c.type === 'hidden').length,
      controlsVisible: controls.filter(vis).length,
      labelsVisible: labels.filter(vis).length,
      submitPresent: !!submit,
      submitVisible: submit ? vis(submit) : false,
      submitText: submit ? submit.textContent.trim() : null,
      formPresent: !!document.querySelector('.siraj-booking form'),
      formAction: (document.querySelector('.siraj-booking form') || {}).action,
      formMethod: (document.querySelector('.siraj-booking form') || {}).method,
      honeypotDisplayNone: hp ? getComputedStyle(hp).display === 'none' : null,
      revealHidden: reveal.filter(el => parseFloat(getComputedStyle(el).opacity) < 0.99).length,
      revealTotal: reveal.length,
      bodyTextLen: document.body.innerText.length,
    };
  })()`);
  write('booking-nojs.json', nojs);
  await cdp.shot('booking-390-nojs.png');
  check('nojs-form-visible', nojs.formPresent && nojs.controlsUserVisible === nojs.controlsUser && nojs.submitVisible,
    { formPresent: nojs.formPresent, userControls: nojs.controlsUser, userVisible: nojs.controlsUserVisible, hiddenExcluded: nojs.hiddenControls, submitVisible: nojs.submitVisible, labelsVisible: nojs.labelsVisible });
  check('nojs-reveal-content-visible', nojs.revealHidden === 0, { revealTotal: nojs.revealTotal, hidden: nojs.revealHidden });

  // native POST with scripts disabled (no JS handlers on the form)
  await cdp.submitAndWait(`(() => { document.querySelector('.siraj-submit').click(); return 1; })()`);
  const nojsPost = await cdp.evalExpr(`(() => ({
    path: location.pathname,
    alert: !!document.querySelector('[role="alert"]'),
    alertText: (document.querySelector('[role="alert"]') || {textContent:''}).textContent.trim().replace(/\\s+/g,' ').slice(0, 300),
    invalidFields: document.querySelectorAll('[aria-invalid="true"]').length,
    formPresent: !!document.querySelector('.siraj-booking form'),
    htmlHasJsMotion: document.documentElement.classList.contains('js-motion'),
  }))()`);
  write('booking-nojs-post.json', nojsPost);
  await cdp.shot('booking-390-nojs-after-post.png');
  check('nojs-native-post-validates', nojsPost.alert && nojsPost.invalidFields > 0 && nojsPost.formPresent, nojsPost);

  await cdp.send('Emulation.setScriptExecutionDisabled', { value: false });
  write('booking-tests.json', tests);
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  ws.close();
  await chrome.kill();
  const failed = tests.checks.filter((c) => !c.ok).length;
  log(`done: ${tests.checks.length} checks, ${failed} failed`);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
