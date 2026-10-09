/**
 * Follow-ups:
 *  (a) full attribute dump of the 390 overlay toggle (aria-expanded / role / data-*)
 *  (b) real WHEEL input to test whether the page behind the open overlay scrolls
 *  (c) the .note.paper background question: does the white --surface survive the
 *      `.paper{background: repeating-linear-gradient(...)}` shorthand (style.css:204)?
 * Usage: node docs/AUDIT/evidence/a11y/tools/nav-followup.js
 */
'use strict';

const L = require('./lib.js');

(async () => {
  const { chrome, cdp, chromeVersion } = await L.launch();
  const out = { generatedAt: new Date().toISOString(), chrome: chromeVersion };

  // ---------- (a) toggle attributes ----------
  await L.setViewport(cdp, '390');
  await L.nav(cdp, L.BASE + '/');
  out.toggleAttrs = await cdp.evalExpr(`(() => {
    const b = document.querySelector('.wp-block-navigation__responsive-container-open');
    if (!b) return { missing: true };
    const attrs = {};
    for (const a of b.attributes) attrs[a.name] = a.value;
    const container = document.querySelector('.wp-block-navigation__responsive-container');
    const cattrs = {};
    if (container) for (const a of container.attributes) cattrs[a.name] = a.value;
    return { attrs, role: b.getAttribute('role'), tag: b.tagName,
      tabindex: b.getAttribute('tabindex'),
      ariaExpanded: b.getAttribute('aria-expanded'),
      ariaControls: b.getAttribute('aria-controls'),
      ariaHasPopup: b.getAttribute('aria-haspopup'),
      text: b.textContent.trim(),
      innerHTML: b.innerHTML.replace(/\\s+/g, ' ').slice(0, 220),
      iconSize: (function () { const s = b.querySelector('svg'); if (!s) return null;
        const r = s.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })(),
      containerAttrs: cattrs,
      containerClasses: container ? container.className : null,
      modalOverlayPresent: !!document.querySelector('.wp-block-navigation__modal-overlay'),
      // which element is actually the fixed overlay?
      fixedBoxes: [...document.querySelectorAll('.wp-block-navigation__responsive-container, .wp-block-navigation__responsive-container-open, .wp-block-navigation__responsive-container-close, .wp-block-navigation__responsive-container-content, .wp-block-navigation__responsive-container-content ul, .wp-block-navigation__responsive-container-close svg')]
        .map(e => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
          return { cls: String(e.className).slice(0, 70), position: cs.position, display: cs.display,
            zIndex: cs.zIndex, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }; })
    };
  })()`);

  // ---------- (b) real wheel scroll while the overlay is open ----------
  await cdp.evalExpr('document.querySelector(".wp-block-navigation__responsive-container-open").click(); 1');
  await new Promise((r) => setTimeout(r, 700));
  const before = await cdp.evalExpr('({ scrollY: Math.round(scrollY), htmlOverflow: getComputedStyle(document.documentElement).overflow, htmlInlineOverflow: document.documentElement.style.overflow, bodyOverflow: getComputedStyle(document.body).overflow, hasModalOpen: document.documentElement.classList.contains("has-modal-open") })');
  // three real wheel gestures downward
  for (let i = 0; i < 3; i++) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 195, y: 500, deltaX: 0, deltaY: 240 });
    await new Promise((r) => setTimeout(r, 180));
  }
  await new Promise((r) => setTimeout(r, 400));
  const after = await cdp.evalExpr(`({ scrollY: Math.round(scrollY), hitTestBelowMenu: (function(){ const el = document.elementFromPoint(195, 700); return el ? el.tagName + '.' + String(el.className || '').slice(0, 40) : null; })() })`);
  await L.shot(cdp, 'nav-390-wheel-test-menu-open');
  out.wheelWhileOpen = { before, after, moved: after.scrollY - before.scrollY,
    hitTestBelowMenu: after.hitTestBelowMenu };

  // close and wheel again as a control measurement
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27, key: 'Escape', code: 'Escape' });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27, key: 'Escape', code: 'Escape' });
  await new Promise((r) => setTimeout(r, 500));
  await cdp.evalExpr('scrollTo(0,0); 1');
  const ctrlBefore = await cdp.evalExpr('Math.round(scrollY)');
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 195, y: 500, deltaX: 0, deltaY: 240 });
  await new Promise((r) => setTimeout(r, 400));
  const ctrlAfter = await cdp.evalExpr('Math.round(scrollY)');
  out.wheelClosedControl = { ctrlBefore, ctrlAfter, moved: ctrlAfter - ctrlBefore };

  // ---------- (c) the .note.paper background chain ----------
  await L.setViewport(cdp, '1440');
  await L.nav(cdp, L.BASE + '/');
  out.notePaper = await cdp.evalExpr(`(() => {
    const note = document.querySelector('aside.note.paper');
    const cs = getComputedStyle(note);
    // which declared rule wins for background-color?
    const matched = [];
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
      for (const r of rules || []) {
        if (!r.selectorText) continue;
        if (!/\\.note\\b|\\.paper\\b/.test(r.selectorText)) continue;
        matched.push({ selector: r.selectorText, background: r.style.background || null,
          backgroundColor: r.style.backgroundColor || null, backgroundImage: r.style.backgroundImage || null,
          href: (sheet.href || '').split('/').pop() });
      }
    }
    return {
      classes: note.className,
      backgroundColor: cs.backgroundColor,
      backgroundImage: cs.backgroundImage.slice(0, 200),
      expectedSurface: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim(),
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      card: (function () { const c = document.querySelector('.card, .svc, .photo'); return c ? { cls: c.className, bg: getComputedStyle(c).backgroundColor } : null; })(),
      rules: matched
    };
  })()`);
  await L.shot(cdp, 'note-card-1440');

  // same question at 390
  await L.setViewport(cdp, '390');
  await L.nav(cdp, L.BASE + '/');
  out.notePaper390 = await cdp.evalExpr(`(() => {
    const note = document.querySelector('aside.note.paper');
    const cs = getComputedStyle(note);
    return { backgroundColor: cs.backgroundColor, backgroundImage: cs.backgroundImage.slice(0, 140) };
  })()`);

  L.write('nav-followup.json', out);
  cdp.ws.close();
  await chrome.kill();
  console.log('DONE');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });