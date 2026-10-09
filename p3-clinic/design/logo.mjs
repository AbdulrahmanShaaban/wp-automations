// logo.mjs — generates the brand mark and favicon (design/img/logo-mark.svg,
// design/img/favicon.svg). Run: node design/logo.mjs
//
// Why a drawn mark and not a stock logo: the clinic is fictional, so a real practice's
// logo would be someone else's trademark. «سراج» means a lamp/light, so the mark is a
// tooth (white, from the verified tooth outline in make-art.mjs) with three light rays
// breaking out of the top-right corner — tooth + light in one glyph.
//   node design/logo.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'img');
mkdirSync(OUT, { recursive: true });

const BLUE = '#2F4BD8'; // palette A primary (design/APPROVED.md)
const WHITE = '#FFFFFF';

const TOOTH =
  'M112 62c18-9 78-9 96 0 20 10 24 56 14 88-8 26-22 32-26 48-4 19-11 46-21 50-10 4-18-8-20-30-2-18-6-25-10-25s-8 7-10 25c-2 22-10 34-20 30-10-4-17-31-21-50-4-16-18-22-26-48-10-32-6-78 14-88z';

// three rays leaving the crown: short, thick, round-capped — they must still read at 16px
const RAYS = [
  'M206 84l30-26',
  'M232 106l40-6',
  'M196 62l14-38',
];

const rays = (opacity) =>
  RAYS.map(
    (d) =>
      `  <path d="${d}" stroke="${WHITE}" stroke-width="14" stroke-linecap="round" opacity="${opacity}"/>`
  ).join('\n');

const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" width="320" height="320" role="img" aria-label="شعار عيادة سِراج للأسنان">
  <title>شعار عيادة سِراج للأسنان</title>
  <rect width="320" height="320" rx="84" fill="${BLUE}"/>
${rays('.7')}
  <g transform="translate(160 176) scale(1.24) translate(-160 -160)">
    <path d="${TOOTH}" fill="${WHITE}"/>
  </g>
</svg>
`;

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" width="320" height="320" role="img" aria-label="سِراج">
  <title>سِراج</title>
  <rect width="320" height="320" rx="72" fill="${BLUE}"/>
${rays('.75')}
  <g transform="translate(160 176) scale(1.3) translate(-160 -160)">
    <path d="${TOOTH}" fill="${WHITE}"/>
  </g>
</svg>
`;

writeFileSync(join(OUT, 'logo-mark.svg'), mark, 'utf8');
writeFileSync(join(OUT, 'favicon.svg'), favicon, 'utf8');
console.log('wrote img/logo-mark.svg');
console.log('wrote img/favicon.svg');