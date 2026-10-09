// find-overflow.js — list elements wider than the viewport (RTL overflow bugs)
//   node scripts/find-overflow.js <fileUrl> [width]
'use strict';

const puppeteer = require('puppeteer-core');

const target = process.argv[2];
const width = parseInt(process.argv[3] || '390', 10);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--disable-gpu', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width, height: 900 });
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });
  // Web fonts change text metrics — measuring before they load hides overflow
  // that the screenshot (which awaits document.fonts.ready) then shows.
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 800));
  const info = await page.evaluate((vw) => {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.position === 'fixed') continue;
      if (r.right > vw + 0.5 || r.left < -0.5) {
        // ignore elements inside a horizontal scroll container on purpose
        let scroller = el.parentElement;
        let inScroller = false;
        while (scroller && scroller !== document.body) {
          const s = getComputedStyle(scroller);
          if (s.overflowX === 'auto' || s.overflowX === 'scroll') {
            inScroller = true;
            break;
          }
          scroller = scroller.parentElement;
        }
        if (inScroller) continue;
        out.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className && String(el.className).slice(0, 60)) || '',
          left: Math.round(r.left),
          right: Math.round(r.right),
          w: Math.round(r.width),
        });
      }
    }
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      offenders: out.slice(0, 12),
    };
  }, width);
  console.log('scrollWidth=' + info.scrollWidth + ' clientWidth=' + info.clientWidth);
  if (info.offenders.length === 0) console.log('no overflowing elements outside scrollers');
  for (const o of info.offenders) {
    console.log('  ' + o.tag + (o.cls ? '.' + o.cls.replace(/\s+/g, '.') : '') +
      ' left=' + o.left + ' right=' + o.right + ' w=' + o.w);
  }
  await browser.close();
})();
