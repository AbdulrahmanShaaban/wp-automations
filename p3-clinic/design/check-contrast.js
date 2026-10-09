// check-contrast.js — WCAG contrast for the P3 design tokens.
//   node design/check-contrast.js
// Prints the ratio of every pair that matters in a palette so the values are
// measured, not guessed (web-design rule: recompute when a colour changes).
'use strict';

function srgb(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function lum(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}
function ratio(a, b) {
  const l1 = lum(a);
  const l2 = lum(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

const palettes = {
  'A — «الروشتة» clinical blue (from I, adapted)': {
    bg: '#F7F8FC', surface: '#FFFFFF', text: '#12132B', muted: '#555878',
    primary: '#2F4BD8', onPrimary: '#FFFFFF', accent: '#A3231B', border: '#E1E2EF',
    primarySoft: '#E6EAFB', success: '#15803D', danger: '#B91C1C',
  },
  'B — «العيادة الخاصة» midnight bone (from E, adapted)': {
    bg: '#0B0C10', surface: '#14161D', text: '#ECEAE4', muted: '#9EA2AE',
    primary: '#E8DCC3', onPrimary: '#14110A', accent: '#D9B26A', border: '#23262F',
    primarySoft: '#1E1D18', success: '#8FD6A8', danger: '#E9937A',
  },
  'C — «دفتر الوصفات» sand + ocean (from C, adapted)': {
    bg: '#FFF7EE', surface: '#FFFFFF', text: '#2A1A12', muted: '#6E5546',
    primary: '#0E4A6B', onPrimary: '#FFFFFF', accent: '#BE123C', border: '#F0DCC8',
    primarySoft: '#DCE9F0', success: '#15803D', danger: '#B91C1C',
  },
};

const PAIRS = [
  ['text', 'bg', 4.5, 'body text on page background'],
  ['text', 'surface', 4.5, 'body text on card'],
  ['muted', 'bg', 4.5, 'muted text on background'],
  ['muted', 'surface', 4.5, 'muted text on card'],
  ['primary', 'bg', 3, 'primary text/UI on background'],
  ['primary', 'surface', 3, 'primary text/UI on card'],
  ['onPrimary', 'primary', 4.5, 'label on primary button'],
  ['accent', 'bg', 3, 'accent on background'],
  ['border', 'bg', 1.2, 'border visibility (non-text)'],
  ['success', 'bg', 3, 'success on background'],
  ['danger', 'bg', 4.5, 'danger text on background'],
];

let failures = 0;
for (const [name, p] of Object.entries(palettes)) {
  console.log('\n=== ' + name);
  for (const [fg, bg, min, label] of PAIRS) {
    const r = ratio(p[fg], p[bg]);
    const ok = r >= min;
    if (!ok) failures += 1;
    console.log(
      '  ' + (ok ? 'PASS' : 'FAIL') + '  ' + String(r.toFixed(2)).padStart(6) +
        '  (min ' + min + ')  ' + label + '  [' + fg + ' on ' + bg + ']'
    );
  }
  // primary-soft must stay light enough for primary text to sit on it
  const soft = ratio(p.primary, p.primarySoft);
  const softOk = soft >= 4.5;
  if (!softOk) failures += 1;
  console.log(
    '  ' + (softOk ? 'PASS' : 'FAIL') + '  ' + soft.toFixed(2).padStart(6) +
      '  (min 4.5)  primary text on primary-soft chip [primary on primarySoft]'
  );
}
console.log('\n' + (failures === 0 ? 'ALL PAIRS PASS' : failures + ' FAILING PAIR(S)'));
