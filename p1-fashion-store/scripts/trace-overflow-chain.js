// trace-overflow-chain.js — print the ancestor chain (with widths) of the widest
// overflowing element, so the cause is identified instead of guessed.
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
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 700));

  const out = await page.evaluate((vw, selector) => {
    const describe = (node) => {
      const r = node.getBoundingClientRect();
      const cs = getComputedStyle(node);
      return {
        tag: node.tagName.toLowerCase(),
        cls: String(node.className || '').slice(0, 48),
        w: Math.round(r.width),
        left: Math.round(r.left),
        right: Math.round(r.right),
        padding: cs.paddingLeft + '/' + cs.paddingRight,
        margin: cs.marginLeft + '/' + cs.marginRight,
        width: cs.width,
        maxWidth: cs.maxWidth,
        overflowX: cs.overflowX,
        display: cs.display,
        gtc: cs.gridTemplateColumns,
      };
    };
    if (selector) {
      const el = document.querySelector(selector);
      if (!el) return { found: false, scrollWidth: document.documentElement.scrollWidth, note: 'selector not found' };
      const chain = [];
      let node = el;
      while (node && node !== document.documentElement) {
        chain.push(describe(node));
        node = node.parentElement;
      }
      return { found: true, scrollWidth: document.documentElement.scrollWidth, chain };
    }
    let worst = null;
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.left < -0.5) {
        if (!worst || r.left < worst.getBoundingClientRect().left) worst = el;
      }
    }
    if (!worst) return { found: false, scrollWidth: document.documentElement.scrollWidth };
    const chain = [];
    let node = worst;
    while (node && node !== document.documentElement) {
      chain.push(describe(node));
      node = node.parentElement;
    }
    return { found: true, scrollWidth: document.documentElement.scrollWidth, chain };
  }, width, process.argv[4] || '');

  console.log('scrollWidth=' + out.scrollWidth + (out.note ? ' (' + out.note + ')' : ''));
  if (!out.found) {
    console.log('nothing overflows the left edge');
  } else {
    for (const c of out.chain) {
      console.log('  ' + c.tag + (c.cls ? '.' + c.cls.replace(/\s+/g, '.') : '') +
        ' w=' + c.w + ' left=' + c.left + ' right=' + c.right +
        ' | css width=' + c.width + ' max-width=' + c.maxWidth +
        ' padding=' + c.padding + ' margin=' + c.margin + ' overflowX=' + c.overflowX +
        ' display=' + c.display + (c.gtc && c.gtc !== 'none' ? ' cols=' + c.gtc : ''));
    }
  }
  await browser.close();
})();
