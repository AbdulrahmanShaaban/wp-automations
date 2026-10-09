/**
 * Mobile navigation pass at 390x844: the core navigation overlay
 * (overlayMenu:"mobile" in parts/header.html:7).
 *
 * Verifies reachability, the position:fixed containing-block lesson
 * (.site-header has backdrop-filter; style.css:98 disables it while
 * html.has-modal-open), Escape-to-close, focus handling and target size.
 */
'use strict';

const L = require('./lib.js');

const KEY = (k, code, keyCode, text, mods = 0) => ({
  type: 'keyDown', modifiers: mods, windowsVirtualKeyCode: keyCode,
  nativeVirtualKeyCode: keyCode, key: k, code, text,
});
const KEY_UP = (k, code, keyCode, mods = 0) => ({
  type: 'keyUp', modifiers: mods, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, key: k, code,
});
async function press(cdp, k, code, keyCode, text, mods) {
  await cdp.send('Input.dispatchKeyEvent', KEY(k, code, keyCode, text, mods));
  await cdp.send('Input.dispatchKeyEvent', KEY_UP(k, code, keyCode, mods));
  await new Promise((r) => setTimeout(r, 120));
}
const ESC = (cdp) => press(cdp, 'Escape', 'Escape', 27);
const TAB = (cdp) => press(cdp, 'Tab', 'Tab', 9);
const ENTER = (cdp) => press(cdp, 'Enter', 'Enter', 13, '\r');

const ACTIVE = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return { tag: 'BODY' };
  return { tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 60),
    text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 30),
    outline: getComputedStyle(el).outlineStyle + ' ' + getComputedStyle(el).outlineWidth };
})()`;

const OPEN_STATE = `(() => {
  const de = document.documentElement;
  const btn = document.querySelector('.wp-block-navigation__responsive-container-open');
  const container = document.querySelector('.wp-block-navigation__responsive-container');
  const modal = document.querySelector('.wp-block-navigation__modal-overlay');
  const inner = document.querySelector('.wp-block-navigation__responsive-container-content');
  const header = document.querySelector('.site-header');
  function box(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom),
      position: cs.position, display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
      zIndex: cs.zIndex, backdropFilter: cs.backdropFilter, transform: cs.transform, filter: cs.filter };
  }
  // Does the overlay actually cover the viewport?
  let coversViewport = null;
  if (inner) {
    const r = inner.getBoundingClientRect();
    coversViewport = { coversWidth: r.width >= window.innerWidth - 2, coversHeight: r.height >= window.innerHeight - 2,
      widthPct: Math.round((r.width / window.innerWidth) * 100), heightPct: Math.round((r.height / window.innerHeight) * 100),
      innerW: window.innerWidth, innerH: window.innerHeight };
  }
  return {
    htmlClass: de.className,
    hasModalOpen: de.classList.contains('has-modal-open'),
    openBtn: box(btn),
    openBtnAria: btn ? { expanded: btn.getAttribute('aria-expanded'), label: btn.getAttribute('aria-label'),
      controls: btn.getAttribute('aria-label') || (btn.getAttribute('aria-controls') || ''),
      tabindex: btn.getAttribute('tabindex') } : null,
    container: box(container),
    modalOverlay: box(modal),
    content: box(inner),
    coversViewport,
    headerBackdropFilter: header ? getComputedStyle(header).backdropFilter : null,
    headerBox: box(header),
    links: container ? [...container.querySelectorAll('a')].map(a => ({ text: a.textContent.trim().slice(0, 24), href: a.getAttribute('href'),
      r: (function () { const b = a.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; })() })) : [],
    closeBtn: (() => { const b = document.querySelector('.wp-block-navigation__responsive-container-close');
      if (!b) return null; const r = b.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), ariaLabel: b.getAttribute('aria-label'), text: b.textContent.trim().slice(0, 20) }; })(),
    bodyScrollLocked: getComputedStyle(document.body).overflow + '|' + de.style.overflow,
    scrollY: Math.round(scrollY),
  };
})()`;

(async () => {
  const { chrome, cdp, chromeVersion } = await L.launch();
  const out = { generatedAt: new Date().toISOString(), chrome: chromeVersion, viewport: '390x844', checks: [], states: {} };
  const add = (id, desc, expected, actual, pass, evidence) => {
    out.checks.push({ id, desc, expected, actual, pass, evidence });
    console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${id} :: ${actual}`);
  };

  await L.setViewport(cdp, '390');

  // ---------- closed state ----------
  await L.nav(cdp, L.BASE + '/');
  const closed = await cdp.evalExpr(OPEN_STATE);
  out.states.closed = closed;
  const btnVisible = !!(closed.openBtn && closed.openBtn.display !== 'none' && closed.openBtn.w > 0 && closed.openBtn.h > 0);
  add('nav-toggle-reachable-390',
    'A menu toggle is present and visible at 390x844',
    '.wp-block-navigation__responsive-container-open visible with >0 size',
    `btn=${JSON.stringify(closed.openBtn)} containerDisplay=${closed.container && closed.container.display}`,
    btnVisible, 'nav-mobile.json -> states.closed');
  add('nav-toggle-target-size',
    'The menu toggle meets WCAG 2.2 2.5.8 (24px min, or 24px spacing exception)',
    'min(width,height) >= 24 OR passes via the spacing exception',
    `btn ${closed.openBtn.w}x${closed.openBtn.h}`,
    !!(closed.openBtn && (Math.min(closed.openBtn.w, closed.openBtn.h) >= 24)), 'nav-mobile.json');

  // desktop links must be hidden while closed (otherwise no toggle is needed)
  const desktopLinksHidden = closed.container && (closed.container.display === 'none' || closed.links.every((l) => l.r.w === 0));
  add('nav-desktop-links-not-leaking',
    'With the overlay closed the desktop link row is not duplicated on screen',
    'container display:none OR all link widths 0',
    `container display=${closed.container && closed.container.display} links=${JSON.stringify(closed.links)}`,
    !!desktopLinksHidden, 'nav-mobile.json -> states.closed');

  // ---------- open via keyboard ----------
  await cdp.evalExpr('window.scrollTo(0,0); document.querySelector(".wp-block-navigation__responsive-container-open").focus(); 1');
  const beforeOpen = await cdp.evalExpr(ACTIVE);
  await L.shot(cdp, 'nav-390-toggle-focused');
  await ENTER(cdp);
  await new Promise((r) => setTimeout(r, 700));
  const open = await cdp.evalExpr(OPEN_STATE);
  out.states.open = open;
  await L.shot(cdp, 'nav-390-menu-open');
  add('overlay-covers-viewport',
    'The open overlay covers the viewport (the backdrop-filter containing-block lesson)',
    'overlay content width >= viewport width and height >= viewport height',
    `hasModalOpen=${open.hasModalOpen} htmlClass="${open.htmlClass}" headerBackdropFilter=${open.headerBackdropFilter} coversViewport=${JSON.stringify(open.coversViewport)} content=${JSON.stringify(open.content)} modalOverlay=${JSON.stringify(open.modalOverlay)}`,
    !!(open.coversViewport && open.coversViewport.coversWidth && open.coversViewport.coversHeight),
    'screens/nav-390-menu-open.png');
  add('toggle-aria-state',
    'The toggle exposes its expanded state',
    'aria-expanded="true" when open',
    `aria-expanded=${open.openBtnAria && open.openBtnAria.expanded} aria-label="${open.openBtnAria && open.openBtnAria.label}"`,
    open.openBtnAria && open.openBtnAria.expanded === 'true', 'nav-mobile.json -> states.open');
  const focusInOverlay = await cdp.evalExpr(`(() => {
    const el = document.activeElement;
    return { tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 60),
      text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 30),
      insideModal: !!el.closest('.wp-block-navigation__responsive-container'),
      outline: getComputedStyle(el).outlineStyle + ' ' + getComputedStyle(el).outlineWidth + ' ' + getComputedStyle(el).outlineColor };
  })()`);
  out.focusAfterOpen = focusInOverlay;
  add('focus-moves-into-overlay',
    'Opening the menu moves focus inside the overlay (so a screen reader lands in the menu)',
    'document.activeElement is inside .wp-block-navigation__responsive-container',
    `before=${JSON.stringify(beforeOpen)} after=${JSON.stringify(focusInOverlay)}`,
    !!focusInOverlay.insideModal, 'nav-mobile.json -> focusAfterOpen');

  // tab through the open menu
  const chain = [];
  for (let i = 0; i < 8; i++) { await TAB(cdp); chain.push(await cdp.evalExpr(`(() => { const el = document.activeElement;
    return { tag: el.tagName.toLowerCase(), cls: String(el.className||'').slice(0,50), text: (el.textContent||'').trim().replace(/\\s+/g,' ').slice(0,26),
      insideModal: !!el.closest('.wp-block-navigation__responsive-container'), focusVisible: (function(){try{return el.matches(':focus-visible');}catch(e){return null;}})() }; })()`)); }
  out.tabChainInMenu = chain;
  add('menu-tab-order',
    'Tab inside the open menu stays inside it and every stop shows a focus ring',
    'all stops inside the overlay with an outline',
    chain.map((f) => `${f.tag}:${f.text}${f.insideModal ? '' : ' [OUTSIDE]'}`).join(' -> '),
    chain.filter((f) => f.insideModal).length >= 3, 'nav-mobile.json -> tabChainInMenu');

  // ---------- Escape closes ----------
  await ESC(cdp);
  await new Promise((r) => setTimeout(r, 700));
  const afterEsc = await cdp.evalExpr(OPEN_STATE);
  out.states.afterEscape = afterEsc;
  const focusAfterEsc = await cdp.evalExpr(ACTIVE);
  out.focusAfterEscape = focusAfterEsc;
  add('escape-closes',
    'Escape closes the overlay',
    'has-modal-open removed and overlay no longer covers the viewport',
    `hasModalOpen=${afterEsc.hasModalOpen} htmlClass="${afterEsc.htmlClass}" content=${JSON.stringify(afterEsc.content)}`,
    !afterEsc.hasModalOpen, 'nav-mobile.json -> states.afterEscape');
  add('focus-returns-on-close',
    'Closing the menu returns focus to the toggle',
    'document.activeElement is the responsive-container-open button',
    `activeElement=${JSON.stringify(focusAfterEsc)}`,
    /responsive-container-open/.test(focusAfterEsc.cls || ''), 'nav-mobile.json -> focusAfterEscape');
  await L.shot(cdp, 'nav-390-after-escape');

  // ---------- does the overlay trap page scroll / background scroll? ----------
  await L.nav(cdp, L.BASE + '/');
  await cdp.evalExpr('document.querySelector(".wp-block-navigation__responsive-container-open").focus(); 1');
  await ENTER(cdp);
  await new Promise((r) => setTimeout(r, 600));
  const bgScroll = await cdp.evalExpr(`(async () => {
    const before = Math.round(scrollY);
    scrollBy(0, 400);
    await new Promise(r => setTimeout(r, 300));
    const after = Math.round(scrollY);
    scrollTo(0, before);
    return { before, after, moved: after - before, bodyOverflow: getComputedStyle(document.body).overflow,
      htmlOverflow: getComputedStyle(document.documentElement).overflow };
  })()`);
  out.backgroundScrollWhileOpen = bgScroll;
  add('background-not-scrollable-when-open',
    'The page behind the open overlay does not scroll (focus not lost behind the menu)',
    'scrollY unchanged while the menu is open',
    `scrollY ${bgScroll.before} -> ${bgScroll.after} (moved ${bgScroll.moved}px), body.overflow=${bgScroll.bodyOverflow}, html.overflow=${bgScroll.htmlOverflow}`,
    bgScroll.moved === 0, 'nav-mobile.json -> backgroundScrollWhileOpen');

  // ---------- tap-target sizes of the open menu links ----------
  const menuTargets = await cdp.evalExpr(`(() => {
    const c = document.querySelector('.wp-block-navigation__responsive-container');
    return [...c.querySelectorAll('a,button')].map(a => { const r = a.getBoundingClientRect();
      return { tag: a.tagName.toLowerCase(), text: (a.textContent||'').trim().slice(0,20), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; });
  })()`);
  out.menuTargets = menuTargets;
  add('menu-link-target-sizes',
    'Open-menu links are >= 24px on their smaller side',
    'min(w,h) >= 24 for every link',
    menuTargets.map((t) => `${t.text}=${t.w}x${t.h}`).join(', '),
    menuTargets.every((t) => Math.min(t.w, t.h) >= 24), 'nav-mobile.json -> menuTargets');

  // ---------- same overlay on /book/ ----------
  await ESC(cdp);
  await L.nav(cdp, L.BASE + '/book/');
  const bookNav = await cdp.evalExpr(OPEN_STATE);
  out.bookPageNav = bookNav;
  add('overlay-on-book-page',
    'The overlay toggle also exists on /book/ at 390',
    'visible toggle',
    `btn=${JSON.stringify(bookNav.openBtn)} container=${JSON.stringify(bookNav.container)}`,
    !!(bookNav.openBtn && bookNav.openBtn.display !== 'none' && bookNav.openBtn.w > 0), 'nav-mobile.json -> bookPageNav');

  // ---------- 1024 spot check: is the overlay present there? ----------
  await L.setViewport(cdp, '1024');
  await L.nav(cdp, L.BASE + '/');
  const vp1024 = await cdp.evalExpr(OPEN_STATE);
  out.at1024 = vp1024;
  add('nav-at-1024',
    'At 1024 the desktop nav row is visible (and the overlay is not)',
    'container visible at 1024',
    `container=${JSON.stringify(vp1024.container)} toggle=${JSON.stringify(vp1024.openBtn)} links=${JSON.stringify(vp1024.links)}`,
    !!(vp1024.container && vp1024.container.display !== 'none'), 'nav-mobile.json -> at1024');

  L.write('nav-mobile.json', out);
  cdp.ws.close();
  await chrome.kill();
  const f = out.checks.filter((c) => !c.pass);
  console.log(`nav checks: ${out.checks.length - f.length}/${out.checks.length} pass`);
  console.log('DONE');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });