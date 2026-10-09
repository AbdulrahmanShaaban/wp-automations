#!/usr/bin/env node
/**
 * Read-only a11y + Arabic/RTL audit runner — P3 clinic (2026-10-07).
 *
 * Runs axe-core 4.13 + DOM probes on 5 pages x 2 viewports (1440x900, 390x844)
 * against the LIVE local site, plus a 1024x768 screenshot spot check, touch
 * target measurement @390, contrast probes and real-font (platform) checks.
 * Writes JSON evidence into ../ and screenshots into ../screens/.
 * Touches no project files outside docs/AUDIT/evidence/.
 *
 * Usage: node docs/AUDIT/evidence/a11y/tools/run-audit.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8889';
const OUT = __dirname; // remediation copy: evidence lands here, not the baseline
const SCREENS = path.join(OUT, 'screens');
const AXE_SRC = fs.readFileSync(
  path.join('D:/my work/p1-fashion-store/node_modules/axe-core/axe.min.js'),
  'utf8'
);
const chromeLauncher = require(path.join('D:/my work/p1-fashion-store/node_modules/chrome-launcher'));
const WebSocket = require(path.join('D:/my work/p1-fashion-store/node_modules/ws'));

const PAGES = [
  { id: 'home', url: `${BASE}/` },
  { id: 'services', url: `${BASE}/services/` },
  { id: 'team', url: `${BASE}/team/` },
  { id: 'contact', url: `${BASE}/contact/` },
  { id: 'book', url: `${BASE}/book/` },
];
const VIEWPORTS = [
  { name: 'desktop', w: 1440, h: 900, mobile: false },
  { name: 'mobile', w: 390, h: 844, mobile: true },
];
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

const write = (name, data) => {
  const file = path.join(OUT, name);
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 1));
  console.log('  wrote ' + name);
};

const LOG = path.join(__dirname, 'run-audit.log');
fs.writeFileSync(LOG, `run-audit.js start ${new Date().toISOString()}\n`);
const log = (msg) => {
  console.log(msg);
  fs.appendFileSync(LOG, msg + '\n');
};

/* ------------------------------------------------------------------ CDP bits */
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
  async shot(name, fullPage = false) {
    fs.mkdirSync(SCREENS, { recursive: true });
    const params = { format: 'png' };
    if (fullPage) params.captureBeyondViewport = true;
    const { data } = await this.send('Page.captureScreenshot', params);
    fs.writeFileSync(path.join(SCREENS, name), Buffer.from(data, 'base64'));
    console.log('  shot ' + name);
  }
}

async function scrollThrough(cdp) {
  await cdp.evalExpr(
    `(async () => {
      const step = Math.round(window.innerHeight * 0.8);
      for (let y = 0; y < document.body.scrollHeight + step; y += step) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 110));
      }
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise(r => setTimeout(r, 400));
      window.scrollTo(0, 0);
      await new Promise(r => setTimeout(r, 350));
      return 'ok';
    })()`
  );
}

/* ------------------------------------------------------------ in-page probe */
const PROBE = function () {
  const out = {};
  const de = document.documentElement;
  out.lang = de.getAttribute('lang');
  out.dir = de.getAttribute('dir');
  out.title = document.title;
  out.viewportMeta = (document.querySelector('meta[name="viewport"]') || {}).content || null;
  out.url = location.pathname + location.search;

  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const sel = (el) => {
    if (el.id) return '#' + el.id;
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && n !== document.documentElement && parts.length < 5) {
      let s = n.tagName.toLowerCase();
      const cls = (n.className || '').toString().trim().split(/\s+/).filter(Boolean).slice(0, 3);
      if (cls.length) s += '.' + cls.join('.');
      parts.unshift(s);
      n = n.parentElement;
    }
    return parts.join('>');
  };

  /* headings + order */
  out.headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => ({
    level: Number(h.tagName[1]),
    text: (h.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 90),
    visible: visible(h),
  }));
  out.h1Count = out.headings.filter((h) => h.level === 1).length;
  out.hiddenHeadingCount = out.headings.filter((h) => !h.visible).length;
  out.headingSkips = [];
  let prev = 0;
  for (const h of out.headings) {
    if (prev && h.level > prev + 1) out.headingSkips.push({ from: prev, to: h.level, text: h.text.slice(0, 50) });
    prev = h.level;
  }

  /* landmarks */
  out.landmarks = {
    header: document.querySelectorAll('body > header, header').length,
    nav: document.querySelectorAll('nav').length,
    main: document.querySelectorAll('main').length,
    footer: document.querySelectorAll('footer').length,
    aside: document.querySelectorAll('aside').length,
    bannerTopLevel: !!document.querySelector('body > header'),
    contentinfoTopLevel: !!document.querySelector('body > footer'),
    roleMain: document.querySelectorAll('[role="main"]').length,
    roleStatus: document.querySelectorAll('[role="status"],[role="alert"]').length,
  };

  /* focus order + skip link */
  const focusables = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[tabindex]:not([tabindex="-1"])')];
  out.focusableCount = focusables.filter(visible).length;
  out.firstFocusables = focusables.slice(0, 8).map((el) => ({
    tag: el.tagName.toLowerCase(),
    text: (el.textContent || el.getAttribute('aria-label') || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 60),
    href: el.getAttribute('href'),
    cls: (el.className || '').toString().slice(0, 70),
    tabIndex: el.tabIndex,
  }));
  out.skipLink = (() => {
    const a = document.querySelector('a[href^="#"]');
    if (!a) return { present: false };
    return {
      present: true,
      href: a.getAttribute('href'),
      text: (a.textContent || '').trim(),
      cls: (a.className || '').toString(),
      isFirstFocusable: focusables[0] === a,
      targetExists: (() => { const id = (a.getAttribute('href') || '').slice(1); return id ? !!document.getElementById(id) : false; })(),
    };
  })();

  /* images */
  const imgs = [...document.images];
  out.images = {
    total: imgs.length,
    missingAlt: imgs.filter((i) => !i.hasAttribute('alt')).length,
    emptyAlt: imgs.filter((i) => i.getAttribute('alt') === '').length,
    broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
    sample: imgs.slice(0, 8).map((i) => ({ alt: i.getAttribute('alt'), src: (i.currentSrc || i.src || '').split('/').slice(-1)[0].slice(0, 60), w: Math.round(i.getBoundingClientRect().width) })),
  };

  /* digits / currency / commas */
  const text = document.body.innerText || '';
  out.digits = {
    latin: (text.match(/[0-9]/g) || []).length,
    eastern: (text.match(/[\u0660-\u0669]/g) || []).length,
    egp: (text.match(/ج\.م/g) || []).length,
    arabicComma: (text.match(/\u060C/g) || []).length,
    // Western comma sandwiched between Arabic letters (miss in Arabic prose)
    westernCommaInArabic: (text.match(/[\u0600-\u06FF]\s*,\s*[\u0600-\u06FF]/g) || []).length,
    semicolonAr: (text.match(/\u061B/g) || []).length,
  };

  /* typography on Arabic-bearing elements */
  const ar = /[\u0600-\u06FF]/;
  const typeSamples = [];
  const seen = new Set();
  let negativeLetterSpacing = null;
  let justifySeen = null;
  let lineLow = null;
  for (const el of [...document.querySelectorAll('body *')]) {
    if (typeSamples.length >= 40) break;
    const t = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').trim();
    if (!t || !ar.test(t) || !visible(el)) continue;
    const cs = getComputedStyle(el);
    const ls = cs.letterSpacing;
    if (ls !== 'normal' && parseFloat(ls) < 0 && !negativeLetterSpacing) {
      negativeLetterSpacing = { sel: el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ')[0], letterSpacing: ls, text: t.slice(0, 40) };
    }
    if (cs.textAlign === 'justify' && !justifySeen) justifySeen = { sel: el.tagName.toLowerCase(), text: t.slice(0, 40) };
    const px = cs.lineHeight === 'normal' ? NaN : parseFloat(cs.lineHeight);
    const fsPx = parseFloat(cs.fontSize);
    if (!Number.isNaN(px) && px / fsPx < 1.6 && !lineLow && Number.parseFloat(cs.fontSize) >= 14) {
      lineLow = { sel: el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ')[0], ratio: Math.round((px / fsPx) * 100) / 100, lineHeight: cs.lineHeight, fontSize: cs.fontSize, text: t.slice(0, 40) };
    }
    const key = `${cs.letterSpacing}|${cs.lineHeight}|${cs.fontFamily.split(',')[0]}|${cs.textAlign}`;
    if (seen.has(key)) continue;
    seen.add(key);
    typeSamples.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().slice(0, 50),
      text: t.replace(/\s+/g, ' ').slice(0, 50),
      letterSpacing: cs.letterSpacing,
      lineHeight: cs.lineHeight,
      fontSize: cs.fontSize,
      fontStyle: cs.fontStyle,
      fontFamily: cs.fontFamily.split(',').slice(0, 3).join(','),
      textAlign: cs.textAlign,
    });
  }
  out.typography = typeSamples;
  out.negativeLetterSpacing = negativeLetterSpacing;
  out.justifySeen = justifySeen;
  out.lowLineHeight = lineLow;
  out.bodyStyle = (() => {
    const cs = getComputedStyle(document.body);
    return { lineHeight: cs.lineHeight, fontSize: cs.fontSize, fontFamily: cs.fontFamily, letterSpacing: cs.letterSpacing, textAlign: cs.textAlign, direction: cs.direction };
  })();

  /* interactive targets (raw sizes) */
  const inter = focusables.filter(visible);
  out.targets = inter.slice(0, 200).map((el) => {
    const r = el.getBoundingClientRect();
    return {
      sel: sel(el),
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      x: Math.round(r.x),
      y: Math.round(r.y),
    };
  });
  out.targetTotal = inter.length;

  /* forms */
  out.forms = [...document.querySelectorAll('input,select,textarea')].map((el) => {
    const lbl = el.labels && el.labels[0] ? (el.labels[0].textContent || '').trim().slice(0, 60) : null;
    return {
      tag: el.tagName.toLowerCase(),
      type: (el.type || '').toLowerCase(),
      id: el.id || null,
      name: el.name || null,
      dir: el.getAttribute('dir'),
      autocomplete: el.getAttribute('autocomplete'),
      inputmode: el.getAttribute('inputmode'),
      placeholder: el.getAttribute('placeholder'),
      ariaLabel: el.getAttribute('aria-label'),
      ariaRequired: el.getAttribute('aria-required'),
      ariaInvalid: el.getAttribute('aria-invalid'),
      describedby: el.getAttribute('aria-describedby'),
      labelText: lbl,
      tabIndex: el.tabIndex,
      requiredNative: !!el.required,
      rect: (() => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })(),
    };
  });
  out.unlabelled = out.forms.filter((f) => f.type !== 'hidden' && !f.labelText && !f.ariaLabel).length;

  /* mixed language: Latin-only text runs and their lang ancestry */
  out.foreignRuns = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (out.foreignRuns.length >= 40) break;
    const s = (n.nodeValue || '').trim();
    if (s.length < 2 || !/[A-Za-z]/.test(s)) continue;
    const p = n.parentElement;
    if (!p || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(p.tagName)) continue;
    // runs that are pure-Latin (no Arabic in the same text node)
    if (ar.test(s)) continue;
    out.foreignRuns.push({
      text: s.slice(0, 60),
      parentTag: p.tagName.toLowerCase(),
      parentCls: (p.className || '').toString().slice(0, 50),
      langAncestor: p.closest('[lang]') ? p.closest('[lang]').getAttribute('lang') : null,
      dirAttr: p.closest('[dir]') ? p.closest('[dir]').getAttribute('dir') : null,
      bdi: !!p.closest('bdi'),
    });
  }
  out.langEnCount = document.querySelectorAll('[lang="en"]').length;
  out.bdiCount = document.querySelectorAll('bdi').length;

  /* links: purpose vs destination (CTA honesty) */
  out.links = [...document.querySelectorAll('a[href]')].map((a) => ({
    text: (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50),
    href: a.getAttribute('href'),
    cls: (a.className || '').toString().slice(0, 60),
    rect: (() => { const r = a.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })(),
  })).filter((l) => l.rect.w > 0 && l.rect.h > 0);

  /* reveal / motion */
  out.reveal = {
    total: document.querySelectorAll('.reveal').length,
    hiddenNow: [...document.querySelectorAll('.reveal')].filter((el) => parseFloat(getComputedStyle(el).opacity) < 0.99).length,
    jsMotion: document.documentElement.classList.contains('js-motion'),
  };
  out.motion = {
    reducedMotionQuery: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    ruleAnimation: (() => { const r = document.querySelector('.rule'); return r ? getComputedStyle(r).animationName : 'no-.rule'; })(),
  };

  /* responsive navigation state */
  const openBtn = document.querySelector('.wp-block-navigation__responsive-container-open');
  const container = document.querySelector('.wp-block-navigation__responsive-container');
  const inlineList = document.querySelector('.wp-block-navigation .wp-block-navigation__container');
  const disp = (el) => (el ? getComputedStyle(el).display : 'MISSING');
  out.nav = {
    hamburger: openBtn ? { display: disp(openBtn), visible: visible(openBtn), w: openBtn.offsetWidth, h: openBtn.offsetHeight, ariaExpanded: openBtn.getAttribute('aria-expanded'), tag: openBtn.tagName.toLowerCase() } : null,
    overlayContainer: container ? { display: disp(container), cls: container.className, visible: visible(container) } : null,
    inlineListDisplay: disp(inlineList),
    inlineLinksVisible: inlineList ? [...inlineList.querySelectorAll('a')].filter(visible).length : 0,
    headerBackdropFilter: (() => { const h = document.querySelector('.site-header'); return h ? getComputedStyle(h).backdropFilter || getComputedStyle(h).webkitBackdropFilter : 'MISSING'; })(),
    htmlHasModalOpen: document.documentElement.classList.contains('has-modal-open'),
  };

  /* overflow */
  out.overflowX = document.documentElement.scrollWidth > window.innerWidth + 1
    ? { scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth } : null;

  /* contrast pairs (colors captured; ratio computed in node) */
  const bgOf = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node);
      const color = cs.backgroundColor;
      const hasImage = cs.backgroundImage && cs.backgroundImage !== 'none';
      if ((color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') || hasImage) {
        return { color, image: hasImage, cls: (node.className || '').toString().slice(0, 50) };
      }
      node = node.parentElement;
    }
    const cs = getComputedStyle(document.body);
    return { color: cs.backgroundColor, image: false, cls: 'body' };
  };
  const PAIRS = [
    'body', '.eyebrow', '.hero .lead', '.hero h1', '.proof', '.lead', '.field-note',
    '.svc-meta', '.svc-meta span:last-child', '.svc h3', '.sec-num',
    '.photo figcaption', '.team-meta', '.step p', '.step-num', '.faq-item p', '.faq-item summary',
    '.info-list .k', '.info-list .v', '.demo-badge', '.brand-name',
    '.wp-block-navigation a', '.nav-cta', '.cta-inner .lead', '.cta-inner h2',
    'footer p', 'footer a', '.stamp', '.note-list li span', '.siraj-hint', '.siraj-label',
    '.btn-primary', '.btn-ghost',
  ];
  out.contrast = [];
  for (const s of PAIRS) {
    const el = document.querySelector(s);
    if (!el || !visible(el)) continue;
    const cs = getComputedStyle(el);
    const bg = bgOf(el);
    out.contrast.push({
      sel: s,
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 45),
      fg: cs.color, bg: bg.color, bgImage: bg.image, bgEl: bg.cls,
      fontSize: parseFloat(cs.fontSize), fontWeight: Number(cs.fontWeight) || 400,
      lineHeight: cs.lineHeight,
      w: Math.round(el.getBoundingClientRect().width),
      h: Math.round(el.getBoundingClientRect().height),
    });
  }
  return out;
};

/* ------------------------------------------------------------------- axe run */
async function runAxeInPage(cdp) {
  const already = await cdp.evalExpr('typeof window.axe');
  if (already !== 'object') {
    const inj = await cdp.send('Runtime.evaluate', { expression: AXE_SRC, returnByValue: false });
    if (inj.exceptionDetails) throw new Error('axe inject failed: ' + JSON.stringify(inj.exceptionDetails).slice(0, 300));
  }
  const raw = await cdp.evalExpr(
    `(async () => {
      const r = await axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(AXE_TAGS)} } });
      return JSON.stringify({
        violations: r.violations.map(rule => ({
          id: rule.id, impact: rule.impact, help: rule.help, helpUrl: rule.helpUrl,
          tags: rule.tags.filter(t => t.startsWith('wcag') || t === 'best-practice'),
          nodes: rule.nodes.length,
          sample: rule.nodes.slice(0, 6).map(nd => ({ target: nd.target.join(' '), html: nd.html.slice(0, 300), failureSummary: (nd.failureSummary || '').slice(0, 400) }))
        })),
        incomplete: r.incomplete.map(x => ({
          id: x.id, impact: x.impact, help: x.help, nodes: x.nodes.length,
          sample: x.nodes.slice(0, 4).map(nd => ({ target: nd.target.join(' '), html: nd.html.slice(0, 250), failureSummary: (nd.failureSummary || '').slice(0, 350) }))
        })),
        passes: r.passes.length,
        inapplicable: r.inapplicable.map(x => x.id),
        engine: r.testEngine,
        runner: r.testRunner,
        timestamp: r.timestamp
      });
    })()`
  );
  const p = JSON.parse(raw);
  const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  p.violations.forEach((v) => { if (byImpact[v.impact] !== undefined) byImpact[v.impact] += 1; });
  return {
    ...p,
    violationCounts: { ...byImpact, total: p.violations.length, nodes: p.violations.reduce((s, v) => s + v.nodes, 0) },
    viewport: { w: await cdp.evalExpr('innerWidth'), h: await cdp.evalExpr('innerHeight') },
  };
}

/* -------------------------------------------------------------- contrast math */
const parseColor = (c) => {
  const m = String(c).match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(',').map((x) => parseFloat(x.trim()));
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
};
const chan = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (c) => 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b);
const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
function contrastRatio(fgRaw, bgRaw) {
  const bg = { ...bgRaw, a: bgRaw.a === undefined ? 1 : bgRaw.a };
  const bgOpaque = bg.a < 1 ? { r: 250, g: 248, b: 244, a: 1 } : bg;
  const fg = fgRaw.a < 1 ? over(fgRaw, bgOpaque) : fgRaw;
  const blend = bg.a < 1 ? over(bg, { r: 250, g: 248, b: 244, a: 1 }) : bg;
  const l1 = lum(fg);
  const l2 = lum(blend);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}
function evaluateContrast(pairs) {
  return pairs.map((p) => {
    const fg = parseColor(p.fg);
    const bg = parseColor(p.bg);
    if (!fg || !bg) return { ...p, ratio: null, verdict: 'UNPARSED' };
    const large = p.fontSize >= 24 || (p.fontSize >= 18.66 && p.fontWeight >= 700);
    const need = large ? 3 : 4.5;
    const ratio = contrastRatio(fg, bg);
    let verdict = ratio >= need ? 'PASS' : 'FAIL';
    if (p.bgImage) verdict = 'COMPLEX-BG';
    return { ...p, required: need, large, ratio, verdict };
  });
}

/* ----------------------------------------------- real platform font evidence */
async function platformFonts(cdp, selector) {
  await cdp.send('DOM.enable').catch(() => {});
  await cdp.send('CSS.enable').catch(() => {});
  const doc = await cdp.send('DOM.getDocument', { depth: 0 });
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector });
  if (!nodeId) return { selector, error: 'not found' };
  const r = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  return { selector, fonts: r.fonts.map((f) => ({ family: f.familyName, glyphCount: f.glyphCount })) };
}

/* --------------------------------------------------------- main audit runner */
(async () => {
  log('== P3 clinic a11y/Arabic audit runner ==');
  const started = Date.now();

  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1'],
  });
  log('chrome on port ' + chrome.port);
  const targets = await (await fetch(`http://127.0.0.1:${chrome.port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  const cdp = new CDP(ws);
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable'), cdp.send('Network.enable')]);

  const summary = {
    generatedAt: new Date().toISOString(), base: BASE, axeTags: AXE_TAGS,
    axeVersion: JSON.parse(fs.readFileSync(path.join('D:/my work/p1-fashion-store/node_modules/axe-core/package.json'), 'utf8')).version,
    pages: [], viewports: VIEWPORTS,
  };

  for (const vp of VIEWPORTS) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.mobile });
    if (vp.mobile) await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    console.log(`-- viewport ${vp.name} ${vp.w}x${vp.h}`);
    for (const pg of PAGES) {
      const t0 = Date.now();
      console.log(`  -> ${pg.id} ${pg.url}`);
      await cdp.navigate(pg.url, 1300);
      await scrollThrough(cdp);

      const probe = await cdp.evalExpr(`(${PROBE.toString()})()`);
      write(`probe-${pg.id}-${vp.name}.json`, { page: pg.id, url: pg.url, viewport: vp, probe });

      const axe = await runAxeInPage(cdp);
      write(`axe-${pg.id}-${vp.name}.json`, { page: pg.id, url: pg.url, viewport: vp, ...axe });
      summary.pages.push({
        page: pg.id, viewport: vp.name, ms: Date.now() - t0,
        ...axe.violationCounts,
        rules: axe.violations.map((v) => `${v.id}(${v.impact},${v.nodes})`),
        incomplete: axe.incomplete.map((i) => `${i.id}(${i.nodes})`),
        h1: probe.h1Count, headingSkips: probe.headingSkips.length,
        unlabelled: probe.unlabelled, overflowX: !!probe.overflowX,
        revealHidden: probe.reveal.hiddenNow, jsMotion: probe.reveal.jsMotion,
      });
      console.log(`      axe: ${axe.violationCounts.total} rules / ${axe.violationCounts.nodes} nodes (${axe.violationCounts.critical}c ${axe.violationCounts.serious}s ${axe.violationCounts.moderate}m ${axe.violationCounts.minor}mi) [${Date.now() - t0}ms]`);

      if (vp.name === 'mobile') {
        const small = probe.targets.filter((t) => t.w < 24 || t.h < 24);
        write(`targets-${pg.id}-390.json`, {
          page: pg.id, totalInteractive: probe.targetTotal, measured: probe.targets.length,
          below24raw: small.length,
          minW: Math.min(...probe.targets.map((t) => t.w)),
          minH: Math.min(...probe.targets.map((t) => t.h)),
          below24: small,
          all: probe.targets,
        });
      }

      await cdp.shot(`${pg.id}-${vp.w}.png`);
      await cdp.shot(`${pg.id}-${vp.w}-full.png`, true);
      if (vp.name === 'mobile') {
        // nav state detail for mobile pages
        write(`nav-${pg.id}-390.json`, { page: pg.id, nav: probe.nav, overflowX: probe.overflowX });
      }
    }
  }

  /* ---- 1024 spot check (screenshots only) ---- */
  console.log('-- 1024 spot check');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
  for (const pg of PAGES) {
    await cdp.navigate(pg.url, 1200);
    await scrollThrough(cdp);
    await cdp.shot(`${pg.id}-1024.png`);
  }

  /* ---- real font evidence (desktop, home) ---- */
  log('-- platform fonts');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.navigate(`${BASE}/`, 1500);
  const fonts = {
    h1: await platformFonts(cdp, '.hero h1'),
    bodyArabic: await platformFonts(cdp, '.hero .lead'),
    servicePrice: await platformFonts(cdp, '.svc-meta'),
    documentFonts: await cdp.evalExpr(`(async () => {
      await document.fonts.ready;
      const loaded = [...document.fonts].map(f => ({ family: f.family, weight: f.weight, status: f.status }));
      return {
        readyStatus: document.fonts.status,
        alexandria400: document.fonts.check('16px Alexandria'),
        alexandria700: document.fonts.check('bold 16px Alexandria'),
        faces: loaded.slice(0, 20),
        stackBody: getComputedStyle(document.body).fontFamily.split(',').slice(0, 3),
      };
    })()`),
  };
  write('fonts-platform.json', fonts);
  console.log('  fonts h1: ' + JSON.stringify(fonts.h1));

  write('axe-summary.json', summary);
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  ws.close();
  await chrome.kill();
  console.log(`done in ${Math.round((Date.now() - started) / 1000)}s`);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
