#!/usr/bin/env node
/**
 * Follow-up evidence:
 *  a) axe target-size (WCAG 2.2 2.5.8) detail on /shop/ (passes/inapplicable + rule nodes)
 *  b) contrast recompute for the 3 pairs axe/my parser could not parse (CSS color() syntax)
 *  c) skip-link focused-state size + focus indicator styles
 *  d) product page image alt detail (1 empty alt)
 * Writes: followup-shop-targetsize.json, contrast-color-syntax-v2.json,
 *         followup-skiplink-focus.json, followup-product-images.json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..');
const AXE_SRC = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const chromeLauncher = require('chrome-launcher');
const WebSocket = require('ws');
const BASE = 'http://localhost:8888';

const write = (name, data) => {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 1));
  console.log('wrote ' + name);
};

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = new Map();
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      } else if (m.method) (this.listeners.get(m.method) || []).forEach((f) => f(m.params));
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); });
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
}
async function navigate(cdp, url, settle = 2000) {
  const loading = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url });
  await Promise.race([loading, new Promise((r) => setTimeout(r, 60000))]);
  await new Promise((r) => setTimeout(r, settle));
}
async function injectAxe(cdp) {
  if ((await cdp.evalExpr('typeof window.axe')) !== 'object') {
    await cdp.send('Runtime.evaluate', { expression: AXE_SRC, returnByValue: false });
  }
}

const COLOR_PAIRS = [
  { sel: '.tile span', fallbackAncestors: [['#F1EBE0'], ['#E6EFEA'], ['#ECE7EE'], ['#F2E7DD']] },
  { sel: '.site-header .wp-block-navigation a', fallbackAncestors: [['#FAF8F4']] },
  { sel: '.wp-block-site-title a', fallbackAncestors: [['#FAF8F4']] },
];

const parseColor = (c) => {
  const s = String(c).trim();
  let m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) { const p = m[1].split(/[,\s\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
  m = s.match(/^color\(\s*srgb\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)(?:\s*\/\s*([0-9.]+%?))?\s*\)$/);
  if (m) {
    const a = m[4] ? (String(m[4]).endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])) : 1;
    return { r: parseFloat(m[1]) * 255, g: parseFloat(m[2]) * 255, b: parseFloat(m[3]) * 255, a };
  }
  if (/^#([0-9a-f]{6})$/i.test(s)) { const n = parseInt(s.slice(1), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }; }
  return null;
};
const chan = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (c) => 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b);
const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]; return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100; };

(async () => {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars'] });
  const targets = await (await fetch(`http://127.0.0.1:${chrome.port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  const cdp = new CDP(ws);
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable'), cdp.send('Network.enable')]);

  /* a) shop target-size */
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate(cdp, `${BASE}/shop/`, 2500);
  await injectAxe(cdp);
  const ts = JSON.parse(await cdp.evalExpr(
    `(async () => {
      const r = await axe.run(document, { runOnly: { type: 'rule', values: ['target-size'] } });
      return JSON.stringify({
        violations: r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes.slice(0,5).map(n => ({ target: n.target.join(' '), html: n.html.slice(0,200), summary: (n.failureSummary||'').slice(0,300) })) })),
        passes: r.passes.map(p => ({ id: p.id, nodes: p.nodes.length, sample: p.nodes.slice(0,12).map(n => n.target.join(' ')) })),
        inapplicable: r.inapplicable.map(p => p.id),
        incomplete: r.incomplete.map(p => ({ id: p.id, nodes: p.nodes.length, sample: p.nodes.slice(0,5).map(n => n.target.join(' ')) }))
      });
    })()`
  ));
  const selectInfo = await cdp.evalExpr(
    `(() => { const s = document.querySelector('select#orderby'); if (!s) return null; const r = s.getBoundingClientRect(); return { w: Math.round(r.width*10)/10, h: Math.round(r.height*10)/10, label: (s.labels && s.labels[0] || {}).textContent }; })()`
  );
  write('followup-shop-targetsize.json', { viewport: '390x844', rule: 'target-size (WCAG 2.2 2.5.8)', orderbySelect: selectInfo, ...ts });

  /* c) skip-link focus state (home, desktop) */
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate(cdp, `${BASE}/`, 2500);
  const skip = await cdp.evalExpr(
    `(() => {
      const a = document.querySelector('.skip-link');
      const target = document.getElementById('wp--skip-link--target') || document.querySelector('main');
      const before = a ? a.getBoundingClientRect() : null;
      if (a) a.focus();
      const after = a ? a.getBoundingClientRect() : null;
      const cs = a ? getComputedStyle(a) : null;
      const out = {
        present: !!a, href: a && a.getAttribute('href'), text: a && a.textContent.trim(),
        targetExists: !!document.querySelector(a ? a.getAttribute('href') : '#none'),
        before: before && { w: Math.round(before.width), h: Math.round(before.height), x: Math.round(before.x), y: Math.round(before.y) },
        focused: after && { w: Math.round(after.width), h: Math.round(after.height), x: Math.round(after.x), y: Math.round(after.y) },
        focusedStyles: cs && { outline: cs.outline, outlineOffset: cs.outlineOffset, backgroundColor: cs.backgroundColor, color: cs.color, fontSize: cs.fontSize, position: cs.position },
        activeElementIsSkip: document.activeElement === a
      };
      if (a) a.blur();
      return out;
    })()`
  );
  // generic focus-visible ring sample: focus the first nav link and the primary button
  const focusRing = await cdp.evalExpr(
    `(() => {
      const el = document.querySelector('.site-header .wp-block-navigation a');
      if (!el) return null;
      el.focus();
      const cs = getComputedStyle(el);
      const out = { selector: 'header nav a', outline: cs.outline, outlineOffset: cs.outlineOffset, boxShadow: cs.boxShadow, color: cs.color };
      el.blur();
      const btn = document.querySelector('.hero-actions .wp-block-button__link');
      if (btn) { btn.focus(); const b = getComputedStyle(btn); out.button = { outline: b.outline, outlineOffset: b.outlineOffset, boxShadow: b.boxShadow }; btn.blur(); }
      return out;
    })()`
  );
  write('followup-skiplink-focus.json', { skipLink: skip, focusRingStyles: focusRing, note: 'programmatic focus() — keyboard Tab order verified separately via chrome-devtools MCP' });

  /* b) contrast pairs that used CSS color() syntax */
  const pairs = await cdp.evalExpr(
    `(() => {
      const visible = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      return ${JSON.stringify(COLOR_PAIRS)}.map(spec => {
        const el = document.querySelector(spec.sel);
        if (!el || !visible(el)) return { sel: spec.sel, found: false };
        const cs = getComputedStyle(el);
        let node = el, layers = [];
        while (node && node !== document.documentElement) {
          const c = getComputedStyle(node);
          if (c.backgroundColor && c.backgroundColor !== 'rgba(0, 0, 0, 0)' && c.backgroundColor !== 'transparent') layers.push({ cls: (node.className||'').toString().slice(0,40), color: c.backgroundColor, image: c.backgroundImage !== 'none' });
          node = node.parentElement;
        }
        return { sel: spec.sel, found: true, text: (el.textContent||'').trim().slice(0,40), fg: cs.color, fontSize: parseFloat(cs.fontSize), fontWeight: Number(cs.fontWeight)||400, layers, ancestorFallbacks: spec.fallbackAncestors };
      });
    })()`
  );
  const recomputed = pairs.map((p) => {
    if (!p.found) return p;
    const fg = parseColor(p.fg);
    // composite the layer stack over the fallback backdrop(s); take the worst-case ratio
    const layerColors = p.layers.map((l) => parseColor(l.color)).filter(Boolean);
    const fallbacks = p.ancestorFallbacks.map((f) => parseColor(f[0]));
    let worst = null;
    const backdrops = fallbacks.length ? fallbacks : [{ r: 250, g: 248, b: 244, a: 1 }];
    for (const bd of backdrops) {
      let cur = bd;
      for (let i = layerColors.length - 1; i >= 0; i--) cur = blend(layerColors[i], cur);
      const r = ratio(fg, cur);
      worst = worst === null ? { ratio: r, backdrop: cur } : (r < worst.ratio ? { ratio: r, backdrop: cur } : worst);
    }
    const large = p.fontSize >= 24 || (p.fontSize >= 18.66 && p.fontWeight >= 700);
    const need = large ? 3 : 4.5;
    return { ...p, computed: { ratio: worst.ratio, backdrop: worst.backdrop, required: need, verdict: worst.ratio >= need ? 'PASS' : 'FAIL', method: 'composite ancestor color() layers over known theme backdrop' } };
  });
  write('contrast-color-syntax-v2.json', recomputed);

  /* d) product page images */
  await navigate(cdp, `${BASE}/product/linen-scarf/`, 2500);
  const imgs = await cdp.evalExpr(
    `(() => [...document.images].map(i => ({ alt: i.getAttribute('alt'), hasAlt: i.hasAttribute('alt'), src: (i.currentSrc||i.src).split('/').pop().slice(0,50), w: Math.round(i.getBoundingClientRect().width), h: Math.round(i.getBoundingClientRect().height), cls: (i.className||'').slice(0,50) })))()`
  );
  write('followup-product-images.json', imgs);

  ws.close();
  await chrome.kill();
  console.log('done');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
