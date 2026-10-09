/**
 * Manual colour-contrast sampling for the axe `color-contrast` INCOMPLETE nodes
 * (the `.note.paper` prescription card, whose background is a repeating
 * linear-gradient so axe refuses to guess).
 *
 * Method: for each target we (a) hide the glyphs with colour:transparent,
 * (b) capture a real screenshot clipped to the element, (c) decode the PNG in
 * Node and take the min-luma and max-luma background pixels actually painted,
 * (d) restore, then compute the WCAG 2.x ratio of the element's own computed
 * colour against those measured backgrounds and report the worst case.
 *
 * This is measurement only: it never writes to the site's files.
 */
'use strict';

const zlib = require('zlib');
const path = require('path');
const L = require('./lib.js');

/** Minimal PNG decoder: 8-bit RGB/RGBA, no interlace (CDP emits exactly this). */
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let off = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8) throw new Error('bitDepth ' + bitDepth);
      if (data[12] !== 0) throw new Error('interlaced');
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!ch) throw new Error('colorType ' + colorType);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * ch;
  const out = Buffer.alloc(height * stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const line = raw.slice(p, p + stride);
    p += stride;
    const cur = out.slice(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0;
      const b = prev[x];
      const c = x >= ch ? prev[x - ch] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 0xff;
    }
  }
  return { width, height, ch, data: out };
}

const relLum = (r, g, b) => {
  const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const l1 = relLum(a[0], a[1], a[2]);
  const l2 = relLum(b[0], b[1], b[2]);
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
};
const hex = (c) => '#' + [c[0], c[1], c[2]].map((n) => n.toString(16).padStart(2, '0').toUpperCase()).join('');

(async () => {
  const { chrome, cdp, chromeVersion } = await L.launch();
  const out = { generatedAt: new Date().toISOString(), chrome: chromeVersion, method: 'pixel-sampled backgrounds + WCAG 2.x relative-luminance ratio', targets: [] };

  for (const vp of ['1440', '390']) {
    await L.setViewport(cdp, vp);
    await L.nav(cdp, L.BASE + '/');
    await cdp.evalExpr(L.SCROLL_ALL);
    await new Promise((r) => setTimeout(r, 900));

    const targets = await cdp.evalExpr(`(() => {
      const sels = ['aside > .sec-num','aside > h2','.note-list > li:nth-child(1) > span',
        '.note-list > li:nth-child(2)','.note-list > li:nth-child(2) > span',
        '.note-list > li:nth-child(3) > span','.stamp'];
      return sels.map(function (s) {
        const el = document.querySelector(s);
        if (!el) return { sel: s, missing: true };
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return { sel: s, text: el.textContent.trim().slice(0, 40),
          color: cs.color, fontSize: cs.fontSize, fontWeight: cs.fontWeight,
          bgImage: getComputedStyle(el).backgroundImage,
          parentBg: getComputedStyle(el.parentElement).backgroundColor,
          clipped: getComputedStyle(el).clipPath + '|' + getComputedStyle(el).clip,
          rect: { x: Math.max(0, r.left), y: Math.max(0, r.top), w: r.width, h: r.height,
                  docY: r.top + scrollY } };
      });
    })()`);

    for (const t of targets) {
      if (t.missing) continue;
      const clip = { x: t.rect.x, y: t.rect.y, width: Math.max(1, t.rect.w), height: Math.max(1, t.rect.h), scale: 1 };
      // 1) hide glyphs so we sample the painted background only
      await cdp.evalExpr(`(() => {
        const el = document.querySelector(${JSON.stringify(t.sel)});
        if (!el) return 0;
        window.__save = el.style.cssText;
        el.dataset.__c = getComputedStyle(el).color;
        el.style.setProperty('color', 'transparent', 'important');
        el.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
        const kids = el.querySelectorAll('*');
        kids.forEach(k => k.style.setProperty('color','transparent','important'));
        return 1;
      })()`);
      await new Promise((r) => setTimeout(r, 120));
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', clip });
      const png = decodePNG(Buffer.from(data, 'base64'));
      const hist = new Map();
      let minL = Infinity, minC = null, maxL = -Infinity, maxC = null;
      for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
          const i = (y * png.width + x) * png.ch;
          const c = [png.data[i], png.data[i + 1], png.data[i + 2]];
          const key = hex(c);
          hist.set(key, (hist.get(key) || 0) + 1);
          const l = relLum(c[0], c[1], c[2]);
          if (l < minL) { minL = l; minC = c; }
          if (l > maxL) { maxL = l; maxC = c; }
        }
      }
      const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => ({ hex: k, px: n, pct: +((n / (png.width * png.height)) * 100).toFixed(1) }));
      // 2) restore
      await cdp.evalExpr(`(() => {
        const el = document.querySelector(${JSON.stringify(t.sel)});
        if (!el) return 0;
        el.style.cssText = window.__save || '';
        el.querySelectorAll('*').forEach(k => k.style.cssText = (k.dataset.__save || ''));
        return 1;
      })()`);

      const fg = t.color.match(/[\d.]+/g).map(Number);
      const rMin = ratio(fg, minC);
      const rMax = ratio(fg, maxC);
      out.targets.push({
        viewport: vp, sel: t.sel, text: t.text,
        fg: t.color, fgHex: hex(fg), fontSize: t.fontSize, fontWeight: t.fontWeight,
        declaredBgImage: t.bgImage, parentBg: t.parentBg,
        measuredBgDominant: top[0] && top[0].hex,
        measuredBgHistogram: top,
        measuredBgDarkest: hex(minC), measuredBgLightest: hex(maxC),
        ratioVsDarkest: +rMin.toFixed(2), ratioVsLightest: +rMax.toFixed(2),
        worstCaseRatio: +Math.min(rMin, rMax).toFixed(2),
        passesAA_normal: Math.min(rMin, rMax) >= 4.5,
        passesAA_large: Math.min(rMin, rMax) >= 3,
      });
      console.log(`  ${vp} ${t.sel}  fg=${hex(fg)} bg light=${hex(maxC)} dark=${hex(minC)} worst=${Math.min(rMin, rMax).toFixed(2)}`);
    }
  }

  L.write('contrast-sampled.json', out);
  cdp.ws.close();
  await chrome.kill();
  console.log('DONE');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });