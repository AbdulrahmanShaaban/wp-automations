#!/usr/bin/env node
/**
 * Visual verification WITHOUT the (unreliable) image viewer: decode key
 * screenshots with the minimal PNG decoder from contrast.js and answer
 * concrete pixel questions:
 *   1. Is the skip link painted in kb-01 / home-1440 (white box + red
 *      outline rgb(163,35,27) at 4,4..189,52)?
 *   2. Which page do the A4B56E05 hash-group shots actually show
 *      (red-pixel fingerprint: home = many red accents, team = few)?
 *   3. Does booking-1440-invalid.png show the red error summary + field
 *      errors (red-ish pixel counts by region)?
 *   4. Are booking-390-invalid-values-retained / contact-1440 / home-390
 *      non-blank and plausible (brightness variance + accent counts)?
 * Writes visual-verify.json
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const OUT = path.join(__dirname, '..');
const SCREENS = path.join(OUT, 'screens');

function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let off = 8, w = 0, h = 0, ch = 4;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IHDR') {
      w = buf.readUInt32BE(off + 8); h = buf.readUInt32BE(off + 12);
      const depth = buf[off + 16], color = buf[off + 17], interlace = buf[off + 20];
      if (depth !== 8 || interlace !== 0 || ![2, 6].includes(color)) throw new Error(`unsupported png depth=${depth} color=${color} interlace=${interlace}`);
      ch = color === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len));
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = ch;
  const stride = w * bpp;
  const out = Buffer.alloc(w * h * bpp);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[pos++];
    for (let x = 0; x < stride; x++) {
      const v = raw[pos++];
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = (x >= bpp && y > 0) ? out[(y - 1) * stride + x - bpp] : 0;
      let r;
      if (filter === 0) r = v;
      else if (filter === 1) r = v + a;
      else if (filter === 2) r = v + b;
      else if (filter === 3) r = v + ((a + b) >> 1);
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error('bad filter ' + filter);
      out[y * stride + x] = r & 255;
    }
  }
  return { width: w, height: h, ch: bpp, data: out };
}

const px = (img, x, y) => {
  const i = (y * img.width + x) * img.ch;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};
const isRed = ([r, g, b]) => r > 140 && r - g > 60 && r - b > 60;
const isWhite = ([r, g, b]) => r > 246 && g > 246 && b > 246;
const isDark = ([r, g, b]) => r < 90 && g < 90 && b < 110;
const near = ([r, g, b], t, tol) => Math.abs(r - t[0]) <= tol && Math.abs(g - t[1]) <= tol && Math.abs(b - t[2]) <= tol;

function stats(file) {
  const img = decodePNG(fs.readFileSync(path.join(SCREENS, file)));
  let red = 0, white = 0, dark = 0, sum = 0, sum2 = 0, n = img.width * img.height;
  for (let y = 0; y < img.height; y += 2) {
    for (let x = 0; x < img.width; x += 2) {
      const c = px(img, x, y);
      if (isRed(c)) red++;
      if (isWhite(c)) white++;
      if (isDark(c)) dark++;
      const lum = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
      sum += lum; sum2 += lum * lum;
    }
  }
  const ns = Math.ceil(img.width / 2) * Math.ceil(img.height / 2);
  const mean = sum / ns, sd = Math.sqrt(sum2 / ns - mean * mean);
  return { file, w: img.width, h: img.height, redPx: red, whitePx: white, darkPx: dark, mean: +mean.toFixed(1), sd: +sd.toFixed(1) };
}

function skipLinkProbe(file) {
  const img = decodePNG(fs.readFileSync(path.join(SCREENS, file)));
  const redOutline = [], whiteIn = [];
  for (let y = 0; y < Math.min(60, img.height); y++) {
    for (let x = 0; x < Math.min(210, img.width); x++) {
      const c = px(img, x, y);
      if (near(c, [163, 35, 27], 45)) redOutline.push([x, y]);
      if (x >= 6 && x <= 187 && y >= 6 && y <= 50 && isWhite(c)) whiteIn.push([x, y]);
    }
  }
  const box = (pts) => pts.length ? {
    count: pts.length,
    x: [Math.min(...pts.map(p => p[0])), Math.max(...pts.map(p => p[0]))],
    y: [Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[1]))],
  } : { count: 0 };
  return { file, redNearSkipBox: box(redOutline), whiteInteriorPx: whiteIn.length };
}

function regionRed(file, x0, y0, x1, y1) {
  const img = decodePNG(fs.readFileSync(path.join(SCREENS, file)));
  let red = 0, pink = 0, n = 0;
  for (let y = y0; y < Math.min(y1, img.height); y++) {
    for (let x = x0; x < Math.min(x1, img.width); x++) {
      const c = px(img, x, y); n++;
      if (isRed(c)) red++;
      if (c[0] > 245 && c[1] > 220 && c[1] < 245 && c[2] > 215 && c[2] < 243) pink++; // #FEF3F2-ish
    }
  }
  return { file, region: [x0, y0, x1, y1], n, redPx: red, pinkishPx: pink };
}

const out = { generatedAt: new Date().toISOString(), hashGroup: {}, skipLink: {}, regions: [] };

// 1. skip link presence
for (const f of ['kb-01-skip-link-focused.png', 'home-1440.png', 'kb-home-skip-link-focused.png']) {
  out.skipLink[f] = skipLinkProbe(f);
}

// 2. identity fingerprint of the A4B56E05 group + a few others
for (const f of ['home-1440.png', 'team-1440.png', 'services-1440.png', 'contact-1440.png',
  'home-390.png', 'booking-1440-invalid.png', 'booking-390-invalid-values-retained.png',
  'booking-1440-success.png', 'kb-home-focus-ring.png', 'kb-05-menu-open-390.png']) {
  out.hashGroup[f] = stats(f);
}

// 3. booking invalid: error summary box region (top of form area) + per-field errors
out.regions.push(regionRed('booking-1440-invalid.png', 340, 300, 1100, 900));
out.regions.push(regionRed('booking-390-invalid-values-retained.png', 0, 0, 390, 844));
out.regions.push(regionRed('booking-1440-success.png', 0, 60, 1440, 900));
out.regions.push(regionRed('kb-home-focus-ring.png', 0, 0, 300, 900));

fs.writeFileSync(path.join(OUT, 'visual-verify.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
