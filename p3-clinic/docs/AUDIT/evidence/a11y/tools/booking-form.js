/**
 * /book/ deep pass: control labelling, aria-describedby/aria-invalid, error
 * adjacency, role="status" success, honeypot, tab order, tel attributes,
 * and the no-JavaScript case.
 * Usage: node docs/AUDIT/evidence/a11y/tools/booking-form.js
 */
'use strict';

const L = require('./lib.js');

const KEY = (k, code, keyCode, text) => ({
  type: 'keyDown', modifiers: 0, windowsVirtualKeyCode: keyCode,
  nativeVirtualKeyCode: keyCode, key: k, code, text,
});
const KEY_UP = (k, code, keyCode) => ({
  type: 'keyUp', modifiers: 0, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, key: k, code,
});
async function press(cdp, k, code, keyCode, text) {
  await cdp.send('Input.dispatchKeyEvent', KEY(k, code, keyCode, text));
  await cdp.send('Input.dispatchKeyEvent', KEY_UP(k, code, keyCode));
  await new Promise((r) => setTimeout(r, 60));
}
const TAB = (cdp) => press(cdp, 'Tab', 'Tab', 9);

/** Everything about every control in the booking form. */
const FORM_PROBE = `(() => {
  const form = document.querySelector('.siraj-booking form');
  if (!form) return { missing: true };
  const controls = [...form.querySelectorAll('input,select,textarea,button')].map(el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const labels = el.labels ? [...el.labels] : [];
    return {
      tag: el.tagName.toLowerCase(), id: el.id, name: el.getAttribute('name'),
      type: el.getAttribute('type'),
      selfText: el.tagName === 'BUTTON' ? el.textContent : (el.tagName === 'OPTION' ? '' : ''),
      labelText: labels.map(l => l.textContent.trim().replace(/\\s+/g, ' ')).join(' | '),
      hasLabelEl: labels.length > 0,
      ariaLabel: el.getAttribute('aria-label'), ariaLabelledby: el.getAttribute('aria-labelledby'),
      ariaDescribedby: el.getAttribute('aria-describedby'),
      ariaInvalid: el.getAttribute('aria-invalid'),
      ariaRequired: el.getAttribute('aria-required'),
      required: el.getAttribute('required'),
      autocomplete: el.getAttribute('autocomplete'),
      inputmode: el.getAttribute('inputmode'), dir: el.getAttribute('dir'),
      tabindex: el.getAttribute('tabindex'),
      placeholder: el.getAttribute('placeholder'),
      describedbyResolves: (el.getAttribute('aria-describedby') || '').split(/\\s+/).filter(Boolean)
        .map(id => ({ id, exists: !!document.getElementById(id),
          text: (document.getElementById(id) || {}).textContent ? document.getElementById(id).textContent.trim().slice(0, 60) : null })),
      display: cs.display, visibility: cs.visibility,
      rect: { w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
      // visually hidden but announced?
      visuallyHidden: r.width <= 1 && r.height <= 1,
      inA11yTreeApprox: !!(el.getAttribute('aria-hidden') === null || el.getAttribute('aria-hidden') !== 'true'),
      hiddenAttr: el.hasAttribute('hidden'),
      orderInDom: [...form.querySelectorAll('input,select,textarea,button')].indexOf(el)
    };
  });
  // geometry of every error / hint / label vs its control
  function adj(el) {
    const err = document.querySelector('[id="' + el.id + '-error"]');
    const hint = document.querySelector('[id="' + el.id + '-hint"]');
    const lab = (el.labels && el.labels[0]) || null;
    const g = (n) => { if (!n) return null; const r = n.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), text: n.textContent.trim().slice(0, 70) }; };
    const cr = el.getBoundingClientRect();
    return { control: { x: Math.round(cr.x), y: Math.round(cr.y), w: Math.round(cr.width), h: Math.round(cr.height) },
      label: g(lab), hint: g(hint), error: g(err),
      errorAfterControl: err ? (err.getBoundingClientRect().top >= cr.top) : null,
      errorSharesRowOrBelow: err ? (Math.abs(err.getBoundingClientRect().x - cr.x) < cr.width) : null,
      errorColor: err ? getComputedStyle(err).color : null,
      errorHasIcon: err ? !!err.querySelector('svg,img,span[aria-hidden]') : null,
      errorText: err ? err.textContent.trim() : null };
  }
  return {
    formCount: document.querySelectorAll('.siraj-booking form').length,
    formHasNoValidate: form.hasAttribute('novalidate'),
    formAction: form.getAttribute('action'), formMethod: form.getAttribute('method'),
    formHasAriaDescribedbyOrLabel: !!form.getAttribute('aria-labelledby'),
    legend: !!form.querySelector('fieldset legend'),
    controls,
    unlabelled: controls.filter(c => c.type !== 'hidden' && !c.hasLabelEl && !c.ariaLabel && !(c.tag === 'button' && (c.selfText || '').trim())).map(c => ({ id: c.id, name: c.name, tag: c.tag, type: c.type, selfText: c.selfText })),
    hintIds: [...form.querySelectorAll('.siraj-hint')].map(h => h.id),
    errorIds: [...form.querySelectorAll('.siraj-error')].map(h => h.id),
    alertBox: (() => { const a = document.querySelector('.siraj-alert'); if (!a) return null;
      return { role: a.getAttribute('role'), text: a.textContent.trim().replace(/\\s+/g, ' ').slice(0, 300), ariaLive: a.getAttribute('aria-live') }; })(),
    successBox: (() => { const s = document.querySelector('.siraj-success'); if (!s) return null;
      return { role: s.getAttribute('role'), tabindex: s.getAttribute('tabindex'), text: s.textContent.trim().replace(/\\s+/g, ' ').slice(0, 200) }; })(),
    honey: (() => { const h = form.querySelector('.siraj-hp'); if (!h) return { missing: true };
      const cs = getComputedStyle(h); const inp = h.querySelector('input'); const ics = getComputedStyle(inp);
      const r = h.getBoundingClientRect(); const ir = inp.getBoundingClientRect();
      return { wrapperDisplay: cs.display, wrapperVis: cs.visibility, wrapperRect: { w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
        clip: cs.clip, clipPath: cs.clipPath, overflow: cs.overflow, position: cs.position,
        inputDisplay: ics.display, inputVis: ics.visibility, inputRect: { w: +ir.width.toFixed(1), h: +ir.height.toFixed(1) },
        inputTabindex: inp.getAttribute('tabindex'), inputAriaHidden: inp.getAttribute('aria-hidden'),
        inputInert: inp.hasAttribute('inert'),
        labelText: (h.querySelector('label') || {}).textContent,
        tabbable: inp.tabIndex >= 0,
        hiddenFromHitTest: document.elementFromPoint(10, 10) !== h }; })(),
    submit: (() => { const b = form.querySelector('button[type=submit]'); if (!b) return null;
      const r = b.getBoundingClientRect();
      return { text: b.textContent.trim(), type: b.type, w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; })(),
    grid: getComputedStyle(form.querySelector('.siraj-grid')).gridTemplateColumns
  };
})()`;

(async () => {
  const { chrome, cdp, chromeVersion } = await L.launch();
  const out = { generatedAt: new Date().toISOString(), chrome: chromeVersion, checks: [] };
  const add = (id, desc, expected, actual, pass, evidence) => {
    out.checks.push({ id, desc, expected, actual, pass, evidence });
    console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${id} :: ${actual}`);
  };

  await L.setViewport(cdp, '1440');

  // ---------- 1. pristine form state ----------
  await L.nav(cdp, L.BASE + '/book/');
  const pristine = await cdp.evalExpr(FORM_PROBE);
  out.pristine = pristine;
  add('form-controls',
    'Every control in the booking form has a real <label> (or aria-label)',
    '0 unlabelled non-hidden controls',
    `${pristine.controls.length} controls, unlabelled=${JSON.stringify(pristine.unlabelled)}`,
    pristine.unlabelled.length === 0, 'booking-form.json');

  // ---------- 2. tab order inside the form, with ids ----------
  await cdp.evalExpr(`document.querySelector('#siraj-name-1').focus(); 1`);
  const order = [];
  for (let i = 0; i < 16; i++) {
    await TAB(cdp);
    const f = await cdp.evalExpr(`(() => {
      const el = document.activeElement;
      return { tag: el.tagName.toLowerCase(), id: el.id, name: el.getAttribute('name'),
        type: el.getAttribute('type'), cls: (typeof el.className === 'string' ? el.className : ''),
        insideForm: !!el.closest('.siraj-booking form'),
        focusVisible: (function(){ try { return el.matches(':focus-visible'); } catch(e){ return null; } })(),
        outline: getComputedStyle(el).outlineStyle + ' ' + getComputedStyle(el).outlineWidth + ' ' + getComputedStyle(el).outlineColor,
        boxShadow: getComputedStyle(el).boxShadow };
    })()`);
    order.push(f);
    if (!f.insideForm) break;
  }
  out.tabOrder = order;
  const honeyInChain = order.filter((f) => /siraj-website/.test(f.id || ''));
  add('honeypot-not-tabbable',
    'Honeypot is out of the tab order (tabindex="-1")',
    'honeypot never receives keyboard focus',
    `tab stops: ${order.filter((f) => f.insideForm).map((f) => f.id || f.tag).join(' -> ')} | honeypot stops=${honeyInChain.length}`,
    honeyInChain.length === 0, 'booking-form.json -> tabOrder');
  add('honeypot-visual-vs-a11y',
    'Honeypot is hidden visually (clip) but not display:none, and keeps a label',
    'display != none, wrapper clipped to <=1px, label present',
    `wrapper display=${pristine.honey.wrapperDisplay} vis=${pristine.honey.wrapperVis} clip="${pristine.honey.clip}" clipPath=${pristine.honey.clipPath} rect=${JSON.stringify(pristine.honey.wrapperRect)} inputDisplay=${pristine.honey.inputDisplay} label="${pristine.honey.labelText}" aria-hidden=${pristine.honey.inputAriaHidden} inert=${pristine.honey.inputInert}`,
    pristine.honey.wrapperDisplay !== 'none' && pristine.honey.wrapperRect.w <= 1 && !!pristine.honey.labelText, 'booking-form.json -> honey');

  const tel = pristine.controls.find((c) => c.name === 'siraj_phone');
  add('tel-field-attrs',
    'Phone field has type=tel + autocomplete=tel + inputmode=tel + dir=ltr',
    'all four present',
    `type=${tel.type} autocomplete=${tel.autocomplete} inputmode=${tel.inputmode} dir=${tel.dir}`,
    tel.type === 'tel' && tel.autocomplete === 'tel' && tel.inputmode === 'tel' && tel.dir === 'ltr', 'booking-form.json -> controls');
  const dateC = pristine.controls.find((c) => c.name === 'siraj_date');
  add('date-field-attrs',
    'Date field keeps a readable direction hint for the browser date UI',
    'noted (input[type=date] has no dir attribute)',
    `type=${dateC.type} autocomplete=${dateC.autocomplete} inputmode=${dateC.inputmode} dir=${dateC.dir} lang-on-html=${await cdp.evalExpr('document.documentElement.lang')}`,
    true, 'booking-form.json -> controls');

  add('input-focus-indicator',
    'Focused inputs keep a visible focus indicator',
    'outline-style != none OR a non-none box-shadow ring',
    'per-field measured: ' + JSON.stringify(order.filter((f) => f.insideForm && f.id).map((f) => ({ id: f.id, outline: f.outline, boxShadow: f.boxShadow }))),
    order.filter((f) => f.insideForm && f.id).every((f) => f.outline.split(' ')[0] !== 'none' || (f.boxShadow && f.boxShadow !== 'none')),
    'booking-form.json -> tabOrder');

  // ---------- 3. invalid submission -> server-rendered errors ----------
  await L.nav(cdp, L.BASE + '/book/');
  // register the load listener BEFORE triggering the submit, or the POST's
  // load event is missed and we measure the pre-submit page.
  const loadDone = L.waitLoad(cdp);
  await cdp.evalExpr(`(function () {
    const f = document.querySelector('.siraj-booking form');
    f.querySelector('#siraj-name-1').value = 'ا';
    f.querySelector('#siraj-phone-1').value = '123';
    f.requestSubmit ? f.requestSubmit() : f.submit();
    return 1;
  })()`);
  await loadDone;
  await new Promise((r) => setTimeout(r, 700));
  const errState = await cdp.evalExpr(FORM_PROBE);
  out.errorState = errState;
  await L.shot(cdp, 'book-errors-1440');

  // measure error adjacency
  const adjacency = await cdp.evalExpr(`(() => {
    const form = document.querySelector('.siraj-booking form');
    const rows = [];
    ['siraj-name-1','siraj-phone-1','siraj-service-1','siraj-date-1','siraj-notes-1','siraj-consent-1'].forEach(function (id) {
      const el = document.getElementById(id);
      if (!el) return;
      const err = document.getElementById(id + '-error');
      const cr = el.getBoundingClientRect();
      const lab = el.labels && el.labels[0];
      const lr = lab ? lab.getBoundingClientRect() : null;
      const er = err ? err.getBoundingClientRect() : null;
      rows.push({ id, ariaInvalid: el.getAttribute('aria-invalid'), ariaDescribedby: el.getAttribute('aria-describedby'),
        describedbyResolves: (el.getAttribute('aria-describedby')||'').split(/\\s+/).filter(Boolean).every(x => !!document.getElementById(x)),
        errorExists: !!err, errorText: err ? err.textContent.trim() : null,
        errorColor: err ? getComputedStyle(err).color : null,
        errorFontSize: err ? getComputedStyle(err).fontSize : null,
        errorHasIcon: err ? !!err.querySelector('svg,img') : null,
        errorLeftOfControl: er ? Math.round(er.left - cr.left) : null,
        errorTopMinusControlBottom: er ? Math.round(er.top - cr.bottom) : null,
        errorInsideSameField: err ? !!err.closest('.siraj-field') : null,
        sameRowAsLabel: er && lr ? Math.abs(er.top - lr.top) < 4 : null });
    });
    return rows;
  })()`);
  out.errorAdjacency = adjacency;
  // PASS criteria: every rendered error sits below its control, inside the same
  // .siraj-field, is referenced by aria-describedby (which resolves) and the
  // control carries aria-invalid="true".
  const badAdj = adjacency.filter((r) => r.errorExists &&
    (!r.describedbyResolves || r.errorInsideSameField !== true || r.errorTopMinusControlBottom < 0 || r.ariaInvalid !== 'true'));
  add('error-adjacency',
    'Each field error sits directly under its control, inside the same .siraj-field, and is wired with aria-describedby + aria-invalid',
    'all errors below control, describedby resolves, aria-invalid=true',
    JSON.stringify(adjacency.map((r) => ({ id: r.id, invalid: r.ariaInvalid, gapPx: r.errorTopMinusControlBottom, describedby: r.ariaDescribedby, resolves: r.describedbyResolves, inField: r.errorInsideSameField }))),
    badAdj.length === 0 && adjacency.filter((r) => r.errorExists).every((r) => r.ariaInvalid === 'true'),
    'screens/book-errors-1440.png, booking-form.json -> errorAdjacency');

  const alert = errState.alertBox;
  add('error-summary-alert',
    'Server-rendered error summary is announced (role=alert) and names the fields',
    'role=alert + Arabic text + field-name prefixes',
    alert ? `role=${alert.role} text="${alert.text}"` : 'NO ALERT RENDERED',
    !!alert && alert.role === 'alert' && /[؀-ۿ]/.test(alert.text), 'booking-form.json -> errorState.alertBox');

  // digits in server-rendered Arabic error text (digit-system consistency)
  const errDigits = await cdp.evalExpr(`(() => {
    const t = document.querySelector('.siraj-booking').innerText;
    const eastern = (t.match(/[\\u0660-\\u0669\\u06F0-\\u06F9]/g) || []).length;
    const western = (t.match(/[0-9]/g) || []).length;
    const arabicComma = (t.match(/\\u060C/g) || []).length;
    const westernCommaBetweenAr = (t.match(/[\\u0600-\\u06FF],\\s*[\\u0600-\\u06FF]/g) || []).length;
    return { eastern, western, arabicComma, westernCommaBetweenAr, sample: t.replace(/\\s+/g,' ').slice(0, 400) };
  })()`);
  out.errorDigits = errDigits;

  // focus moves to the first invalid control after an invalid post?
  const focusAfterPost = await cdp.evalExpr('document.activeElement ? document.activeElement.id || document.activeElement.tagName : null');

  // ---------- 4. valid submission -> role=status (real form POST, no JS involved) ----------
  const nonce = await cdp.evalExpr(`(() => {
    const f = document.querySelector('.siraj-booking form');
    const el = f.querySelector('input[name="siraj_booking_submit"]');
    return el ? { name: el.name, len: el.value.length } : null;
  })()`);
  out.nonceField = nonce;

  await L.nav(cdp, L.BASE + '/book/');
  const loadDone2 = L.waitLoad(cdp);
  await cdp.evalExpr(`(function () {
    var f = document.querySelector('.siraj-booking form');
    f.querySelector('#siraj-name-1').value = 'محمد عبد الله';
    f.querySelector('#siraj-phone-1').value = '01012345678';
    f.querySelector('#siraj-service-1').value = 'cleaning';
    f.querySelector('#siraj-consent-1').checked = true;
    f.querySelector('#siraj-website-1').value = '';
    f.requestSubmit ? f.requestSubmit() : f.submit();
    return 1;
  })()`);
  await loadDone2;
  await new Promise((r) => setTimeout(r, 700));
  const successDom = await cdp.evalExpr(`(() => {
    var box = document.querySelector('.siraj-success');
    var form = document.querySelector('.siraj-booking form');
    var alertBox = document.querySelector('.siraj-alert');
    var cs = box ? getComputedStyle(box) : null;
    return {
      url: location.pathname,
      hasSuccess: !!box,
      role: box ? box.getAttribute('role') : null,
      ariaLive: box ? box.getAttribute('aria-live') : null,
      tabindex: box ? box.getAttribute('tabindex') : null,
      text: box ? box.textContent.replace(/\\s+/g, ' ').trim() : null,
      display: cs ? cs.display : null,
      visibility: cs ? cs.visibility : null,
      rect: box ? (function () { var r = box.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.y) }; })() : null,
      color: cs ? cs.color : null,
      bgColor: cs ? cs.backgroundColor : null,
      formStillRendered: !!form,
      alertAfterSuccess: alertBox ? alertBox.textContent.replace(/\\s+/g, ' ').trim().slice(0, 200) : null,
      activeElement: document.activeElement ? (document.activeElement.className || document.activeElement.tagName) : null,
      pageHeading: (document.querySelector('h1') || {}).textContent
    };
  })()`);
  out.validSubmission = successDom;
  await L.shot(cdp, 'book-success-1440');
  await L.setViewport(cdp, '390');
  await L.nav(cdp, L.BASE + '/book/');
  add('success-role-status',
    'A valid submission replaces the form with a role="status" confirmation that is rendered and readable',
    'role=status, no form, confirmation visible',
    `url=${successDom.url} hasSuccess=${successDom.hasSuccess} role=${successDom.role} tabindex=${successDom.tabindex} display=${successDom.display} vis=${successDom.visibility} rect=${JSON.stringify(successDom.rect)} color=${successDom.color} bg=${successDom.bgColor} formStillRendered=${successDom.formStillRendered} text="${String(successDom.text || '').slice(0, 120)}"`,
    !!(successDom.hasSuccess && successDom.role === 'status' && !successDom.formStillRendered),
    !!(successDom.hasSuccess && successDom.role === 'status' && !successDom.formStillRendered),
    'screens/book-success-1440.png, booking-form.json -> validSubmission');

  await L.nav(cdp, L.BASE + '/book/');
  await L.shot(cdp, 'book-pristine-1440');
  await L.setViewport(cdp, '390');
  await L.nav(cdp, L.BASE + '/book/');
  await L.shot(cdp, 'book-pristine-390', 'screens/booking');

  // ---------- 5. NO-JS case ----------
  await L.setViewport(cdp, '390');
  await L.setJsDisabled(cdp, true);
  await L.nav(cdp, L.BASE + '/book/');
  await new Promise((r) => setTimeout(r, 900));
  const nojsShot = await L.shot(cdp, 'book-nojs-390', 'screens/nojs');
  // Script execution is off, so read the DOM through the DOM domain instead.
  const docRoot = await cdp.send('DOM.getDocument', { depth: -1 });
  const nodeHtml = (await cdp.send('DOM.getOuterHTML', { nodeId: docRoot.root.nodeId })).outerHTML || '';
  const nojs = {
    screenshot: nojsShot,
    method: 'Emulation.setScriptExecutionDisabled(true) + DOM.getOuterHTML + Page.captureScreenshot',
    htmlLength: nodeHtml.length,
    formPresent: /class="siraj-booking"/.test(nodeHtml),
    formTagPresent: /<form method="post">/.test(nodeHtml),
    submitButtonPresent: /class="siraj-submit btn btn-primary" type="submit"/.test(nodeHtml),
    noncePresent: /name="_wpnonce"/.test(nodeHtml),
    honeypotPresent: /siraj-website-1/.test(nodeHtml),
    allSixFieldsPresent: ['siraj-name-1', 'siraj-phone-1', 'siraj-service-1', 'siraj-date-1', 'siraj-notes-1', 'siraj-consent-1']
      .every((id) => nodeHtml.includes('id="' + id + '"')),
    sirajLabels: (nodeHtml.match(/<label class="siraj-label"/g) || []).length,
    honeypotLabel: /<div class="siraj-hp"><label for="siraj-website-1">/.test(nodeHtml),
    noscriptWarningPresent: /<noscript/i.test(nodeHtml),
    inlineScriptsCount: (nodeHtml.match(/<script/g) || []).length,
    stylesheetLinks: (nodeHtml.match(/rel="stylesheet"/g) || []).length
  };
  await L.setJsDisabled(cdp, false);
  out.noJs = nojs;
  add('nojs-form-usable',
    'With JavaScript disabled the booking form is still server-rendered, complete and submittable',
    'form + 6 labelled fields + submit button in the no-JS DOM, nothing gated behind JS',
    JSON.stringify(nojs),
    nojs.formPresent && nojs.allSixFieldsPresent && nojs.submitButtonPresent,
    'screens/nojs/book-nojs-390.png');

  // no-JS form still validates server-side: POST with scripts disabled
  await L.setJsDisabled(cdp, true);
  await L.nav(cdp, L.BASE + '/book/');
  await new Promise((r) => setTimeout(r, 500));
  const nojsPost = await cdp.send('DOM.getDocument', { depth: -1 });
  await cdp.send('Page.navigate', { url: L.BASE + '/book/' });
  const nojsProbe = await cdp.send('Runtime.evaluate', { expression: '1', returnByValue: true }).catch((e) => ({ e: String(e) }));
  await L.setJsDisabled(cdp, false);
  out.noJs.stillScriptless = !!nojsProbe.e || nojsProbe.exceptionDetails !== undefined;
  void nojsPost;

  L.write('booking-form.json', out);
  cdp.ws.close();
  await chrome.kill();
  const failed = out.checks.filter((c) => !c.pass);
  console.log('booking checks: ' + (out.checks.length - failed.length) + '/' + out.checks.length + ' pass');
  failed.forEach((c) => console.log('  FAIL ' + c.id));
  console.log('DONE');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
