#!/usr/bin/env node
/**
 * Contrast follow-up — P3 clinic (2026-10-07).
 *
 * axe reported 7 `color-contrast` INCOMPLETE nodes on / (gradient background
 * in the .note card). This re-runs only that rule, captures every incomplete
 * node with its computed styles, and computes the contrast ratio manually
 * (worst-case band of the paper gradient) so the report can state numbers.
 *
 * Writes: contrast-incomplete-home.json, contrast-manual-home.json
 * Usage: node docs/AUDIT/evidence/a11y/tools/contrast-followup.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..');
const AXE_SRC = fs.readFileSync(path.join('D:/my work/p1-fashion-store/node_modules/axe-core/axe.min.js'), 'utf8');
const chromeLauncher = require(path.join('D:/my work/p1-fashion-store/node_modules/chrome-launcher'));
const WebSocket = require(path.join('D:/my work/p1-fashion-store/node_modules/ws'));

const BASE = 'http://localhost:8889';
const write = (name, data) => {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 1));
  console.log('  wrote ' + name);
};
const LOG = path.join(__dirname, 'contrast-followup.log');
fs.writeFileSync(LOG, `contrast-followup.js start ${new Date().toISOString()}\n`);
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
    await new Promise((r) => setTimeout(r, settle));
  }
}

const parseColor = (c) => {
  const m = String(c).match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(',').map((x) => parseFloat(x.trim()));
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
};
const chan = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (c) => 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b);
const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
const contrast = (a, b) => {
  const l1 = lum(a), l2 = lum(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
};

(async () => {
  log('== contrast follow-up ==');
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1'],
  });
  const targets = await (await fetch(`http://127.0.0.1:${chrome.port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  const cdp = new CDP(ws);
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable')]);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  await cdp.navigate(`${BASE}/`, 1800);
  await cdp.evalExpr(AXE_SRC);
  const raw = await cdp.evalExpr(`(async () => {
    const r = await axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] } });
    const slim = (list) => list.map(v => ({
      id: v.id, impact: v.impact, message: v.message,
      nodes: v.nodes.map(n => ({ target: n.target.join(' '), html: n.html.slice(0, 400), any: (n.any || []).map(a => ({ id: a.id, message: a.message, data: a.data })), failureSummary: (n.failureSummary || '').slice(0, 400) })),
    }));
    return JSON.stringify({ violations: slim(r.violations), incomplete: slim(r.incomplete), passes: slim(r.passes).length });
  })()`);
  const axeResult = JSON.parse(raw);
  write('contrast-incomplete-home.json', axeResult);
  log(`  violations=${axeResult.violations.length} incomplete=${axeResult.incomplete.length} passes=${axeResult.passes}`);

  // manual computation for every incomplete node
  const computed = await cdp.evalExpr(`(() => {
    const targets = ${JSON.stringify(axeResult.incomplete.flatMap((v) => v.nodes.map((n) => n.target)))};
    const parse = (c) => { const m = String(c).match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(',').map(x => parseFloat(x.trim())); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const chan = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (c) => 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b);
    const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
    const cr = (a, b) => { const l1 = lum(a), l2 = lum(b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100; };
    // find solid bg walking up; also record any gradient layer colors
    const bgChain = (el) => {
      const layers = []; let node = el; let solid = null;
      while (node && node !== document.documentElement) {
        const cs = getComputedStyle(node);
        const col = parse(cs.backgroundColor);
        if (col && col.a > 0) { solid = { color: col, cls: (node.className || '').toString().slice(0, 40) }; break; }
        if (cs.backgroundImage && cs.backgroundImage !== 'none') layers.push({ cls: (node.className || '').toString().slice(0, 40), image: cs.backgroundImage.slice(0, 300) });
        node = node.parentElement;
      }
      if (!solid) { const cs = getComputedStyle(document.body); solid = { color: parse(cs.backgroundColor), cls: 'body' }; }
      return { solid, layers };
    };
    const results = [];
    for (const t of targets) {
      const el = document.querySelector(t) || document.evaluate(t, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      if (!el) { results.push({ target: t, error: 'not found' }); continue; }
      const cs = getComputedStyle(el);
      const fg = parse(cs.color);
      const bg = bgChain(el);
      const fontSize = parseFloat(cs.fontSize);
      const fontWeight = Number(cs.fontWeight) || 400;
      const large = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
      // worst case: paper band = solid bg blended with the 7% primary gradient line
      const band = over({ r: 47, g: 75, b: 216, a: 0.07 }, bg.solid.color);
      results.push({
        target: t,
        text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 60),
        fg: cs.color, fgRgb: fg,
        solidBg: { color: 'rgb(' + Math.round(bg.solid.color.r) + ', ' + Math.round(bg.solid.color.g) + ', ' + Math.round(bg.solid.color.b) + ')', cls: bg.solid.cls },
        gradientLayers: bg.layers.map(l => l.cls),
        gradientBandApprox: 'rgb(' + Math.round(band.r) + ', ' + Math.round(band.g) + ', ' + Math.round(band.b) + ')',
        fontSize, fontWeight, large, required: large ? 3 : 4.5,
        ratioVsSolid: cr(fg, bg.solid.color),
        ratioVsBand: cr(fg, band),
        verdictSolid: cr(fg, bg.solid.color) >= (large ? 3 : 4.5) ? 'PASS' : 'FAIL',
        verdictBand: cr(fg, band) >= (large ? 3 : 4.5) ? 'PASS' : 'FAIL',
      });
    }
    return results;
  })()`);
  write('contrast-manual-home.json', computed);
  log('  manual: ' + computed.map((c) => `${c.target} -> solid=${c.ratioVsSolid} band=${c.ratioVsBand} ${c.verdictBand}`).join(' | '));

  ws.close();
  await chrome.kill();
  log('done');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
