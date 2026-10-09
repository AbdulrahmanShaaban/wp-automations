# Performance + SEO Audit — Nilad (P1, `p1-fashion-store`)

**Date:** 2026-10-06 · **Mode:** READ-ONLY (no code changes; `scripts/qa-audit.js` / `scripts/verify.sh` NOT run)
**Site:** http://localhost:8888 — WordPress 7.1.2 + WooCommerce 11.1.2, block theme `nilad-theme`, Arabic RTL (single language), local wp-env (Docker bind-mount)
**Lighthouse version:** 13.5.0 (`npx lighthouse --version`; identical to the baseline runs, `lighthouseVersion: "13.5.0"` inside both my JSONs and `design/qa/*.json`)
**Baseline reference:** Phase 6 — `docs/QA-REPORT.md` §1 + raw JSON `design/qa/lighthouse-*.json` (throttled pass, read-only for this audit)
**Skills applied:** `seo-web-vitals`, `performance-observability` (front-end measurement sections)

## Pages audited (6)

| id | URL | note |
| --- | --- | --- |
| home | `http://localhost:8888/` | |
| shop | `http://localhost:8888/shop/` | Phase 6 audited `/?post_type=product` (200, same archive template) |
| product | `http://localhost:8888/product/embroidered-abaya/` | discovered from shop; Phase 6 used `/?p=38` (301 → same URL) |
| cart | `http://localhost:8888/cart/` | audited with **seeded cart (1× product 38)** — Store API cookie passed to Lighthouse |
| checkout | `http://localhost:8888/checkout/` | audited with **seeded cart**; empty-cart request 302 → `/cart/` (verified) |
| contact | `http://localhost:8888/contact/` | |

## Exact commands

```powershell
# discovery + SEO HTML extraction (saves html-*.html, seo-extract.json, robots.txt, sitemap-*.xml)
node docs/AUDIT/evidence/perf/discover.js
# Lighthouse mobile, 6 pages, chrome-launcher pattern copied from scripts/qa-audit.js:337-372
node docs/AUDIT/evidence/perf/run-lighthouse.js
# metric extraction from saved JSONs + Phase 6 baseline delta
node docs/AUDIT/evidence/perf/extract.js
node docs/AUDIT/evidence/perf/compare.js
# SEO gaps: checkout-with-cart, og:image headers/dims, JSON-LD, fonts, links, sitemap
node docs/AUDIT/evidence/perf/seo-extra.js
npx lighthouse --version   # 13.5.0
```

Lighthouse settings (matching Phase 6 so deltas are comparable): `formFactor=mobile`,
`screenEmulation {width:390, height:844, dpr:2, mobile:true}`, `throttlingMethod=simulate`,
`throttling {rttMs:150, throughputKbps:1638.4, cpuSlowdownMultiplier:4, requestLatencyMs:150,
downloadThroughputKbps:1474.5, uploadThroughputKbps:675}`, `onlyCategories=performance,accessibility,best-practices,seo`,
`chrome-flags: --headless=new --no-sandbox --disable-gpu`, `settings.extraHeaders: Cookie=<seeded cart>`.
One pass per page (throttled/headline — the pass Phase 6 compares against). Lab data, single run, this machine.

## Table 1 — Performance (Lighthouse mobile, throttled)

| page | score | FCP | LCP (+ element) | TBT | CLS | TTI | weight | rb-wasted | env-bound? | delta vs Phase 6 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| home | **84** | 2,426 ms | 2,577 ms — `h1.wp-block-heading` "قطع تلبسها كل يوم، بجودة تحسّها" | 26 ms | 0.133 | 3,344 ms | 247 KiB (252,750 B), 24 req | 5,966 ms / 12 res | mostly (TTFB 3,099 ms of LCP) | 87→84 **worse**; TTFB 1,744→3,099 ms worse; LCP/TBT/CLS same |
| shop | **66** | 3,660 ms | 4,713 ms — `img.attachment-large` in product grid ("عباية كتان مطرّزة") | 100 ms | 0.009 | 5,265 ms | 394 KiB (403,541 B), 43 req | 9,893 ms / 16 res | mostly (TTFB 5,714 ms) | 67→66 same; TTFB 10,553→5,714 ms **better**; LCP same |
| product | **70** | 2,697 ms | 4,549 ms — `img.wp-post-image` in `woocommerce-product-gallery` | 37 ms | 0.006 | 4,750 ms | 363 KiB (371,941 B), 38 req | 7,202 ms / 15 res | mostly (TTFB 10,551 ms) | 71→70 same; TTFB 7,024→10,551 ms worse; LCP same |
| cart | **7** | 3,545 ms | 14,052 ms — `img.attachment-woocommerce_thumbnail` in `wc-block-grid__product` ("تيشيرت قطن أوفرسايز") | 1,876 ms | 0.809 | 14,572 ms | 1,622 KiB (1,660,795 B), 91 req | 14,425 ms / 17 res | **mixed** (TTFB 4,696 ms + elementRenderDelay 6,820 ms = code) | 9→7 same; LCP 11,787→14,052 ms worse; CLS 0.814→0.809 same |
| checkout | **20** | 4,005 ms | 15,559 ms — same `wc-block-grid__product` image | 1,641 ms | 0.215 | 16,695 ms | 1,622 KiB (1,661,385 B), 92 req | 11,007 ms / 17 res | **mixed** (TTFB 5,264 ms + elementRenderDelay 4,489 ms = code) | 6→20 **better**; CLS 0.809→0.215 **better**; TBT 2,700→1,641 ms better; LCP 13,846→15,559 ms worse |
| contact | **93** | 2,280 ms | 2,583 ms — `p.wp-block-paragraph` (intro text) | 35 ms | 0.013 | 3,356 ms | 245 KiB (251,319 B), 24 req | 5,632 ms / 12 res | mostly (TTFB 1,410 ms) | 84→93 **better**; TTFB 2,890→1,410 ms better; LCP 2,958→2,583 ms better |

Accessibility cross-check (not my area): **100 on all 6 pages** — same as Phase 6. Lighthouse SEO category: 100/100/100/69/69/100 — the 69s are cart/checkout `is-crawlable` failing **because of the intentional `noindex`** (Phase 6 also scored 69 there).

**Baseline deltas are within run-to-run variance except where noted.** Totals across pages vs Phase 6: scores -3/-1/-1/-2/+14/+9; the biggest single moves (checkout +14, contact +9) come with improved TTFB/TBT/CLS, the down moves (home -3) with worse TTFB — both directions track TTFB, i.e. the environment.

### Environment story check ("PHP over bind mount 1.7–10.5 s, DB fast")

- Measured TTFB this run: **1,410 / 3,099 / 4,696 / 5,264 / 5,714 / 10,551 ms** → range **1.4–10.6 s**, same order as Phase 6's **1.7–10.5 s** (1,744–10,553 ms). Which page is worst swaps between runs (shop 10.5 s → 5.7 s; product 7.0 s → 10.6 s) — that instability is itself a bind-mount signature, not a code change.
- LCP breakdown confirms TTFB dominance on the non-cart pages: home TTFB component **3,103 ms** of 2,577 ms LCP; shop **5,724 ms** of 4,713 ms; product **10,565 ms** of 4,549 ms.
- Transfer weight is small on static pages (home HTML: 79,708 B raw → **17,629 B with `Content-Encoding: gzip`**), consistent with Phase 6 §5.2. `wc_get_products`/SQL fast claim was Phase 6's (not re-probed here).
- **Conclusion: the documented env-bound story still holds** — server response dominates home/shop/product; it is *not* the whole story for cart/checkout (below).

## Table 2 — SEO (per page)

| page | title (len) | meta desc (len) | canonical | robots | OG | JSON-LD | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| home | `نيلاد – أزياء عصرية للمرأة (Demo)` (51) ✓ unique | present, 135 ✓ | `http://localhost:8888/` — **printed twice** | `max-image-preview:large` ✓ | og:title/desc/url/image/locale ✓, `og:image` = og-nilad.jpg **1200×630, 31,721 B**, 200 `image/jpeg` | Organization + WebSite ✓ | `lang="ar" dir="rtl"` ✓, h1=1 ✓, 200 ✓ |
| shop | `المتجر – نيلاد` (20) ✓ unique | present, 113 ✓ | `/shop/` — single ✓ | ✓ | ✓ same brand image ✓ | Organization + WebSite ✓ | 8 imgs: all with width+height, all `loading="lazy"` ✓ |
| product | `عباية كتان مطرّزة – نيلاد` (31) ✓ unique | present, 128 ✓ | self — **printed twice** | ✓ | ✓ `og:image` = abaya.jpg **800×1000** (below 1200×630 rec.) | Organization+Product graph **+ second Product block, same `@id`** — duplicate entity | 1 img eager (LCP), alt present, dims present |
| cart | `السلة – نيلاد` (19) | present, 119 (shared with checkout) | `/cart/` — **printed twice** | `max-image-preview:large, noindex, follow` ✓ (correct for cart) | ✓ | Organization | Lighthouse SEO 69 = noindex flagged, expected; **noindex URL is in sitemap** ✗ |
| checkout | `السلة – نيلاد` (19) — **identical to cart** (both noindex) | present, 119 — identical to cart | with cart: `/checkout/` ✓ (printed twice); empty cart: 302 → `/cart/` (correct WC behaviour) | `noindex, follow` ✓ | ✓ | Organization | Lighthouse SEO 69 = noindex, expected; **in sitemap** ✗ |
| contact | `اتصل بنا – نيلاد` (24) ✓ unique | present, 155 ✓ | `/contact/` — **printed twice** | ✓ | ✓ | Organization | 200 ✓ |

### Site-wide SEO

| check | result | evidence |
| --- | --- | --- |
| `<html lang>` | `ar` (not `ar-EG`) + `dir="rtl"` on all 6 | seo-extract.json |
| robots.txt | **PASS** — `User-agent: *`, disallows `/wp-admin/` (+Allow admin-ajax), WC log/upload paths, `/*?add-to-cart=`; `Sitemap: /wp-sitemap.xml`; no `Disallow: /` | `evidence/perf/robots.txt` |
| sitemap | `/sitemap.xml` → 301 → `/wp-sitemap.xml` ✓; index + 6 children, **28 URLs**: 9 pages, 8 products, 8 product-categories, 1 category, 1 post, 1 author | seo-extract.json |
| sitemap contents | **FAIL (mixed)** — includes **noindex URLs** `/cart/`, `/checkout/`, `/my-account/`, plus `/author/admin/` and sample post `/2026/10/01/hello-world/` | seo-extract.json |
| hreflang | **N/A** — single-language site, no `hreflang` alternates found (correct; stated, not a defect) | seo-extract.json |
| status codes | `/checkout/` empty → **302 → /cart/** (with cart: 200); `/my-account/` → 200 + `noindex`; `/nonexistent-page-xyz` → **404** ✓ | seo-extract.json |
| trailing slash | `/shop`,`/contact`,`/cart`, product no-slash → **301 → slash** ✓ consistent | seo-extract.json |
| www | `www.localhost:8888` → **301 → `http://localhost:8888/`** ✓ (non-www canonical) | seo-extra run |
| title uniqueness | 5/6 unique; cart = checkout (both noindex) | Table 2 |
| internal links (home) | 11 same-origin hrefs, **0 broken hash anchors**, all sampled paths **200** (`/`, `/shop/`, `/cart/`, `/about/`, `/shipping-returns/`, `/privacy/`, `/contact/`) | seo-extra.json |
| Twitter card | `twitter:card=summary_large_image` on all 6 (no `twitter:image` — falls back to og:image) | seo-extract.json |
| JSON-LD types | home/shop: Organization+WebSite; product: Organization+Product (+duplicate Product); cart/contact: Organization; **no BreadcrumbList** | seo-extra.json |

**SEO scorecard:** page-level 48 checks (8 × 6 pages: title / desc / canonical-single / robots / OG+image / JSON-LD / lang+h1 / status) → **43 pass, 5 fail** (all 5 = duplicate canonical tags). Site-wide 10 checks → **8 pass, 2 fail** (sitemap contents; product og:image dimensions). hreflang = n/a.

## Core Web Vitals deep-dive (worst page)

**Worst score: `/cart/` = 7** (worst LCP: `/checkout/` = 15,559 ms; same root causes).

1. **LCP element:** `li.wc-block-grid__product > a.wc-block-grid__product-link > div.wc-block-grid__product-image > img.attachment-woocommerce_thumbnail` — the *recommended-products* grid image ("تيشيرت قطن أوفرسايز"), not the cart contents.
   **LCP split:** TTFB **4,699 ms** + resourceLoadDelay 20 + resourceLoadDuration 647 + **elementRenderDelay 6,820 ms**. The 6.8 s render delay is **code**: the grid paints only after WooCommerce block JS hydrates.
   **Biggest opportunity from the JSON:** `render-blocking-insight` **14,425 ms wasted over 17 resources**; `unused-javascript` 540,297 B; `unminified-javascript` 344,602 B; `cache-insight` 1,518,674 ms wasted (82 requests, `cacheLifetime=0`).
2. **CLS sources (cart, CLS 0.809):** cart block `div.wp-block-woocommerce-cart` shift **0.768** (skeleton/empty-state → hydrated "سلة مشترياتك…" content) + footer shift 0.041 + font swaps ≤0.002. Checkout CLS 0.215: footer **0.153** + 0.041 + cart block 0.022 — i.e. content landing above the footer after JS runs.
3. **TBT attribution (1,876 ms cart / 1,641 ms checkout):** long tasks — `wp-includes/js/dist/components.js` **929 ms**, `plugins.js` 429 ms, `vendor/react.js` 410 ms (checkout: components 903, react 426, style-engine 387); script time — components.js 384 ms script + 508 ms parse/compile, react.js 451 ms, `wc-cart-checkout-base-frontend.js`/`cart-frontend.js`. 67 JS requests / **1,414 KiB** per cart/checkout page. All upstream WP block-library + Woo blocks JS (theme contributes only a small inline observer script).

Secondary CWV: home CLS 0.133 is dominated by a **single 0.132 shift of the hero `h1` caused by "Web font loaded"** (Google Fonts swap) — the only Core-WV failure on an otherwise-<0.1 page (threshold: CLS ≤ 0.1 per `performance-observability` §2).

## Asset budgets

| page | JS req/B | CSS req/B | fonts | images (req/B) | requests total |
| --- | --- | --- | --- | --- | --- |
| home | 11 / 131 KiB | 8 / 33 KiB | 2 files / 63 KiB | 1 / 1 KiB | 24 |
| shop | 17 / 166 KiB | 12 / 36 KiB | 2 / 63 KiB | 9 / 100 KiB | 43 |
| product | 18 / 212 KiB | 13 / 39 KiB | 2 / 63 KiB | 3 / 27 KiB | 38 |
| cart | 67 / **1,414 KiB** | 13 / 55 KiB | 2 / 63 KiB | 6 / 17 KiB | 91 |
| checkout | 67 / **1,414 KiB** | 13 / 55 KiB | 2 / 63 KiB | 6 / 17 KiB | 92 |
| contact | 11 / 131 KiB | 8 / 32 KiB | 2 / 63 KiB | 1 / 1 KiB | 24 |

**Fonts** — where/how enqueued: `wp-content/themes/nilad-theme/functions.php:22-36` → `wp_enqueue_style('nilad-fonts', 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Inter:wght@400;600;800&display=swap')`.
- **No Alexandria anywhere** (grep `Alexandria|@font-face|fonts.*gstatic` across `wp-content/`: 1 hit only — the Cairo/Inter line above). Families: **Cairo (4 weights) + Inter (3 weights) = 7 declared**; `font-display: swap` ✓ (via URL param).
- **preconnect: none** — only `<link rel="dns-prefetch" href="//fonts.googleapis.com">`; **font preloads: 0**; self-hosted: **no** (code comment `TODO(perf): self-host the font files before launch (docs/ASSETS_TODO.md)` at functions.php:20).
- Actually downloaded per page: **2 Cairo woff2 files (63 KiB)** — no Inter files fetched in any run (declared but unused on audited pages).
- The Google Fonts CSS request is **render-blocking**: `render-blocking-insight` lists it with **949 ms wasted on home**; totals 5,632–14,425 ms/page across all render-blocking resources (Google CSS + jquery.js 85,437 B + jquery-migrate + WooCommerce CSS/JS).
- `theme.json` declares families `Cairo` (body) and `Inter` (latin); `style.css` uses font-weight 600/700/800; `theme.json` heading weight 800, button 700 — so weights 400–800 are all reachable.

**Images**
- Static HTML: shop 8 imgs — **all have width+height, all `loading="lazy"`** ✓; product 1 img — dims ✓, eager (correct, it is the LCP); cart/checkout 4 imgs (1 lazy); home/contact 0 `<img>` in HTML (front-page.html contains no `wp:image`/`wp:cover` blocks — hero is text-only).
- Theme templates (`templates/*.html`, `parts/*.html`) contain **no raw `<img>` markup** — all images come from Woo blocks; no template-level dimension/lazy logic to fix.
- Lighthouse `image-size-responsive` fails on cart/checkout for `wp-content/uploads/2026/10/tee-300x300.jpg` (served into a non-300px slot).
- og:image assets: brand card `og-nilad.jpg` **1200×630, 31,721 B** ✓; product og:image `abaya.jpg` **800×1000, 25,141 B** ✗ (recommendation 1200×630). Both 200 `image/jpeg`, no `Cache-Control` header.

## Findings

`area` splits **env (environment-bound, not code)** vs **code (fixable in this repo)** vs **config (server/deploy config)** explicitly.

| # | severity | area | location | evidence | fix | effort |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | High | **env (bind-mount PHP)** | all 6 pages | TTFB 1,410–10,551 ms now vs 1,744–10,553 ms Phase 6; LCP TTFB component 3,103 / 5,724 / 10,565 ms on home/shop/product | re-run this audit on production hosting; no repo change can fix it | n/a (deploy) |
| 2 | High | **code (WP/Woo upstream)** | `/cart/`, `/checkout/` | LCP element = recommended-products grid img; elementRenderDelay **6,820 ms** (cart) / **4,489 ms** (checkout) of LCP 14,052/15,559 ms | server-render that grid or drop it from mobile initial view / defer | M |
| 3 | High | **code (WP/Woo upstream)** | `/cart/` CLS 0.809; `/checkout/` 0.215 | `layout-shifts`: cart block **0.768**, footer 0.153+0.041 | reserve space (min-height) for block skeleton→hydrated swap | M |
| 4 | High | **code (WP/Woo upstream)** | `/cart/`, `/checkout/` TBT 1,876 / 1,641 ms | long tasks: `dist/components.js` 929 ms, `plugins.js` 429 ms, `react.js` 410 ms; 67 JS req / 1,414 KiB | fewer/deferred block scripts (upstream; theme can only enqueue less) | L (upstream) |
| 5 | Medium | **code (theme)** | `themes/nilad-theme/functions.php:22-36` | external Google Fonts render-blocking (949 ms wasted on home), 0 preconnect, 0 preload, 7 weights declared / 2 files used, 0 Inter fetched | self-host + `preconnect fonts.gstatic.com` + preload 1 Cairo face + trim weights (matches its own TODO) | S–M |
| 6 | Medium | **code (theme)** | home hero `h1` | CLS **0.132 of 0.133** attributed to "Web font loaded" | size-adjusted fallback / preload critical face | S |
| 7 | Medium | **code (plugin)** | `plugins/nilad-core/qa-hardening.php:121` | `<link rel="canonical">` printed unconditionally + WP core's own canonical → **2 identical canonical tags** on home/product/cart/contact/checkout (+my-account) | print only when core output absent | S |
| 8 | Medium | **code (config in repo)** | `/wp-sitemap.xml` | sitemap lists **noindex** `/cart/`, `/checkout/`, `/my-account/` + `/author/admin/` + sample `hello-world` post (28 URLs total) | exclude noindex from sitemap; remove sample content | S–M |
| 9 | Medium | **config (server, not theme)** | all static assets | `cache-insight`: `cacheLifetime=0` on 17–82 requests/page, wasted **165,814–1,518,674 ms**; no `Cache-Control` on HTML/images either | `Cache-Control`/`Expires` in Apache (deploy step) | S |
| 10 | Medium | **env (wp-env dev mode)** | `/cart/`, `/checkout/` | unminified dev bundles served: `js/dist/development/react-refresh-runtime.js`, unminified `react-dom.js` (106 KB) + `components.js` (94 KB); `unminified-javascript` 344,602 B wasted | ensure `SCRIPT_DEBUG=false` in production (`.wp-env.json` sets `WP_DEBUG:true`) | S |
| 11 | Medium | **code (plugin)** | product page JSON-LD | two `Product` blocks share `@id …/#product` with divergent offer shapes (qa-hardening graph vs Woo core) | emit one Product entity | S–M |
| 12 | Low | **code (plugin)** | product `og:image` | `abaya.jpg` **800×1000** vs recommended 1200×630 (`qa-hardening.php:106` uses `large`) | dedicated 1200×630 OG image | S |
| 13 | Low | **code (WP/Woo)** | all pages | `jquery.js` 47 KB measured unused on home/contact; unminified `jquery.js` 41 KB (see #10) | conditional dequeue where Woo JS not required (careful: Woo hooks depend) | M |
| 14 | Low | **code** | cart + checkout | identical `<title>` and meta description on both (both noindex) | differentiate, or accept (noindex) | S |
| 15 | Low | **code (Woo markup)** | cart/checkout | `image-size-responsive` fail on `tee-300x300.jpg` | proper srcset size | S |

**Counts:** env-bound/environment-caused: **3** (#1, #9, #10) · fixable in repo code: **11** (#2–#8, #11–#15) · upstream-Woo/WP (code, low control): within #2–#4, #13.

## 5 highest-impact fixes

1. **Deploy + re-measure before touching code** (env): TTFB 1,410–10,551 ms is the LCP component on home/shop/product (3,103 / 5,724 / 10,565 ms). Nothing in the repo can beat the bind mount; numbers only become meaningful on real hosting (Phase 6 §6 still open).
2. **Cart/checkout rendering path** (code): kill the 6,820/4,489 ms `elementRenderDelay` + 0.768 CLS shift by server-rendering or deferring the recommended-products grid, and reserve space for the cart skeleton→hydrated swap. This is the difference between 7–20 and the other pages' 66–93.
3. **Font loading** (code): self-host Cairo, `preconnect fonts.gstatic.com`, preload the one critical face, trim 7 declared weights → cuts a render-blocking request (949 ms on home alone) and the 0.132 font-swap CLS on the hero. Already flagged as TODO in `functions.php:20`.
4. **SEO correctness sweep** (code, cheap): single canonical (#7), dedupe Product JSON-LD (#11), drop noindex URLs + sample content from sitemap (#8), dedicated product OG image (#12).
5. **Host config**: `Cache-Control` for static assets (#9: 165,814–1,518,674 ms wasted) and `SCRIPT_DEBUG=false` in production (#10: 344,602 B of dev JS on cart).

## Could not verify

- **Field/CrUX/Core Web Vitals (real users)** — local demo, no traffic; all numbers here are **lab, single run, one machine**.
- **Performance on real hosting** — [UNVERIFIED] (Phase 6 §6 deployment item; this audit could not and did not claim it).
- **Gzip/Brotli coverage beyond home HTML** (verified for `/` only: 79,708 B → 17,629 B) and HTTP/2 (localhost Apache is HTTP/1.1 — host-dependent).
- **Multi-item / logged-in / coupon cart** states — only 1 seeded item (product 38) via Store API; `/checkout/` payment steps not exercised beyond page load.
- **Social scrapers actually rendering og:image** — only URL/headers/dimensions fetched, no share-preview test.
- **Deep internal link crawl** — home anchors + sampled same-origin links only (per scope).
- **hreflang** — none present; correct for a single-language site (stated, not verified against an English variant that does not exist).
- **Search Console / analytics / sitemap submission** — server-side accounts, out of scope.

## Evidence (all under `docs/AUDIT/evidence/perf/`)

- Lighthouse raw JSON: `lighthouse-home.json`, `lighthouse-shop.json`, `lighthouse-product.json`, `lighthouse-cart.json`, `lighthouse-checkout.json`, `lighthouse-contact.json` (+ `lighthouse-summary.json`, `baseline-compare.json`)
- SEO raw: `seo-extract.json`, `seo-extra.json`, `robots.txt`, `sitemap-index.xml`, `html-{home,shop,product,cart,contact,checkout-incart}.html`
- Scripts (helpers, this dir only): `discover.js`, `run-lighthouse.js`, `extract.js`, `compare.js`, `seo-extra.js`
- Baselines read (read-only): `design/qa/lighthouse-*.json`, `docs/QA-REPORT.md`
