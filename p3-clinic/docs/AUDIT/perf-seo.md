# P3 — Performance & SEO Audit

| | |
|---|---|
| **Project** | P3 — عيادة سِراج للأسنان (demo clinic), WordPress 7.1.3 + block theme `siraj-theme` + `siraj-booking` plugin |
| **Report date** | 2026-10-07 (first perf/SEO audit for P3 — **no baseline exists**; evidence runs executed 2026-10-08 03:09–07:20 UTC, timestamps per file) |
| **Environment** | wp-env (Docker) at `http://localhost:8889`, Apache/2.4.68, PHP 8.3.35, `dir="rtl" lang="ar"` |
| **Tools** | Lighthouse 13.5.0 (mobile, `throttlingMethod: simulate`, RTT 150 ms / 1,638 kbps / 4× CPU, screen 390×844@2), Chrome headless (`--headless=new`), CDP probes, `curl.exe` |
| **Scope (read-only except this report + evidence/)** | 5 pages: `/`, `/services/`, `/team/`, `/contact/`, `/book/` |

---

## 1. Pages audited & commands

| Page | URL | Lighthouse fetchTime (UTC) | HTML snapshot |
|---|---|---|---|
| home | `http://localhost:8889/` | 03:09:59 | `evidence/perf/html-home.html` |
| services | `http://localhost:8889/services/` | 03:10:43 | `evidence/perf/html-services.html` |
| team | `http://localhost:8889/team/` | 03:11:19 | `evidence/perf/html-team.html` |
| contact | `http://localhost:8889/contact/` | 03:11:47 | `evidence/perf/html-contact.html` |
| book | `http://localhost:8889/book/` | 03:12:11 | `evidence/perf/html-book.html` |

Commands as run (all from `docs/AUDIT/evidence/perf/`):

```
node run-lighthouse.js          # 5× mobile Lighthouse (full raw JSON per page)
node extract.js                 # metrics-extract.json (simulated + observed + LCP + CLS sources)
node perf-detail.js             # per-audit opportunities (cache, images, minify, render-blocking)
node inline-assets.js           # inline <style>/<script> inventory
node probe-paint.js             # real-browser (CDP, unthrottled) TTFB/FCP per page
node probe-reveal.js / probe-reveal-tail.js   # reveal-on-scroll behaviour + screenshots
node cls-scroll.js              # CLS with and without scrolling
node ttfb-sample.js             # 5 rounds × 8 paths: pages vs robots.txt vs static assets
node discover.js                # SEO discovery: meta/OG/JSON-LD/canonical/lang/headings/images
node seo-extra.js / seo-extra2.js / seo-extra3.js   # duplicates, case variants, 404/author/feed
node scorecard.js               # 104-check SEO scorecard → seo-scorecard.json
node link-inventory.js          # anchors/ids/hash targets per page
node booking-cpt-check.js       # booking CPT archive/slug/REST/search exposure
curl.exe -H "Accept-Encoding: gzip, br" …            # manual compression + redirect spot-checks
```

Lighthouse config verified in all five raw JSONs: `throttlingMethod: simulate`, formFactor mobile, screenEmulation 390×844 dpr2, `rttMs 150 / throughputKbps 1638.4 / cpuSlowdownMultiplier 4`, `onlyCategories: [performance, accessibility, best-practices, seo]`.

---

## 2. Performance results (Table 1)

Headline FCP/LCP/TBT/CLS/TTI/SI are **Lantern-simulated** mobile values; "Root document" is the **observed** main-document response time (LH `server-response-time`, real time on the local trace). Lighthouse scores are lab-only; there is no field data for localhost.

| Page | Perf | A11y | BP | SEO | FCP | LCP | TBT | CLS | TTI | SI | Weight / Reqs | Root document (observed) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/` | **85** | 100 | 100 | **85** | 1.6 s | 2.0 s | 220 ms | 0.045 | 2.3 s | 18.9 s | 460 KiB / 16 | **12,370 ms** |
| `/services/` | **92** | 98 | 100 | **83** | 1.2 s | 1.6 s | 50 ms | 0.045 | 1.8 s | 7.8 s | 131 KiB / 13 | 4,850 ms |
| `/team/` | **95** | 98 | 100 | **83** | 1.2 s | 1.6 s | 0 ms | 0 | 1.6 s | 5.8 s | 131 KiB / 13 | 3,380 ms |
| `/contact/` | **98** | 100 | 100 | **92** | 1.2 s | 1.7 s | 0 ms | 0.007 | 1.8 s | 4.0 s | 130 KiB / 13 | 2,200 ms |
| `/book/` | **91** | 100 | 100 | **83** | 1.2 s | 1.6 s | 20 ms | 0.002 | 1.8 s | 8.7 s | 131 KiB / 14 | 5,530 ms |

LCP elements (all pages): home = hero `<h1>` "أسنانك تستاهل عناية واضحة، بموعد يناسبك" (`section.hero > div.container > div.hero-text > h1`); services/team/contact/book = `<p class="lead">` in `div.entry-content`.

LCP phase breakdown (observed): TTFB dominates every page — home 12,384 + 542 ms render; services 4,858 + 308; team 3,406 + 338; contact 2,217 + 262; book 5,542 + 275 (**89–96 % of LCP is document response time**).

No render-blocking JavaScript, no jQuery, no third-party hosts on any page, `font-display` audit passes, modern HTTP (gzip) passes. CLS in every run is font-swap only; scroll/reveal probes produced **0 CLS** with and without scrolling (`cls-scroll.json`), and no content was left invisible after a full scroll (`probe-reveal-tail.json` → `stillHidden: []`).

---

## 3. Environment story: response time is the whole story

`ttfb-sample.json` (5 rounds, curl) vs a real-browser probe (`probe-paint.json`, CDP, unthrottled):

| Path | Median TTFB | Min–Max | Verdict |
|---|---|---|---|
| `/` (PHP) | **3,335 ms** | 702–**57,680 ms** | slow + wildly variable |
| `/services/` (PHP) | 3,905 ms | 1,241–12,810 ms | slow |
| `/team/` (PHP) | 3,349 ms | 2,687–7,300 ms | slow |
| `/contact/` (PHP) | 6,104 ms | 836–13,816 ms | slow |
| `/book/` (PHP) | 6,892 ms | 2,832–9,630 ms | slow |
| `/robots.txt` (PHP) | 4,347 ms | 456–5,782 ms | slow (WP bootstrap) |
| `?p=5` (301 redirect) | 2,437 ms | 245–8,130 ms | slow redirect |
| theme `style.css` (static) | **30 ms** | 15–33 ms | fast |
| `alexandria-arabic.woff2` (static) | **47 ms** | 27–82 ms | fast |

Real-browser paint (unthrottled, `probe-paint.json`): FCP home 7,872 ms / services 7,688 / contact 4,008 / team 2,452 / book 1,660 (TTFB 1,253–7,424 ms).

**Reading:** Apache and static file serving are fine (15–82 ms). Everything routed through the WordPress PHP bootstrap — pages *and* `robots.txt` — takes seconds, and rounds vary 702 ms → 57.7 s. That is wp-env on Windows Docker (bind-mounted PHP file I/O + cold opcache/MySQL), not theme code: the theme's own `style.css` answers in 30 ms in the same rounds. Compression is on (HTML 73,948 B → 17,199 B with `Content-Encoding: gzip`, verified by curl), HTTP/1.1, but **no cache headers anywhere** (`cacheLifetimeMs: 0`, document `cache: none`).

This dev-environment delay is exactly what the simulated Lighthouse headline metrics do **not** include: they predict 1.2–1.6 s FCP under a mobile profile while the observed trace paints at 2.5–12.9 s. Both numbers are reported above; the observed ones describe the experience on this machine today. Finding **C1** owns the fix.

---

## 4. Core Web Vitals deep-dive — worst page (`/`)

- **Lab (simulated): LCP 2.0 s ≤ 2.5 s ✓, CLS 0.045 ≤ 0.1 ✓, TBT 220 ms ✓ (max-potential-FID 220 ms).** All three would pass — but the model excludes the observed 12,370 ms document response. **Observed LCP = 12,926 ms → would fail badly in the field.**
- **LCP element:** hero `<h1>` (text). Phases: **TTFB 12,384 ms (96 %)** + element render 542 ms → fixing server response *is* the LCP fix; element/CSS work is secondary here.
- **TBT 220 ms** — long tasks: 571 ms @999 ms (document/inline scripts), 221 ms @1,736 ms, plus two ~78 ms unattributable tasks. Bootup: document total 1,929 ms with only 16 ms scripting; "Unattributable" 7,280 ms total / 135 ms scripting → main-thread cost is parse/style/layout, not third-party JS (there is none).
- **CLS 0.0447** — single source: font swap of `alexandria-arabic.woff2` moving `aside.note` in the hero. 45 % of the 0.1 budget; no reveal-animation contribution (scroll probes = 0).
- **Speed Index 18.9 s (score 0)** — worst of the five; visual completion is gated by the late document + 327 KiB of JPEGs.
- **Weight 460 KiB / 16 requests:** Image 4/335,492 B (71 %), Script 5/42,788 B, Font 2/62,064 B, Stylesheet 3/11,533 B, Document 17,701 B transfer (73,948 B resource).
- **Cache:** every asset cacheLifetimeMs 0 → LH estimates 441 KiB re-downloaded (cache-insight fails).
- **Verdict:** passes the lab thresholds by simulation, fails reality by observation. Fix order: C1 (server) → M4 (images) → M6 (render-blocking/inline CSS) → L3 (font metrics).

---

## 5. SEO scorecard (Table 2)

**Scorecard tally: 104 checks → 71 pass / 33 fail** (page-level 90 → 58/32; site-level 14 → 13/1). Evidence: `seo-scorecard.json`.

### Page-level checks (×5 pages)

| Check | Pass/Fail | Notes |
|---|---|---|
| title present / unique | 5/0 · 5/0 | services 35, team 34, contact 33, book 38 chars ✓ |
| title ≤ 60 chars | **4/1** | home 67 chars (truncation risk) |
| **meta description present** | **0/5** | `MISSING` everywhere — only universal page fail |
| **Open Graph tags present** | **0/5** | 0 og tags everywhere |
| **og:image 1200×630** | **0/5** | missing (no og at all) |
| **Twitter card tags** | **0/5** | 0 twitter tags everywhere |
| **JSON-LD structured data** | **0/5** | 0 blocks everywhere |
| canonical exactly 1 | 5/0 | self-referencing on all pages |
| robots meta present / page crawlable | 5/0 · 5/0 | `max-image-preview:large`, no noindex |
| lang + dir set / exactly one h1 | 5/0 · 5/0 | `lang="ar" dir="rtl"` ✓ |
| heading order no skips | **3/2** | services & team jump h1 → h3 (also an a11y fail) |
| status 200 / all images have alt / no broken hash anchors | 5/0 each | `#wp--skip-link--target` only hash, valid |
| **Lighthouse SEO ≥ 90** | **1/4** | contact 92 passes; home 85, services/team/book 83 fail (meta-description + robots-txt timeout) |

### Site-level checks (14)

13 pass / 1 fail:

- **Pass:** robots.txt exists without blanket Disallow · declares `Sitemap:` · `wp-sitemap.xml` 200 (5 URLs: `/`, `/services/`, `/team/`, `/contact/`, `/book/`) · `/sitemap.xml` → `wp-sitemap.xml` · sitemap contains no noindex URLs · unknown path → 404 (correct status, h1 "الصفحة غير موجودة") · trailing-slash **301** (`/services` → `/services/`, verified by curl) · uppercase variants self-canonical · utm variants self-canonical · no third-party fonts · no third-party hosts · wp-json reachable · `/feed/` reachable and not disallowed.
- **Fail:** `/?author=1` → **200, indexable**, title `admin – عيادة سِراج…` — leaks the admin username and creates an indexable archive.

Additional observed facts: case variants `/BOOK/`, `/SERVICES/`, `/TEAM/` return **200** (curl verified) with correct lowercase canonicals — canonical protects ranking, but each variant costs a full slow PHP render; search results are `noindex` ✓; `?page_id=5`, `?p=5`, `/index.php/services/`, `/book//` all 301 to the canonical; `/?post_type=siraj_booking` 200 with canonical → `/` (harmless); `/siraj_booking/` 404 ✓.

**Already right (no action):** canonicals, robots meta, h1, RTL/lang, alt text, lazy-loading, self-hosted Alexandria fonts (2 woff2 files / 61.5 KiB total, 10 @font-face declarations, zero third-party font hosts), no third-party scripts at all, gzip on, correct 404.

---

## 6. Asset budgets

Budget: page ≤ 200 KiB transfer / ≤ 20 requests; images ≤ 150 KiB; fonts ≤ 100 KiB; JS ≤ 100 KiB.

| Page | Weight | Requests | Images | Fonts | JS | Verdict |
|---|---|---|---|---|---|---|
| home | **460 KiB** ✗ | 16 ✓ | **328 KiB ✗** (3 JPEGs 327 KiB; LH est. 189 KiB savings) | 62 KiB ✓ | 43 KiB ✓ | images blow the budget |
| services | 131 KiB ✓ | 13 ✓ | 0 | 62 KiB ✓ | 43 KiB ✓ | pass |
| team | 131 KiB ✓ | 13 ✓ | 0 | 62 KiB ✓ | 43 KiB ✓ | pass |
| contact | 130 KiB ✓ | 13 ✓ | 0 | 62 KiB ✓ | 43 KiB ✓ | pass |
| book | 131 KiB ✓ | 14 ✓ | 0 | 62 KiB ✓ | 43 KiB ✓ | pass |

Home images (all `loading="lazy"`, all with alt, **all missing width/height**): `photo-instruments.jpg` 111,828 B (1200×1200), `photo-implant.jpg` 123,973 B (1200×1200), `photo-stilllife.jpg` 97,655 B (1200×1500) loaded in lab + `photo-lounge.jpg` in HTML below fold. No WebP/AVIF. Inline payload also large: 37–40 KiB inline CSS across 14–17 `<style>` tags and a 13.9 KiB inline module script on home (`inline-assets.json`).

---

## 7. Findings

**15 findings — by severity: Critical 1 · High 4 · Medium 6 · Low 4. By area: env 2 · code 9 · config 4.**

| # | Sev | Area | Location | Evidence | Fix | Effort |
|---|---|---|---|---|---|---|
| C1 | Critical | env | wp-env PHP (all URLs) | `ttfb-sample.json` medians 3,335–6,892 ms (max 57,680) vs static 30–47 ms; LH root-document 2,200–12,370 ms; LCP TTFB share 89–96 %; `probe-paint.json` FCP 1.7–7.9 s | Run wp-env on WSL2/Linux volumes (or native Linux stack), enable opcache + DB persistence; re-run `ttfb-sample.js` until page medians < 500 ms, then re-audit code-level perf | S–M |
| H1 | High | code | every page `<head>` | scorecard `meta description present` 0/5; LH `meta-description` score 0 on all 5 pages | Add a unique Arabic meta description (~120–160 chars) per page (theme head support or plugin) | S |
| H2 | High | code | theme `<head>` | 0 og tags / 0 twitter tags in all `html-*.html`; scorecard 15 fails (og + og:image + twitter ×5) | Emit `og:title/description/type/url/site_name/image` + `twitter:card`; add a 1200×630 share image | S–M |
| H3 | High | code | theme/templates | 0 JSON-LD blocks ×5; scorecard `JSON-LD` 0/5 | Add `Dentist`/`MedicalClinic` (name, address, `OpeningHours`, geo, telephone) + `BreadcrumbList`; `FAQPage` for the home FAQ section | M |
| H4 | High | code | nav template + `/team/` | `link-inventory.json`: team internalLinks = {/, /services/, /team/, /contact/} — no `/book/`; grep shows nav = 3 items (الخدمات/الفريق/تواصل), home has 3 content CTAs but team none | Add a persistent "احجز زيارة" nav CTA + a booking button on `/team/` (and any CTA-less page) | S |
| M1 | Medium | code | services & team content | LH `heading-order` score 0 (a11y 98 on both); `html-team.html` h1 → h3×4; scorecard 2 fails | Demote section headings to h2 (h1 → h2 → h3, no skips) | S |
| M2 | Medium | config | WP settings | `/?author=1` 200 + indexable + title leaks `admin` (`html-author1.html`; scorecard site fail) | Noindex/disable author archives; rename the `admin` user | S |
| M3 | Medium | config | site title | home title 67 chars > 60 (scorecard fail) | Shorten title (drop the `(Demo)` tail / tagline) to ≤ 60 chars | S |
| M4 | Medium | code | `themes/siraj-theme/assets/img/` | LH `image-delivery` 0.5: 189 KiB est savings (71.7 + 68.1 + 53.8 KiB on the 3 JPEGs); images = 73 % of home weight; 4 imgs missing width/height; no WebP | Re-export at display size (~800 px) as WebP ≤ 60 KiB each; add explicit width/height (or aspect-ratio); keep lazy | M |
| M5 | Medium | config | server | `cache-insight` fails on all 5 (441 KiB home / 115 KiB others, `cacheLifetimeMs 0`, document `cache: none`) | `Cache-Control: max-age` for `/wp-content` static; page cache / CDN for HTML in production | M |
| M6 | Medium | code | templates/head | render-blocking: 3 stylesheets on every page — home wasted 1,353 ms (`fonts.css` 501, `navigation/style-rtl.css` 351, `style.css` 501); 37–40 KiB inline CSS; 13.9 KiB inline module script (`inline-assets.json`, `perf-detail.json`) | Inline critical CSS + preload fonts, defer the rest; trim inline scripts; keep same-3-file set minimal | M |
| L1 | Low | config | URL canonicalization | `/BOOK/`, `/SERVICES/`, `/TEAM/` → 200 with correct lowercase canonicals (`seo-extra*.json`, curl) — ranking-safe, but duplicate renders | 301 non-lowercase slugs to canonical case (rewrite rule / plugin) | S |
| L2 | Low | code | WP core | LH `unminified-javascript` fails ×5: `interactivity/index.js` 8.2 KiB wasted (of 27.7), `twemoji.js` 3.7 KiB (of 8.9) | Upstream WP; accept for demo or add a minify layer at deploy | S |
| L3 | Low | code | fonts | CLS 0.0447 on home/services = Alexandria woff2 swap (`clsSources`); book extra 0.0017 label shift; all pages ≤ 0.045 (pass) | `size-adjust`/metric overrides or `font-display: optional`; preload the critical subset | S |
| L4 | Low | env | LH robots.txt fetch | `robots-txt` audit score 0 on 4/5 runs: *"Fetch of robots.txt failed: Timed out fetching resource"*; file itself is valid (scorecard site checks pass; contact run passed) | No code change — re-run on a healthy env; symptom of C1 | — |

---

## 8. Five highest-impact fixes

1. **C1 — Fix wp-env PHP response time** (WSL2/Linux volumes + opcache; re-run `ttfb-sample.js` to < 500 ms medians): the observed 2–12 s document delay is 89–96 % of every LCP and the single biggest thing hurting real users and every re-audit.
2. **H1 — Add a meta description to all 5 pages**: the only SEO check failing everywhere; fixes the universal `meta-description` loss and controls the SERP snippet.
3. **H2 — Add Open Graph + Twitter tags and a 1200×630 share image**: resolves 15 of the 33 scorecard failures and fixes WhatsApp/Facebook/X previews for every page.
4. **H3 — Add JSON-LD** (`Dentist`/`MedicalClinic` + `BreadcrumbList`, `FAQPage` on home): unlocks rich-result eligibility and completes the on-page SEO baseline.
5. **M4 — Resize/re-encode the 3 hero JPEGs to WebP (~≤ 60 KiB each) and add width/height**: 189 KiB of the 460 KiB home payload is compressible image weight; the largest code-side performance lever after C1.

---

## 9. What could not be verified

- **Field data (CrUX/Core Web Vitals in the field):** none exists for localhost — all numbers are lab.
- **www / HTTPS canonicalization:** `www.localhost:8889` and `https://localhost:8889` are unreachable in wp-env (curl status 0) — redirect, HSTS and cert behaviour untestable here.
- **Mobile tap-target sizes:** Lighthouse `tap-targets` returned `n/a` on all five runs — not machine-verified.
- **robots.txt audit on a healthy environment:** failed by fetch timeout 4/5 runs (content itself verified valid by direct fetch + scorecard).
- **Production server behaviour** (page cache, HTTP/2, CDN, OS): dev wp-env only — C1's numbers are environment-specific and must be re-measured after the env change.
- **Booking form end-to-end submission** (POST latency/behaviour) was not exercised; only rendered pages were audited.
- **Rich-results rendering** (validator run): JSON-LD is currently absent anyway; re-validate after H3.
- **Lighthouse 13 Speed-Index internals:** simulated SI (18.9 s home) vs simulated FCP (1.6 s) is not internally reconcilable from the report alone; values are reported exactly as produced.
- **REST API exposure** (`/wp-json/wp/v2/types` lists post types): noted but out of scope — belongs to the plugin/security audit.

---

## 10. Evidence index

All under `docs/AUDIT/evidence/perf/`:

| Files | Contents |
|---|---|
| `lighthouse-{home,services,team,contact,book}.json`, `lighthouse-summary.json` | raw Lighthouse 13.5.0 reports (scores, audits, trace) |
| `run-lighthouse.js`, `extract.js`, `metrics-extract.json` | runner + extraction (simulated/observed metrics, LCP element/phases, CLS sources, long tasks) |
| `ttfb-sample.js`, `ttfb-sample.json` | 5-round TTFB comparison: PHP pages vs static assets vs robots.txt vs redirect |
| `probe-paint.js`, `probe-paint.json` | real-browser (CDP) TTFB/FCP/doc sizes per page |
| `probe-reveal.js`, `probe-reveal-tail.js`, `probe-reveal.json`, `probe-reveal-tail.json`, `reveal-*.png` | reveal-on-scroll behaviour, hidden-element checks, screenshots |
| `cls-scroll.js`, `cls-scroll.json` | CLS with/without scrolling |
| `perf-detail.js`, `perf-detail.json` | cache, image-delivery, render-blocking, unminified-JS, font/third-party audits |
| `inline-assets.js`, `inline-assets.json` | inline `<style>`/`<script>` inventory |
| `discover.js`, `seo-extract.json`, `html-{home,services,team,contact,book}.html` | SEO discovery + full HTML snapshots |
| `seo-extra*.js`, `seo-extra{,2,3}.json`, `html-{BOOK-uppercase,author1,feed,404,...}.html` | duplicates, case variants, author/feed/404 probes |
| `scorecard.js`, `seo-scorecard.json` | 104-check scorecard (71 pass / 33 fail) |
| `link-inventory.js`, `link-inventory.json` | anchors, ids, hash targets, internal/external links |
| `booking-cpt-check.js`, `booking-cpt-check.json`, `wp-json-*.json` | booking CPT archive/slug/REST/search exposure |
| `robots.txt`, `sitemap-index.xml` | fetched robots + sitemap index |
