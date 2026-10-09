/**
 * Shared CDP harness for the P3 accessibility + Arabic/RTL audit (2026-10-07).
 * Read-only: launches Chrome, drives pages, writes evidence JSON/PNG.
 * Never touches theme/plugin source.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const chromeLauncher = require(path.join('D:/my work/p1-fashion-store/node_modules/chrome-launcher'));
const WebSocket = require(path.join('D:/my work/p1-fashion-store/node_modules/ws'));

const BASE = 'http://localhost:8889';
const AXE_PATH = path.join('D:/my work/p1-fashion-store/node_modules/axe-core/axe.min.js');
// Resolve from this file's own location: docs/AUDIT/evidence/a11y/tools -> a11y
const OUT = path.resolve(__dirname, '..');
const AXE = fs.readFileSync(AXE_PATH, 'utf8');

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

const VIEWPORTS = {
  '1440': { width: 1440, height: 900, mobile: false },
  '1024': { width: 1024, height: 768, mobile: false },
  '390': { width: 390, height: 844, mobile: true },
};

const PAGES = [
  ['home', '/'],
  ['services', '/services/'],
  ['team', '/team/'],
  ['contact', '/contact/'],
  ['book', '/book/'],
];

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
      } else if (m.method) (this.listeners.get(m.method) || []).forEach((f) => f(m.params));
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
      arr.push(fn);
      this.listeners.set(method, arr);
    });
  }
  async evalExpr(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true, userGesture: true,
    });
    if (r.exceptionDetails) {
      throw new Error('EVAL: ' + JSON.stringify(r.exceptionDetails).slice(0, 700));
    }
    return r.result.value;
  }
}

async function launch() {
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1'],
  });
  let ver = 'unknown';
  try {
    const v = await (await fetch(`http://127.0.0.1:${chrome.port}/json/version`)).json();
    ver = v['User-Agent'] || v.Browser || 'unknown';
  } catch (e) { /* ignore */ }
  const targets = await (await fetch(`http://127.0.0.1:${chrome.port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  const cdp = new CDP(ws);
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable'), cdp.send('DOM.enable')]);
  return { chrome, cdp, chromeVersion: ver };
}

async function setViewport(cdp, key) {
  const v = VIEWPORTS[key];
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: v.width, height: v.height, deviceScaleFactor: 1, mobile: v.mobile,
  });
  if (v.mobile) {
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  } else {
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  }
}

async function setJsDisabled(cdp, disabled) {
  await cdp.send('Emulation.setScriptExecutionDisabled', { value: !!disabled });
}

async function setReducedMotion(cdp, reduce) {
  await cdp.send('Emulation.setEmulatedMedia', {
    features: reduce ? [{ name: 'prefers-reduced-motion', value: 'reduce' }] : [],
  });
}

async function waitLoad(cdp, ms = 45000) {
  const fired = cdp.once('Page.loadEventFired');
  await Promise.race([fired, new Promise((r) => setTimeout(r, ms))]);
  await new Promise((r) => setTimeout(r, 500));
}

async function nav(cdp, url, settle = 1200) {
  const l = waitLoad(cdp);
  await cdp.send('Page.navigate', { url });
  await l;
  await new Promise((r) => setTimeout(r, settle));
}

async function shot(cdp, name, sub) {
  const dir = sub ? path.join(OUT, sub) : path.join(OUT, 'screens');
  fs.mkdirSync(dir, { recursive: true });
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(dir, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  return file;
}

function write(rel, obj) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 1), 'utf8');
  console.log('  wrote ' + rel.replace(/\\/g, '/'));
  return file;
}

/** Full-document scroll so lazy/reveal content settles before probing. */
const SCROLL_ALL = `(async()=>{ const step=Math.round(innerHeight*0.8);
  for(let y=0;y<document.body.scrollHeight+step;y+=step){scrollTo(0,y);await new Promise(r=>setTimeout(r,80));}
  scrollTo(0,0); await new Promise(r=>setTimeout(r,200)); return document.body.scrollHeight; })()`;

async function runAxe(cdp) {
  const already = await cdp.evalExpr('typeof window.axe');
  const src = AXE.length;
  if (already !== 'object') {
    const inj = await cdp.send('Runtime.evaluate', { expression: AXE, returnByValue: false });
    if (inj.exceptionDetails) throw new Error('axe inject failed: ' + JSON.stringify(inj.exceptionDetails).slice(0, 400));
  }
  const res = await cdp.evalExpr(`(async function () {
  const r = await axe.run(document, {
    runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} }
  });
  function pick(a) {
    return (a || []).map(function (v) {
      return {
        id: v.id, impact: v.impact, tags: v.tags, description: v.description,
        help: v.help, helpUrl: v.helpUrl,
        nodes: v.nodes.map(function (n) {
          return {
            target: n.target, impact: n.impact, html: (n.html || '').slice(0, 400),
            failureSummary: n.failureSummary,
            any: (n.any || []).map(function (c) { return { id: c.id, msg: (c.message || '').slice(0, 600) }; }),
            all: (n.all || []).map(function (c) { return { id: c.id, msg: (c.message || '').slice(0, 600) }; }),
            none: (n.none || []).map(function (c) { return { id: c.id, msg: (c.message || '').slice(0, 600) }; })
          };
        })
      };
    });
  }
  return {
    axeVersion: axe.version,
    url: r.url, timestamp: r.timestamp,
    violations: pick(r.violations), incomplete: pick(r.incomplete),
    passCount: (r.passes || []).length,
    inapplicableCount: (r.inapplicable || []).length,
    testEngine: r.testEngine, testRunner: r.testRunner, testEnvironment: r.testEnvironment
  };
})()`);
  return { bytes: src, ...res };
}

/** Structural / AR probe used on every page and viewport. */
const PROBE = `(() => {
  const vis = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const de = document.documentElement;
  const heads = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(h => ({ lvl: +h.tagName[1], t: h.textContent.trim().slice(0,40) }));
  const img = [...document.querySelectorAll('img')];
  const latinOnly = (s) => /^[A-Za-z0-9\\s.,:;·/()\\-–—+%#@&'"]*$/.test(s);
  // every element whose own text has BOTH Arabic and Latin and is not isolated
  const mixed = [...document.querySelectorAll('body *')].filter(el => {
    if (el.closest('script,style,noscript,svg,template')) return false;
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue.trim()).join(' ').trim();
    if (!own) return false;
    const hasAr = /[\\u0600-\\u06FF]/.test(own);
    const hasLat = /[A-Za-z]/.test(own);
    return hasAr && hasLat;
  }).slice(0, 25).map(el => {
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue.trim()).join(' ').trim();
    const s = cs(el);
    return { sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : ''),
      text: own.slice(0,70), dir: el.getAttribute('dir'), lang: el.getAttribute('lang'),
      unicodeBidi: s.unicodeBidi, isolation: s.isolation };
  });
  const latinRuns = [...document.querySelectorAll('body *')].filter(el => {
    if (el.closest('script,style,noscript,svg,template')) return false;
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue.trim()).join(' ');
    return latinOnly(own) && /[A-Za-z]/.test(own) && own.trim();
  }).slice(0, 25).map(el => ({
    sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : ''),
    text: el.textContent.trim().slice(0,40), lang: el.getAttribute('lang'),
    dir: el.getAttribute('dir'), bdi: !!el.closest('bdi')
  }));
  const bodyCs = cs(document.body);
  const h1cs = document.querySelector('h1') ? cs(document.querySelector('h1')) : null;
  const allText = (document.body.innerText || '');
  const eastern = (allText.match(/[\\u0660-\\u0669\\u06F0-\\u06F9]/g) || []).length;
  const western = (allText.match(/[0-9]/g) || []).length;
  const arComma = (allText.match(/\\u060C/g) || []).length;
  const latCommaBetweenAr = (allText.match(/[\\u0600-\\u06FF],\\s*[\\u0600-\\u06FF]/g) || []).length;
  const justified = [...document.querySelectorAll('p,li,div,span,h1,h2,h3,td,th,a,summary,label')].filter(el => {
    const s = cs(el); return s && s.textAlign === 'justify';
  }).length;
  // letter-spacing on Arabic-bearing text nodes
  const spaced = [...document.querySelectorAll('body *')].filter(el => {
    if (el.closest('script,style,noscript,svg,template')) return false;
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue).join('');
    if (!/[\\u0600-\\u06FF]/.test(own)) return false;
    const s = cs(el);
    const ls = s.letterSpacing;
    if (!ls || ls === 'normal') return false;
    return parseFloat(ls) !== 0;
  }).slice(0, 12).map(el => ({ sel: el.tagName.toLowerCase() + '.' + (typeof el.className === 'string' ? el.className.trim().split(/\\s+/)[0] : ''),
    letterSpacing: cs(el).letterSpacing, fontSize: cs(el).fontSize, text: el.textContent.trim().slice(0,30) }));
  const fonts = [];
  try { document.fonts.forEach(f => fonts.push(f.family + ' ' + f.weight + ' ' + f.status)); } catch (e) {}
  const overflow = [...document.querySelectorAll('body *')].filter(el => {
    const r = el.getBoundingClientRect();
    return vis(el) && r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
  }).slice(0, 12).map(el => ({ sel: el.tagName.toLowerCase() + '.' + (typeof el.className === 'string' ? el.className.trim().split(/\\s+/)[0] : ''),
    rect: (() => { const r = el.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) }; })() }));
  return {
    url: location.pathname, dir: de.getAttribute('dir'), lang: de.getAttribute('lang'),
    docDirCss: cs(de).direction, htmlClasses: de.className,
    title: document.title,
    headings: heads, h1Count: document.querySelectorAll('h1').length,
    headingSkips: heads.filter((h,i) => i>0 && h.lvl - heads[i-1].lvl > 1).map((h,i) => h.lvl + ':' + h.t),
    landmarks: {
      banner: document.querySelectorAll('header,[role=banner]').length,
      nav: document.querySelectorAll('nav,[role=navigation],.wp-block-navigation').length,
      main: document.querySelectorAll('main,[role=main]').length,
      contentinfo: document.querySelectorAll('footer,[role=contentinfo]').length,
      aside: document.querySelectorAll('aside,[role=complementary]').length
    },
    skipLinks: [...document.querySelectorAll('a[href^="#"]')].filter(a => /skip|تخطي|tjump/i.test(a.className + ' ' + a.textContent)).map(a => ({ href: a.getAttribute('href'), text: a.textContent.trim(), cls: a.className })),
    bodyFont: bodyCs.fontFamily, bodyFontSize: bodyCs.fontSize, bodyLineHeight: bodyCs.lineHeight,
    bodyLetterSpacing: bodyCs.letterSpacing,
    h1LineHeight: h1cs ? h1cs.lineHeight : null, h1FontSize: h1cs ? h1cs.fontSize : null,
    h1LetterSpacing: h1cs ? h1cs.letterSpacing : null,
    imgs: img.length, imgsNoAlt: img.filter(i => !i.hasAttribute('alt')).length,
    imgsBroken: img.filter(i => i.complete && i.naturalWidth === 0).map(i => i.currentSrc || i.src),
    imgsNoDims: img.filter(i => !i.getAttribute('width') && !i.getAttribute('height')).length,
    emptyAltNonDecorative: img.filter(i => i.getAttribute('alt') === '' && i.getAttribute('role') !== 'presentation').length,
    figures: document.querySelectorAll('figure').length,
    mixedNodes: mixed, mixedCount: mixed.length,
    latinRuns, latinRunCount: latinRuns.length, bdiCount: document.querySelectorAll('bdi').length,
    langEnCount: document.querySelectorAll('[lang="en"]').length, langEnValues: [...document.querySelectorAll('[lang]')].map(e => e.getAttribute('lang')),
    justifiedCount: justified,
    letterSpacedArabic: spaced,
    easternDigits: eastern, westernDigits: western,
    arabicComma: arComma, westernCommaBetweenArabic: latCommaBetweenAr,
    fonts,
    scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    overflowEls: overflow,
    revealTotal: document.querySelectorAll('.reveal').length,
    revealHidden: [...document.querySelectorAll('.reveal')].filter(el => {
      const s = cs(el); return s && parseFloat(s.opacity) < 0.99;
    }).length,
    tables: document.querySelectorAll('table').length,
    details: document.querySelectorAll('details').length,
    forms: document.querySelectorAll('form').length,
    iframes: document.querySelectorAll('iframe').length,
    videosNoCaptions: [...document.querySelectorAll('video')].filter(v => !v.querySelector('track')).length,
    langAttrOnHtml: de.getAttribute('lang'), bidiElements: document.querySelectorAll('[dir]').length
  };
})()`;

module.exports = {
  BASE, AXE, AXE_PATH, OUT, TAGS, VIEWPORTS, PAGES, CDP, launch, setViewport, setJsDisabled,
  setReducedMotion, waitLoad, nav, shot, write, runAxe, PROBE, SCROLL_ALL,
};