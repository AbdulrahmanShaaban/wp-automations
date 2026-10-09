'use strict';
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(__dirname, '..');
const pages = ['/', '/services/', '/team/', '/contact/', '/book/'];
const Q = '"';
(async () => {
  const out = { generatedAt: new Date().toISOString(), pages: {} };
  for (const p of pages) {
    const r = await fetch('http://localhost:8889' + p);
    const html = await r.text();
    fs.mkdirSync(path.join(OUT, 'html'), { recursive: true });
    fs.writeFileSync(path.join(OUT, 'html', p === '/' ? 'home' : p.replace(/\//g, '') + '.html'), html, 'utf8');
    const i = html.indexOf('<div class=' + Q + 'siraj-booking' + Q);
    const seg = i >= 0 ? html.slice(i, html.indexOf('</form>', i) + 7) : '';
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z#0-9]+;/gi, ' ');
    const eastern = (text.match(/[\u0660-\u0669\u06F0-\u06F9]/g) || []).length;
    const western = (text.match(/[0-9]/g) || []).length;
    const arComma = (text.match(/\u060C/g) || []).length;
    const westernCommaAr = (text.match(/[\u0600-\u06FF],\s*[\u0600-\u06FF]/g) || []).length;
    const latCommaBetweenAr = (text.match(/[\u0600-\u06FF]\s*,\s*[\u0600-\u06FF]/g) || []).length;
    out.pages[p] = {
      status: r.status, htmlLength: html.length,
      formPresent: i >= 0,
      formHasNonce: seg.includes('_wpnonce'),
      formHasReferer: seg.includes('_wp_http_referer'),
      hiddenInputs: seg.match(/<input[^>]*type="hidden"[^>]*>/g) || [],
      formTail: seg.slice(-380),
      easternDigits: eastern, westernDigits: western,
      arabicComma: arComma, westernCommaBetweenArabic: westernCommaAr, anyLatinCommaBetweenArabic: latCommaBetweenAr,
      // CTA inventory: every link's accessible name vs its href
      links: [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => {
        const attrs = m[1];
        const href = (attrs.match(/href="([^"]*)"/) || [])[1];
        const inner = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const aria = (attrs.match(/aria-label="([^"]*)"/) || [])[1];
        const title = (attrs.match(/title="([^"]*)"/) || [])[1];
        return { href, name: aria || title || inner.slice(0, 46) };
      }),
      skipLinkText: (html.match(/class="skip-link[^"]*"[^>]*>([\s\S]*?)</) || [])[1] || null,
      hasNoscript: /<noscript/i.test(html),
      searchControl: /type="search"|role="search"|wp-block-search/.test(html),
      sliders: (html.match(/swiper|carousel|slick|slider|slider-container/g) || []).length,
    };
  }
  // CTA honesty cross-check on /book/
  fs.writeFileSync(path.join(OUT, 'probes', 'cta-inventory.json'), JSON.stringify(out, null, 1), 'utf8');
  for (const [p, d] of Object.entries(out.pages)) {
    console.log(`${p}  nonce=${d.formHasNonce} referer=${d.formHasReferer} eastern=${d.easternDigits} western=${d.westernDigits} arComma=${d.arabicComma} wCommaAr=${d.anyLatinCommaBetweenArabic} search=${d.searchControl} sliders=${d.sliders}`);
  }
  console.log('\n-- distinct (label -> href) pairs --');
  const m = new Map();
  for (const [p, d] of Object.entries(out.pages)) for (const l of d.links) {
    const k = l.name + ' -> ' + l.href;
    if (!m.has(k)) m.set(k, new Set());
    m.get(k).add(p);
  }
  for (const [k, v] of [...m.entries()].sort()) console.log('  ' + k + '   {' + [...v].join(',') + '}');
  console.log('\n-- book form hidden inputs --');
  console.log(out.pages['/book/'].hiddenInputs.join('\n'));
  console.log('\n-- book form tail --');
  console.log(out.pages['/book/'].formTail);
})();