const puppeteer = require('puppeteer-core');

// usage: node phase4-test.js <abayaId> <teeId>
// Phase 4 commerce e2e — writes evidence shots to design/shots/b18-*.
// Assumes: WooCommerce seeded (zones, COD), nilad-core active, site on :8888.
(async () => {
  const [abayaId, teeId] = process.argv.slice(2);
  const BASE = 'http://localhost:8888';
  const SHOTS = __dirname + '/../design/shots';
  const results = [];
  const consoleErrors = [];
  const ok = (name, pass, detail) => {
    results.push({ name, pass, detail });
    console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
  };

  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    protocolTimeout: 600000,
    args: ['--disable-gpu', '--hide-scrollbars', '--force-color-profile=srgb'],
  });
  const page = await browser.newPage();
  // Slow host (parallel Gradle build): every cap raised ~3-5x over healthy defaults.
  page.setDefaultNavigationTimeout(600000);
  page.setDefaultTimeout(180000);
  const t0 = Date.now();
  const step = (msg) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${msg}`);
  const goto = async (url) => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        return;
      } catch (e) {
        if (attempt === 2) throw e;
        step(`goto retry after timeout: ${url}`);
      }
    }
  };
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push('console: ' + m.text());
  });
  page.on('response', async (res) => {
    if (res.url().includes('/wc/store/v1/checkout') && res.status() >= 400) {
      let body = '';
      try { body = (await res.text()).slice(0, 400); } catch (_) {}
      console.log('CHECKOUT-ERR ' + res.status() + ' ' + body);
    }
  });

  // React-controlled inputs: set via the native setter so onChange fires —
  // clickCount:3 + type() can silently leave stale text after a 400 re-render.
  const setVal = (sel, val) => page.evaluate((s, v) => {
    const el = document.querySelector(s);
    if (!el) return false;
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, sel, val);

  const textOf = (sel) => page.evaluate((s) => {
    const els = Array.from(document.querySelectorAll(s));
    return els.map((e) => e.innerText || '').join('\n');
  }, sel);

  const shippingBlockText = () => page.evaluate(() => {
    const sels = [
      '.wc-block-components-shipping-rates-control',
      '.wc-block-components-totals-shipping',
      '.wc-block-cart-totals-shipping',
      '.wc-block-checkout__shipping-method',
    ];
    return sels.flatMap((s) => Array.from(document.querySelectorAll(s)))
      .map((e) => e.innerText || '').join('\n');
  });

  const fillIfEmpty = async (sel, value) => {
    const el = await page.$(sel);
    if (!el) return false;
    await el.click({ clickCount: 3 });
    await el.type(value, { delay: 5 });
    return true;
  };

  try {
    /* ---- A. cart notice below threshold (abaya 1,250 → 250 missing) ---- */
    step('A: cart notice below threshold');
    await goto(`${BASE}/?add-to-cart=${abayaId}`);
    await goto(BASE + '/cart/');
    await page.waitForFunction(() => {
      const el = document.querySelector('.nilad-fs');
      return el && !el.hidden && el.innerText.trim().length > 0;
    }, { timeout: 180000 });
    const noticeA = await textOf('.nilad-fs');
    ok('cart-notice-below-threshold', /متبقي/.test(noticeA) && /250/.test(noticeA), noticeA.replace(/\n/g, ' | '));
    await page.screenshot({ path: SHOTS + '/b18-cart-notice-1440.png' });

    /* ---- B. checkout: rates by governorate + phone validation + COD order ---- */
    step('B: checkout rates + phone validation + COD order');
    await goto(BASE + '/checkout/');
    // Block checkout hydration: billing fields + place-order button exist.
    await page.waitForSelector('#email, input[name="contact_email"]', { timeout: 240000 });
    await page.waitForSelector('button.wc-block-components-checkout-place-order-button', { timeout: 240000 });
    await new Promise((r) => setTimeout(r, 1200));

    await fillIfEmpty('#shipping-first_name, input[name="shipping_first_name"]', 'أحمد');
    await fillIfEmpty('#shipping-last_name, input[name="shipping_last_name"]', 'محمد');
    await fillIfEmpty('#email, input[name="contact_email"]', 'qa@nilad.test');
    await fillIfEmpty('#shipping-phone, input[name="shipping_phone"]', '01012345678');
    await fillIfEmpty('#shipping-address_1, input[name="shipping_address_1"]', 'شارع التحرير 12');
    await fillIfEmpty('#shipping-city, input[name="shipping_city"]', 'القاهرة');
    // EG postcode is validated on submit (empty → "الرمز البريدي / zip صالح" and
    // the request never reaches the phone hook (an empty EG postcode fails
    // client-side validation first — proven while bringing this suite up).
    await fillIfEmpty('#shipping-postcode, input[name="shipping_postcode"]', '11511');

    const setState = async (code) => {
      await page.evaluate((c) => {
        const s = document.querySelector('#shipping-state, #billing-state, select[name="billing_state"]');
        if (s && s.value !== c) {
          s.value = c;
          s.dispatchEvent(new Event('input', { bubbles: true }));
          s.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, code);
      await page.waitForFunction((c) => {
        const s = document.querySelector('#shipping-state, #billing-state, select[name="billing_state"]');
        return s && s.value === c;
      }, { timeout: 60000 }, code);
    };

    // Cairo (EGC) → شحن قياسي 60, no free option.
    step('setState EGC → expect 60');
    await setState('EGC');
    await page.waitForFunction(() => /60/.test(
      Array.from(document.querySelectorAll(
        '.wc-block-components-shipping-rates-control, .wc-block-components-totals-shipping, .wc-block-checkout__shipping-method'
      )).map((e) => e.innerText).join('\n')
    ), { timeout: 180000 });
    let shipText = await shippingBlockText();
    const cairoHas60 = /60/.test(shipText);
    const cairoFree = /شحن مجاني/.test(shipText);
    ok('rate-cairo-60', cairoHas60 && !cairoFree, shipText.replace(/\n/g, ' | ').slice(0, 160));
    await page.screenshot({ path: SHOTS + '/b18-rates-cairo60-1440.png' });

    // Sohag (EGSHG) → 90.
    step('setState EGSHG → expect 90');
    await setState('EGSHG');
    await page.waitForFunction(() => /90/.test(
      Array.from(document.querySelectorAll(
        '.wc-block-components-shipping-rates-control, .wc-block-components-totals-shipping, .wc-block-checkout__shipping-method'
      )).map((e) => e.innerText).join('\n')
    ), { timeout: 180000 });
    shipText = await shippingBlockText();
    ok('rate-sohag-90', /90/.test(shipText), shipText.replace(/\n/g, ' | ').slice(0, 160));
    await page.screenshot({ path: SHOTS + '/b18-rates-sohag90-1440.png' });

    // Back to Cairo for the order.
    step('setState EGC again → expect 60');
    await setState('EGC');
    await page.waitForFunction(() => /60/.test(
      Array.from(document.querySelectorAll(
        '.wc-block-components-shipping-rates-control, .wc-block-components-totals-shipping, .wc-block-checkout__shipping-method'
      )).map((e) => e.innerText).join('\n')
    ), { timeout: 180000 });

    // Payment: COD.
    const codClicked = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input[type="radio"]'));
      const cod = inputs.find((i) => {
        const lbl = i.closest('label') || document.querySelector(`label[for="${i.id}"]`);
        const text = (lbl ? lbl.innerText : '') + ' ' + (i.getAttribute('aria-label') || '');
        return /الدفع عند الاستلام/.test(text);
      });
      if (cod && !cod.checked) cod.click();
      return !!cod;
    });
    ok('cod-selectable', codClicked, codClicked ? '' : 'COD radio not found');

    // Invalid phone → block place order → Arabic error notice.
    const phoneSel = '#shipping-phone, input[name="shipping_phone"]';
    await setVal(phoneSel, '01234');
    await page.evaluate(() => {
      const b = document.querySelector('button.wc-block-components-checkout-place-order-button');
      if (b) b.click();
    });
    step('clicked place-order with invalid phone → expect Arabic error');
    const gotPhoneError = await page.waitForFunction(() => {
      const banners = Array.from(document.querySelectorAll('.wc-block-components-notice-banner, [class*="notice-banner"]'));
      return banners.some((b) => /رقم الموبايل غير صحيح/.test(b.innerText || ''));
    }, { timeout: 180000 }).then(() => true).catch(() => false);
    ok('phone-invalid-blocked', gotPhoneError);
    if (gotPhoneError) {
      await page.screenshot({ path: SHOTS + '/b18-phone-error-1440.png' });
    }

    // Valid phone → place order → order-received.
    await setVal(phoneSel, '01012345678');
    await page.evaluate(() => {
      const b = document.querySelector('button.wc-block-components-checkout-place-order-button');
      if (b) b.click();
    });
    step('clicked place-order with valid phone → expect order-received');
    const gotThankYou = await page.waitForFunction(
      () => /order-received|thank-you|order-pay/.test(location.href),
      { timeout: 300000 }
    ).then(() => true).catch(() => false);
    ok('cod-order-placed', gotThankYou, page.url());
    if (gotThankYou) {
      await new Promise((r) => setTimeout(r, 2500)); // totals/notices settle
      await page.screenshot({ path: SHOTS + '/b18-order-received-1440.png' });
    }

    /* ---- C. above threshold: 1,250 + 420 = 1,670 → free + qualified notice ---- */
    step('C: above threshold → free shipping');
    await goto(`${BASE}/?add-to-cart=${abayaId}`);
    await goto(`${BASE}/?add-to-cart=${teeId}`);
    await goto(BASE + '/cart/');
    await page.waitForFunction(() => {
      const el = document.querySelector('.nilad-fs');
      return el && !el.hidden && /الشحن المجاني/.test(el.innerText || '');
    }, { timeout: 180000 });
    const noticeC = await textOf('.nilad-fs');
    ok('cart-notice-qualified', /مؤهل/.test(noticeC), noticeC.replace(/\n/g, ' | '));
    await page.screenshot({ path: SHOTS + '/b18-cart-qualified-1440.png' });

    await goto(BASE + '/checkout/');
    await page.waitForSelector('#email, input[name="contact_email"]', { timeout: 240000 });
    await page.waitForFunction(() => /شحن مجاني/.test(
      Array.from(document.querySelectorAll(
        '.wc-block-components-shipping-rates-control, .wc-block-components-totals-shipping, .wc-block-checkout__shipping-method'
      )).map((e) => e.innerText).join('\n')
    ), { timeout: 180000 });
    shipText = await shippingBlockText();
    ok('rate-free-above-threshold', /شحن مجاني/.test(shipText), shipText.replace(/\n/g, ' | ').slice(0, 160));
    await page.screenshot({ path: SHOTS + '/b18-free-checkout-1440.png' });
    step('all scenarios done');
  } catch (e) {
    ok('script-completed', false, e.message);
    try { await page.screenshot({ path: SHOTS + '/b18-on-error.png' }); } catch (_) {}
  } finally {
    await browser.close();
  }

  console.log('\n=== RESULTS ===');
  results.forEach((r) => console.log(`${r.pass ? 'PASS' : 'FAIL'} | ${r.name}${r.detail ? ' | ' + r.detail : ''}`));
  if (consoleErrors.length) {
    console.log('\n=== PAGE ERRORS ===');
    consoleErrors.slice(0, 20).forEach((e) => console.log(e));
  }
  process.exit(results.every((r) => r.pass) ? 0 : 1);
})();
