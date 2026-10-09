const puppeteer = require('puppeteer-core');

// usage: node shot.js <url> <width> <height> <outPath> [full]
(async () => {
  const [url, w, h, out, full] = process.argv.slice(2);
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--disable-gpu', '--hide-scrollbars', '--force-color-profile=srgb'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: parseInt(w, 10), height: parseInt(h, 10), deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 600));
  // force reveal-on-scroll elements to final state (IO won't fire for below-fold in headless fullpage)
  await page.evaluate(() => document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in')));
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: out, fullPage: full === 'full' });
  const dims = await page.evaluate(() => ({
    inner: innerWidth + 'x' + innerHeight,
    scroll: document.documentElement.scrollWidth + 'x' + document.documentElement.scrollHeight,
  }));
  console.log('viewport=' + dims.inner + ' page=' + dims.scroll + ' saved=' + out);
  await browser.close();
})();
