/**
 * Re-encode the 4 page photos to display-size WebP (perf-seo finding M4).
 *
 * Runs in Chrome against the live origin (http://localhost:8889) so the canvas
 * is not tainted, scales each photo to 800px wide, and encodes WebP at q=0.72.
 * Originals are kept on disk as the source of truth (no git here); the page
 * only ever references the .webp files afterwards.
 *
 * Usage: node scripts/optimize-images.js
 * Output: wp-content/themes/siraj-theme/assets/img/<name>.webp + a JSON report.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const chromeLauncher = require(path.join('D:/my work/p1-fashion-store/node_modules/chrome-launcher'));
const WebSocket = require(path.join('D:/my work/p1-fashion-store/node_modules/ws'));

const BASE = 'http://localhost:8889';
const IMG_DIR = path.join(__dirname, '..', 'wp-content', 'themes', 'siraj-theme', 'assets', 'img');
const NAMES = ['photo-instruments', 'photo-stilllife', 'photo-implant', 'photo-lounge'];
const TARGET_W = 800;
const QUALITY = 0.72;

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) rej(new Error(m.error.message));
        else res(m.result);
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
  async evalExpr(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500));
    return r.result.value;
  }
}

async function main() {
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  const targets = await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('CDP timeout')), 20000);
    fetch(`http://127.0.0.1:${chrome.port}/json/list`)
      .then((r) => r.json())
      .then((list) => { clearTimeout(t); res(list); })
      .catch((e) => { clearTimeout(t); rej(e); });
  });
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((res) => ws.once('open', res));
  const cdp = new CDP(ws);

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: `${BASE}/` });
  await new Promise((r) => setTimeout(r, 2500));

  const report = [];
  for (const name of NAMES) {
    const src = `${BASE}/wp-content/themes/siraj-theme/assets/img/${name}.jpg`;
    const result = await cdp.evalExpr(`(async () => {
      const img = new Image();
      img.src = ${JSON.stringify(src)};
      await img.decode();
      const w = ${TARGET_W};
      const h = Math.round(img.naturalHeight * (w / img.naturalWidth));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/webp', ${QUALITY});
      return { nw: img.naturalWidth, nh: img.naturalHeight, w, h, dataUrl };
    })()`);

    const b64 = result.dataUrl.split(',')[1];
    const buf = Buffer.from(b64, 'base64');
    if (!buf.length || buf.slice(0, 4).toString('ascii') !== 'RIFF') {
      throw new Error(`${name}: encoder did not return WebP`);
    }
    fs.writeFileSync(path.join(IMG_DIR, `${name}.webp`), buf);
    const before = fs.statSync(path.join(IMG_DIR, `${name}.jpg`)).size;
    report.push({
      name,
      natural: `${result.nw}x${result.nh}`,
      out: `${result.w}x${result.h}`,
      jpgBytes: before,
      webpBytes: buf.length,
      savedBytes: before - buf.length,
      savedPct: Math.round((1 - buf.length / before) * 100),
    });
    console.log(
      `${name}: ${result.nw}x${result.nh} -> ${result.w}x${result.h} | ${before} -> ${buf.length} (-${report[report.length - 1].savedPct}%)`
    );
  }

  const totals = report.reduce(
    (a, r) => ({ jpgBytes: a.jpgBytes + r.jpgBytes, webpBytes: a.webpBytes + r.webpBytes }),
    { jpgBytes: 0, webpBytes: 0 }
  );
  console.log(`TOTAL: ${totals.jpgBytes} -> ${totals.webpBytes} (saved ${totals.jpgBytes - totals.webpBytes} bytes)`);
  fs.writeFileSync(path.join(IMG_DIR, 'optimize-report.json'), JSON.stringify({ targetW: TARGET_W, quality: QUALITY, report, totals }, null, 2));

  ws.close();
  await chrome.kill();
}

main().catch((e) => { console.error(e); process.exit(1); });
