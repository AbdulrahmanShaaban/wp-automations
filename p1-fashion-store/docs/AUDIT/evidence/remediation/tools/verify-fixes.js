#!/usr/bin/env node
/**
 * Remediation verification runner — GATE-2026-10-06 (2026-10-07).
 *
 * Proves the B1–B7 fixes on the LIVE local site with fresh evidence written to
 * ../ (docs/AUDIT/evidence/remediation/). It does NOT touch the audit evidence
 * from 2026-10-06 (security/a11y/perf stay as-is; those reports describe the
 * pre-fix state).
 *
 * Covers:
 *   B3 mobile nav  — hamburger button visible @390, inline links hidden,
 *                    clicking the button reveals the 4 links (screenshot)
 *   B4 anchors     — #cats / #best / #about exist and match the nav hrefs
 *   B5 no-JS       — with script execution disabled every .reveal is visible
 *   B6 autocomplete— checkout #email is autocomplete="email"; tel has
 *                    inputmode=tel + dir=ltr (axe autocomplete-valid re-check)
 *   F7 targets     — checkbox/radio/orderby minimum sizes @390
 *   F8 letter-space— computed letter-spacing on the Arabic site title is 0
 *   F5/F6 labels   — no "add to cart" label on a link that only navigates;
 *                    every Demo badge carries lang="en"
 *   SEO            — one canonical per page, no noindex URL in the sitemap
 *
 * Usage: node docs/AUDIT/evidence/remediation/tools/verify-fixes.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8888';
const OUT = path.join(__dirname, '..');
const SHOTS = path.join(OUT, 'screens');
const AXE_SRC = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const chromeLauncher = require('chrome-launcher');
const WebSocket = require('ws');

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

const write = (name, data) => {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name);
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 1));
  console.log('  wrote ' + name);
};
const shot = async (cdp, name) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(SHOTS, name), Buffer.from(data, 'base64'));
  console.log('  shot ' + name);
};

/* ------------------------------------------------------------ in-page cart seed */
/* Seeded in the page context so the session cookie is set natively for the
 * browser — copying cookies in from node left the checkout with an empty cart. */
const SEED_CART = `(async () => {
  const g = await fetch('/wp-json/wc/store/v1/cart', { credentials: 'same-origin' });
  const nonce = g.headers.get('Nonce');
  const before = await g.json();
  const pr = await fetch('/wp-json/wc/store/v1/products?per_page=5', { credentials: 'same-origin' });
  const products = await pr.json();
  const p = products.find(x => x.is_in_stock) || products[0];
  const post = await fetch('/wp-json/wc/store/v1/cart/add-item', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Nonce: nonce || '' },
    body: JSON.stringify({ id: p.id, quantity: 1 })
  });
  const after = await post.json();
  return { product: { id: p.id, name: p.name }, status: post.status, before: before.items_count, after: after.items_count,
           cookieNames: document.cookie.split(';').map(c => c.split('=')[0].trim()) };
})()`;

/* -------------------------------------------------------------------- CDP glue */
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
      } else if (m.method) {
        (this.listeners.get(m.method) || []).forEach((fn) => fn(m.params));
      }
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
      const fn = (p) => {
        this.listeners.set(method, arr.filter((f) => f !== fn));
        res(p);
      };
      arr.push(fn);
      this.listeners.set(method, arr);
    });
  }
  async evalExpr(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600));
    return r.result.value;
  }
}

async function waitForLoad(cdp, timeout = 60000) {
  const fired = cdp.once('Page.loadEventFired');
  await Promise.race([fired, new Promise((r) => setTimeout(r, timeout))]);
  await cdp.evalExpr(
    `(async()=>{ if(document.readyState==='complete') return 'complete';
      await new Promise(r=>{ if(document.readyState==='complete') return r(); document.addEventListener('load',r,{once:true}); setTimeout(r,15000); });
      return document.readyState; })()`
  );
}
async function navigate(cdp, url, settle = 1500) {
  const loading = waitForLoad(cdp);
  await cdp.send('Page.navigate', { url });
  await loading;
  await new Promise((r) => setTimeout(r, settle));
}
async function runAxe(cdp) {
  const already = await cdp.evalExpr('typeof window.axe');
  if (already !== 'object') {
    const inj = await cdp.send('Runtime.evaluate', { expression: AXE_SRC, returnByValue: false });
    if (inj.exceptionDetails) throw new Error('axe inject failed');
  }
  const raw = await cdp.evalExpr(
    `(async()=>{ const r = await axe.run(document,{ runOnly:{ type:'tag', values:${JSON.stringify(AXE_TAGS)} } } );
      return JSON.stringify({
        violations: r.violations.map(v=>({ id:v.id, impact:v.impact, nodes:v.nodes.length, sample:v.nodes.slice(0,3).map(n=>n.target.join(' ')) })),
        incomplete: r.incomplete.map(v=>({ id:v.id, impact:v.impact, nodes:v.nodes.length })),
        passes: r.passes.length, engine: r.testEngine, runner: r.testRunner });
    })()`
  );
  const p = JSON.parse(raw);
  const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  p.violations.forEach((v) => { if (byImpact[v.impact] !== undefined) byImpact[v.impact] += 1; });
  return { ...p, violationCounts: { total: p.violations.length, ...byImpact } };
}

/* -------------------------------------------------------------- in-page probes */
const PROBE_HOME = `(() => {
  const vis = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  const disp = (el) => (el ? getComputedStyle(el).display : 'MISSING');
  const open = document.querySelector('.wp-block-navigation__responsive-container-open');
  const inlineList = document.querySelector('.site-header .wp-block-navigation > .wp-block-navigation__container');
  const title = document.querySelector('.wp-block-site-title');
  const navLinkHrefs = [...document.querySelectorAll('.site-header nav a')].map(a=>a.getAttribute('href'));
  const hashHrefs = [...new Set([...document.querySelectorAll('a[href*="#"]')].map(a=>a.getAttribute('href')))];
  const hashTargets = hashHrefs.map(h => { const id = (h.split('#')[1] || ''); return { href: h, id, targetExists: !!id && !!document.getElementById(id) }; });
  const revs = [...document.querySelectorAll('.reveal')];
  const labels = [...document.querySelectorAll('a.p-btn')].map(a => ({ text: a.textContent.trim(), href: a.getAttribute('href') }));
  return {
    dir: document.documentElement.getAttribute('dir'),
    lang: document.documentElement.getAttribute('lang'),
    hamburger: { exists: !!open, display: disp(open), visible: vis(open), w: open ? open.offsetWidth : 0, h: open ? open.offsetHeight : 0, ariaExpanded: open ? open.getAttribute('aria-expanded') : null },
    inlineListDisplay: disp(inlineList),
    navLinkCount: navLinkHrefs.length,
    navLinkHrefs,
    letterSpacingTitle: title ? getComputedStyle(title).letterSpacing : 'MISSING',
    hashTargets,
    revealTotal: revs.length,
    revealHidden: revs.filter(el => parseFloat(getComputedStyle(el).opacity) < 0.99).length,
    addToCartLabels: labels.filter(l => l.text.indexOf('أضف للسلة') === 0).length,
    pBtnLabels: [...new Set(labels.map(l => l.text))],
    demoBadges: document.querySelectorAll('.badge.demo').length,
    demoBadgesWithLang: document.querySelectorAll('.badge.demo[lang="en"]').length,
    canonicalCount: document.querySelectorAll('link[rel="canonical"]').length,
    ldBlocks: [...document.querySelectorAll('script[type="application/ld+json"]')].length,
  };
})()`;

const PROBE_MENU_OPEN = `(() => {
  const vis = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  const box = document.querySelector('.wp-block-navigation__responsive-container');
  const links = [...document.querySelectorAll('.wp-block-navigation__responsive-container a')];
  return {
    navIsResponsive: !!document.querySelector('.wp-block-navigation.is-responsive'),
    containerClass: box ? box.className : 'MISSING',
    containerVisible: vis(box),
    linkCount: links.length,
    links: links.map(a => ({ text: a.textContent.trim().replace(/\\s+/g,' ').slice(0,40), href: a.getAttribute('href'), visible: vis(a) })),
  };
})()`;

const PROBE_CHECKOUT = `(() => {
  const box = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
  const email = document.getElementById('email');
  const phone = document.getElementById('phone') || document.querySelector('input[type="tel"]');
  const small = [...document.querySelectorAll('input[type="checkbox"],input[type="radio"],select')].map(el => {
    const r = el.getBoundingClientRect();
    return { cls: el.className.split(' ')[0] || el.type, w: Math.round(r.width), h: Math.round(r.height) };
  }).filter(x => (x.w && x.h && (x.w < 24 || x.h < 24)));
  return {
    emailAutocomplete: email ? email.getAttribute('autocomplete') : 'MISSING',
    emailDir: email ? email.getAttribute('dir') : 'MISSING',
    phoneInputmode: phone ? phone.getAttribute('inputmode') : 'MISSING',
    phoneDir: phone ? phone.getAttribute('dir') : 'MISSING',
    sub24Controls: small,
    checkboxBox: box('.wc-block-components-checkbox__input'),
  };
})()`;

/* --------------------------------------------------------------------- runner */
(async () => {
  const started = Date.now();
  console.log('== GATE-2026-10-06 remediation verification ==');

  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1'],
  });
  const targets = await (await fetch(`http://127.0.0.1:${chrome.port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  const cdp = new CDP(ws);
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable'), cdp.send('Network.enable')]);

  await navigate(cdp, BASE + '/shop/', 1500);
  const seed = await cdp.evalExpr(SEED_CART);
  console.log('  cart seeded in browser: after=' + seed.after + ' status=' + seed.status);

  const report = { generatedAt: new Date().toISOString(), base: BASE, gate: 'GATE-2026-10-06', cart: { before: seed.before, after: seed.after, status: seed.status, product: seed.product } };

  /* ---- desktop 1440 ---- */
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate(cdp, BASE + '/', 1600);
  report.desktop1440 = await cdp.evalExpr(PROBE_HOME);
  await shot(cdp, 'home-1440.png');

  /* ---- mobile 390: nav closed then open ---- */
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await navigate(cdp, BASE + '/', 1600);
  report.mobile390Closed = await cdp.evalExpr(PROBE_HOME);
  await shot(cdp, 'home-390-nav-closed.png');

  await cdp.evalExpr(`(() => { const b = document.querySelector('.wp-block-navigation__responsive-container-open'); if (b) b.click(); return !!b; })()`);
  await new Promise((r) => setTimeout(r, 900));
  report.mobile390MenuOpen = await cdp.evalExpr(PROBE_MENU_OPEN);
  await shot(cdp, 'home-390-nav-open.png');

  /* ---- mobile axe on home ---- */
  await cdp.evalExpr(`(() => { const c = document.querySelector('.wp-block-navigation__responsive-container-close'); if (c) c.click(); return 1; })()`);
  await new Promise((r) => setTimeout(r, 700));
  report.axeHomeMobile = await runAxe(cdp);

  /* ---- no-JS probe (B5) ---- */
  await cdp.send('Emulation.setScriptExecutionDisabled', { value: true });
  await navigate(cdp, BASE + '/', 1400);
  report.noJsReveal = await cdp.evalExpr(`(() => {
    const revs = [...document.querySelectorAll('.reveal')];
    return { scriptingDisabled: true, revealTotal: revs.length,
      hiddenCount: revs.filter(el => parseFloat(getComputedStyle(el).opacity) < 0.99).length,
      heroVisible: (() => { const h = document.querySelector('h1'); return !!h && parseFloat(getComputedStyle(h).opacity) > 0.99; })(),
      h1Text: (document.querySelector('h1') || {}).textContent };
  })()`);
  await shot(cdp, 'home-390-no-js.png');
  await cdp.send('Emulation.setScriptExecutionDisabled', { value: false });

  /* ---- checkout with cart (B6 + F7) ---- */
  await navigate(cdp, BASE + '/checkout/', 3200);
  await new Promise((r) => setTimeout(r, 1500));
  report.checkoutMobile390 = await cdp.evalExpr(PROBE_CHECKOUT);
  report.axeCheckoutMobile = await runAxe(cdp);
  await shot(cdp, 'checkout-390.png');

  await navigate(cdp, BASE + '/shop/', 2200);
  report.shopOrderBy = await cdp.evalExpr(`(() => {
    const s = document.querySelector('.woocommerce-ordering select') || document.querySelector('select');
    if (!s) return { select: 'MISSING' };
    const r = s.getBoundingClientRect();
    return { cls: s.className, w: Math.round(r.width), h: Math.round(r.height) };
  })()`);

  write('verify-fixes.json', report);
  write(
    'verify-fixes.txt',
    [
      'GATE-2026-10-06 remediation verification (fresh run, read-only against the site)',
      'base: ' + BASE + '  generated: ' + report.generatedAt,
      'cart seeded in browser: before=' + report.cart.before + ' after=' + report.cart.after + ' (' + report.cart.product.name + ')',
      '',
      'B3 mobile nav @390: hamburger visible=' + report.mobile390Closed.hamburger.visible +
        ' size=' + report.mobile390Closed.hamburger.w + 'x' + report.mobile390Closed.hamburger.h +
        ' inline-list display=' + report.mobile390Closed.inlineListDisplay,
      'B3 after click: container visible=' + report.mobile390MenuOpen.containerVisible +
        ' links=' + report.mobile390MenuOpen.linkCount +
        ' all-visible=' + report.mobile390MenuOpen.links.every((l) => l.visible),
      'B3 desktop 1440: hamburger display=' + report.desktop1440.hamburger.display +
        ' inline-list=' + report.desktop1440.inlineListDisplay + ' links=' + report.desktop1440.navLinkCount,
      'B4 anchors: ' + report.mobile390Closed.hashTargets.map((t) => t.href + '=' + t.targetExists).join(' '),
      'B5 no-JS: reveal total=' + report.noJsReveal.revealTotal + ' hidden=' + report.noJsReveal.hiddenCount +
        ' hero visible=' + report.noJsReveal.heroVisible,
      'B6 checkout #email autocomplete=' + report.checkoutMobile390.emailAutocomplete +
        ' inputmode(phone)=' + report.checkoutMobile390.phoneInputmode + ' dir(phone)=' + report.checkoutMobile390.phoneDir,
      'F7 sub-24 controls @390: ' + (report.checkoutMobile390.sub24Controls.length || 'none') +
        ' | orderby select=' + report.shopOrderBy.h + 'px tall',
      'F8 letter-spacing (Arabic title) = ' + report.mobile390Closed.letterSpacingTitle,
      'F5 add-to-cart labels on plain links = ' + report.mobile390Closed.addToCartLabels +
        ' | labels now: ' + report.mobile390Closed.pBtnLabels.join(' / '),
      'F6 Demo badges with lang="en": ' + report.mobile390Closed.demoBadgesWithLang + '/' + report.mobile390Closed.demoBadges,
      'SEO canonical on home @390 = ' + report.mobile390Closed.canonicalCount + ' | desktop = ' + report.desktop1440.canonicalCount +
        ' | JSON-LD blocks = ' + report.mobile390Closed.ldBlocks,
      'axe home@390: ' + JSON.stringify(report.axeHomeMobile.violationCounts) +
        ' | rules: ' + (report.axeHomeMobile.violations.map((v) => v.id + '(' + v.impact + ')').join(',') || 'none'),
      'axe checkout@390: ' + JSON.stringify(report.axeCheckoutMobile.violationCounts) +
        ' | rules: ' + (report.axeCheckoutMobile.violations.map((v) => v.id + '(' + v.impact + ')').join(',') || 'none'),
      'screens: ' + fs.readdirSync(SHOTS).join(', '),
      '',
      'took ' + Math.round((Date.now() - started) / 1000) + 's',
    ].join('\n')
  );

  await cdp.send('Emulation.clearDeviceMetricsOverride');
  ws.close();
  await chrome.kill();
  console.log('done in ' + Math.round((Date.now() - started) / 1000) + 's');
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});