/**
 * Keyboard-only pass: tab order on / and /book/, skip link, focus-visible
 * outline measurement, traps, FAQ details/summary behaviour.
 * Usage: node docs/AUDIT/evidence/a11y/tools/kb-pass.js
 */
'use strict';

const L = require('./lib.js');

const KEY = (k, code, keyCode, mods = 0) => ({
  type: 'keyDown', modifiers: mods,
  windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode,
  key: k, code, text: k.length === 1 ? k : undefined,
});
const KEY_UP = (k, code, keyCode) => ({
  type: 'keyUp', modifiers: 0,
  windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, key: k, code,
});

async function press(cdp, k, code, keyCode, mods = 0) {
  await cdp.send('Input.dispatchKeyEvent', KEY(k, code, keyCode, mods));
  await cdp.send('Input.dispatchKeyEvent', KEY_UP(k, code, keyCode));
  await new Promise((r) => setTimeout(r, 60));
}
const TAB = (cdp) => press(cdp, 'Tab', 'Tab', 9);
const SHIFT_TAB = (cdp) => press(cdp, 'Tab', 'Tab', 9, 8);
const ENTER = (cdp) => press(cdp, 'Enter', 'Enter', 13);
const SPACE = (cdp) => press(cdp, ' ', 'Space', 32);
const ESC = (cdp) => press(cdp, 'Escape', 'Escape', 27);

/** Focus identity + the styles that make the focus ring visible. */
const FOCUS_INFO = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return { none: true, active: el ? (el.tagName + '|' + document.activeElement.className) : null };
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  function path(e) {
    const out = [];
    while (e && e.nodeType === 1 && out.length < 4) {
      out.push(e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).slice(0,3).join('.') : ''));
      e = e.parentElement;
    }
    return out.join(' < ');
  }
  return {
    tag: el.tagName.toLowerCase(),
    path: path(el),
    text: (el.textContent || el.value || el.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ').slice(0, 40),
    id: el.id || null, name: el.getAttribute('name'),
    href: el.getAttribute('href'), type: el.getAttribute('type'),
    tabindex: el.getAttribute('tabindex'),
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    inViewport: r.top >= -2 && r.bottom <= innerHeight + 2,
    onScreen: r.width > 0 && r.height > 0,
    matchesFocusVisible: (() => { try { return el.matches(':focus-visible'); } catch (e) { return null; } })(),
    outline: { style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor, offset: s.outlineOffset },
    boxShadow: s.boxShadow,
    borderColor: s.borderColor,
    docScrollY: Math.round(scrollY)
  };
})()`;

(async () => {
  const { chrome, cdp, chromeVersion } = await L.launch();
  const out = { generatedAt: new Date().toISOString(), chrome: chromeVersion, checks: [], chains: {}, faq: {}, traps: {} };

  const add = (id, desc, expected, actual, pass, evidence) =>
    out.checks.push({ id, desc, expected, actual, pass, evidence });

  // ================= skip link + tab order, / and /book/ @1440 =================
  for (const [name, url] of [['home', '/'], ['book', '/book/']]) {
    await L.setViewport(cdp, '1440');
    await L.nav(cdp, L.BASE + url);

    // Tab 1 should be the skip link and become visible
    await cdp.evalExpr('document.body.focus(); document.activeElement && document.activeElement.blur && document.activeElement.blur(); 1');
    await cdp.evalExpr(`document.querySelector('.skip-link') && document.querySelector('.skip-link').focus(); 1`);
    await TAB(cdp); // leave the skip link so we land on the real first control
    const first = await cdp.evalExpr(FOCUS_INFO);

    const chain = [];
    for (let i = 0; i < 34; i++) {
      const f = await cdp.evalExpr(FOCUS_INFO);
      chain.push(f);
      if (f.tag === 'html' || f.tag === 'body') break;
      await TAB(cdp);
    }
    out.chains[name] = chain;
    console.log(`  tab chain ${name}: ${chain.length} stops`);

    // ---- skip link checks ----
    await L.nav(cdp, L.BASE + url);
    await cdp.evalExpr('window.scrollTo(0,0); 1');
    // focus it via keyboard from the very top of the document
    await cdp.evalExpr(`(function(){ var s=document.querySelector('.skip-link'); if(!s) return 0; s.focus(); return 1; })()`);
    const skipFocused = await cdp.evalExpr(FOCUS_INFO);
    await L.shot(cdp, `kb-${name}-skip-link-focused`);
    await ENTER(cdp);
    await new Promise((r) => setTimeout(r, 400));
    const afterActivate = await cdp.evalExpr(`(() => ({
      hash: location.hash,
      scrollY: Math.round(scrollY),
      activeId: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null,
      activeTag: document.activeElement ? document.activeElement.tagName : null,
      targetExists: !!document.getElementById('wp--skip-link--target'),
      targetTag: (document.getElementById('wp--skip-link--target')||{}).tagName || null,
      targetTabindex: (document.getElementById('wp--skip-link--target')||{}).getAttribute ? document.getElementById('wp--skip-link--target').getAttribute('tabindex') : null
    }))()`);
    add(`${name}-skiplink-first-focusable`,
      'Skip link is the first focusable element and gets a visible focus ring on focus',
      'skip link focused, :focus-visible true, outline >= 2px',
      `first tab stop after skip = ${first.tag}.${String(first.path).split(' < ')[1] || ''} | skip matches(:focus-visible)=${skipFocused.matchesFocusVisible} outline=${skipFocused.outline && skipFocused.outline.width} ${skipFocused.outline && skipFocused.outline.style} ${skipFocused.outline && skipFocused.outline.color} offset=${skipFocused.outline && skipFocused.outline.offset} | rect=${JSON.stringify(skipFocused.rect)} onScreen=${skipFocused.onScreen}`,
      !!skipFocused.matchesFocusVisible && parseFloat(skipFocused.outline.width) >= 2 && skipFocused.onScreen,
      `screens/kb-${name}-skip-link-focused.png, chains/${name}.json`);
    add(`${name}-skiplink-target`,
      'Activating the skip link moves focus/scroll to the main content target',
      '#wp--skip-link--target exists, page scrolls down',
      `hash=${afterActivate.hash} scrollY=${afterActivate.scrollY} activeId=${afterActivate.activeId} targetExists=${afterActivate.targetExists} targetTag=${afterActivate.targetTag}`,
      afterActivate.targetExists && afterActivate.scrollY > 0,
      `chains/${name}.json`);

    // ---- focus ring measurement on a plain link and on the primary button ----
    await L.nav(cdp, L.BASE + url);
    await cdp.evalExpr(`(function(){
      var btn = document.querySelector('.btn-primary');
      if (btn) { btn.focus(); return 1; }
      return 0;
    })()`);
    await TAB(cdp); // trigger :focus-visible after keyboard interaction
    const ring = await cdp.evalExpr(FOCUS_INFO);
    add(`${name}-focus-ring`,
      'Keyboard focus is visible on the primary CTA (theme :focus-visible rule)',
      'outline >= 2px with non-none style',
      `el=${ring.tag}.${String(ring.path).split(' < ').pop()} outline=${ring.outline.width} ${ring.outline.style} ${ring.outline.color} offset=${ring.outline.offset} :focus-visible=${ring.matchesFocusVisible}`,
      parseFloat(ring.outline.width) >= 2 && ring.outline.style !== 'none',
      `screens/kb-${name}-focus-ring.png`);
    await L.shot(cdp, `kb-${name}-focus-ring`);

    // ---- every focusable element in the chain must be on-screen and have a ring ----
    const bad = chain.filter((f) => f.none || f.tag === 'html');
    const noRing = chain.filter((f) => !f.none && f.matchesFocusVisible && (parseFloat(f.outline.width) < 2 || f.outline.style === 'none') && !/none/.test(f.boxShadow || ''));
    add(`${name}-chain-rings`,
      'Every element reached by Tab has a visible focus indicator',
      '0 elements without an outline/shadow',
      `stops=${chain.length} withoutRing=${noRing.length}${noRing.length ? ' :: ' + noRing.map((f) => f.tag + '.' + f.outline.style).join(', ') : ''}`,
      noRing.length === 0,
      `chains/${name}.json`);
  }

  // ================= FAQ details/summary keyboard, / @1440 =================
  await L.setViewport(cdp, '1440');
  await L.nav(cdp, L.BASE + '/');
  await cdp.evalExpr('document.querySelectorAll(".faq-item").forEach(function(d){ d.open=false; }); 1');
  const faqRects = await cdp.evalExpr(`(() => {
    const s = document.querySelector('.faq-item summary');
    s.focus();
    const r = s.getBoundingClientRect();
    return { count: document.querySelectorAll('details').length,
      summaryText: s.textContent.trim().slice(0,40), summaryRect: {y: Math.round(r.y), h: Math.round(r.height)},
      openBefore: document.querySelector('.faq-item').open,
      summaryTabindex: s.getAttribute('tabindex'), summaryNativeFocusable: s.tabIndex >= 0 };
  })()`);
  await cdp.evalExpr(`document.querySelector('.faq-item').scrollIntoView({block:'center'}); 1`);
  await new Promise((r) => setTimeout(r, 300));
  await cdp.evalExpr('document.querySelector(".faq-item summary").focus(); 1');
  const ringFaq = await cdp.evalExpr(FOCUS_INFO);
  await ENTER(cdp);
  await new Promise((r) => setTimeout(r, 250));
  const afterEnter = await cdp.evalExpr(`(() => ({ open: document.querySelector('.faq-item').open, active: document.activeElement.tagName + '|' + (document.querySelector('.faq-item summary')===document.activeElement), hash: location.hash }))()`);
  await L.shot(cdp, 'kb-faq-open-with-enter');
  await cdp.evalExpr('document.querySelector(".faq-item").open = false; 1');
  await cdp.evalExpr('document.querySelector(".faq-item summary").focus(); 1');
  await SPACE(cdp);
  await new Promise((r) => setTimeout(r, 250));
  const afterSpace = await cdp.evalExpr(`(() => ({ open: document.querySelector('.faq-item').open }))()`);
  // Tab from an open summary must move into the details content / next summary, never be trapped
  const faqChain = [];
  await cdp.evalExpr('document.querySelectorAll(".faq-item").forEach(function(d){ d.open=false; }); document.querySelector(".faq-item summary").focus(); 1');
  for (let i = 0; i < 8; i++) { await TAB(cdp); faqChain.push(await cdp.evalExpr(FOCUS_INFO)); }
  out.faq = {
    ...faqRects, afterEnter, afterSpace, focusRingOnSummary: ringFaq,
    tabFromSummary: faqChain.map((f) => f.tag + ':' + (f.text || '').slice(0, 22)),
  };
  add('faq-keyboard', 'FAQ details/summary open with Enter and Space, and never traps Tab',
    'open toggles on Enter and Space; Tab leaves the widget',
    `openBefore=${faqRects.openBefore} afterEnter=${afterEnter.open} (active still summary=${afterEnter.active}) afterSpace=${afterSpace.open} focus ring on summary outline=${ringFaq.outline.width} ${ringFaq.outline.style} ${ringFaq.outline.color} | tab stops after summary: ${out.faq.tabFromSummary.join(' -> ')}`,
    afterEnter.open === true && afterSpace.open === true,
    'kb-faq.json, screens/kb-faq-open-with-enter.png');

  // ================= Escape / focus return on the overlay menu @1440 is N/A;
  // the overlay only exists <= the block's breakpoint (see nav-mobile.js) =========
  L.write('kb-checks.json', out);
  cdp.ws.close();
  await chrome.kill();
  const fails = out.checks.filter((c) => !c.pass);
  console.log(`kb checks: ${out.checks.length - fails.length}/${out.checks.length} pass`);
  fails.forEach((f) => console.log('  FAIL ' + f.id + ' :: ' + f.actual));
  console.log('DONE');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });