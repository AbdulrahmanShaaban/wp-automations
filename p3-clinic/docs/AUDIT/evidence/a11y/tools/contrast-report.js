'use strict';
const d = require('../contrast-sampled.json');
const relLum = (r, g, b) => {
  const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => { const l1 = relLum(...a), l2 = relLum(...b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return +(((hi + 0.05) / (lo + 0.05)).toFixed(2)); };
const unhex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

console.log('token checks:');
console.log('  #F7F8FC (--bg)      vs #FFFFFF =', ratio(unhex('#F7F8FC'), unhex('#FFFFFF')));
console.log('  --primary #2F4BD8   vs #F7F8FC =', ratio(unhex('#2F4BD8'), unhex('#F7F8FC')));
console.log('  --primary #2F4BD8   vs #FFFFFF =', ratio(unhex('#2F4BD8'), unhex('#FFFFFF')));
console.log('  --muted   #555878    vs #F7F8FC =', ratio(unhex('#555878'), unhex('#F7F8FC')));
console.log('  --muted   #555878    vs #FFFFFF =', ratio(unhex('#555878'), unhex('#FFFFFF')));
console.log('  --accent  #A3231B    vs #F7F8FC =', ratio(unhex('#A3231B'), unhex('#F7F8FC')));
console.log('  --accent  #A3231B    vs #FFFFFF =', ratio(unhex('#A3231B'), unhex('#FFFFFF')));
console.log('  --text    #12132B    vs #F7F8FC =', ratio(unhex('#12132B'), unhex('#F7F8FC')));
console.log('  ruled line #E8EBF9   vs #F7F8FC =', ratio(unhex('#E8EBF9'), unhex('#F7F8FC')));
console.log('  primary 7% over #F7F8FC ->', (() => {
  const p = unhex('#2F4BD8'), b = unhex('#F7F8FC');
  return '#' + [0, 1, 2].map((i) => Math.round(p[i] * 0.07 + b[i] * 0.93).toString(16).padStart(2, '0')).join('').toUpperCase();
})());
console.log('');
for (const t of d.targets.filter((x) => x.viewport === '1440')) {
  const fg = unhex(t.fgHex);
  const dom = unhex(t.measuredBgDominant);
  const ruled = unhex('#E8EBF9');
  console.log(
    t.sel.padEnd(34),
    'fg', t.fgHex, t.fontSize.padStart(6), (t.fontWeight >= 700 || parseFloat(t.fontSize) >= 24 ? 'large(>=24px or bold>=18.66px)' : 'normal'),
    '| vs dominant', t.measuredBgDominant, ratio(fg, dom),
    '| vs ruled line #E8EBF9', ratio(fg, ruled),
  );
}