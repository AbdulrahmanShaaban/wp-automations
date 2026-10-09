# Accessibility + Arabic/RTL Audit — Nilad Fashion Store

| | |
|---|---|
| **Date** | 2026-10-06 |
| **Target URL** | http://localhost:8888 (WP 7.1.2 + Woo 11.1.2, theme `nilad-theme`, plugin `nilad-core`) |
| **Pages audited** | `/`, `/shop/`, `/product/linen-scarf/`, `/cart/`, `/checkout/` (real seeded cart), `/contact/` |
| **Standard** | WCAG 2.2 Level A/AA (axe tags: `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa, best-practice`) + `arabic-rtl` skill §10 checklist |
| **Viewports** | Desktop 1440×900, Mobile 390×844 (+ 1024×768 screenshot) |
| **Statement** | This is an evidence-based audit, **not** a conformance certification. The site is NOT claimed "WCAG compliant". |
| **Scope note** | READ-ONLY audit: no code/theme/plugin changes were made. |

## Commands & tools run

```bash
node docs/AUDIT/evidence/a11y/tools/run-audit.js           # axe + probes + 390px targets, 6 pages × 2 viewports (14:35)
node docs/AUDIT/evidence/a11y/tools/run-cart-checkout.js   # real seeded cart → cart + checkout axe/forms (14:41)
node docs/AUDIT/evidence/a11y/tools/kb-pass.js             # 17 keyboard checks @1440 (14:43)
```

Plus: chrome-devtools MCP live pass (Tab keyboard, `get_css_styles`, viewport emulate 390/1024/1440, screenshots, DOM/contrast evaluation), Lighthouse 13.4.1 via MCP (navigation/desktop → `evidence/a11y/lighthouse/report.json`, Chrome 154), PowerShell regex scans of live HTML (Arabic comma/digits), motion probes (`prefers-reduced-motion` + JS-disabled).

Versions: axe-core **4.13.0** · Lighthouse **13.4.1** · Chrome **154** · run log: `evidence/a11y/tools/rerun-20261006.log`.

## Phase 6 baseline delta

| Phase 6 claim | 2026-10-06 re-run | Delta |
|---|---|---|
| Lighthouse a11y = 100 | **100** (desktop, `lighthouse/report.json`) | unchanged |
| axe clean | **1 serious** on real checkout (`autocomplete-valid`, F4) + minors | **regression vs claim** — Phase 6 likely never scanned a non-empty checkout (empty cart redirects to cart) |
| 0 sub-24px targets | raw measure @390 finds **8 real sub-24 elements** (F7); axe `target-size` still passes via 24px-spacing exception (2.5.8 AA met) | claim inaccurate for raw sizes |

## Severity counts

**12 findings: 3 High · 1 Serious (axe) · 3 Medium · 5 Low.**
Direct WCAG 2.2 AA failures: **1.3.5 (F4), 3.1.2 (F6), 2.4.4 borderline (F5)**. F1–F3 are content-availability/functionality defects with severe user impact (no direct SC, but they break navigation/content for real users).

## Findings

| # | Severity | Area | Location | Evidence | Fix | Effort |
|---|---|---|---|---|---|---|
| F1 | **High** | Navigation ≤899px | `style.css:45` `.wp-block-navigation{display:none}` + `parts/header.html:11` `overlayMenu:"never"` → at 390px nav is hidden with **no menu toggle** (live: nav `display:none`, 4 links unreachable, `headerMenuButtons: 0`; dock has only cart/WhatsApp) | `evidence/a11y/mcp-live-home-20261006.json`, `screens/live-home-390.png`, `probe-home-mobile.json` | Switch to `overlayMenu:"mobile"` (WP hamburger) or add own toggle; only hide desktop nav when a mobile menu exists | M |
| F2 | **High** | Broken in-page anchors | `parts/header.html:13-15` links `/#cats`, `/#best`, `/#about` and hero CTA `front-page.html:27` `href="#cats"` → **targets don't exist** (live: only `#new` exists; sections have classes, not ids, while `style.css:53` styles `section[id]`) | `mcp-live-home-20261006.json` (`anchors`), `followup-nav-anchors.json` | Add `id="cats"`, `id="best"`, `id="about"` to the matching sections | S |
| F3 | **High** | Content without JS | `style.css:158` `.reveal{opacity:0}`; reveal JS `functions.php:48` — with JS disabled **13/13 `.reveal` elements stay opacity 0** (whole sections invisible); `functions.php:39` comment claiming no-JS visibility is false | `motion-nojs-home.json` (`revealTotal:13, hiddenCount:13`) | `@media (scripting:none){.reveal{opacity:1;transform:none}}` or `.no-js` fallback | S |
| F4 | **Serious** (axe) | Forms · WCAG 1.3.5 AA | WooCommerce checkout `#email autocomplete="section-contact contact email"` — `contact` is not a valid WHATWG autofill token (axe `autocomplete-valid` serious) | `axe-summary-cart-checkout.json`, `axe-checkout-desktop.json`, `axe-checkout-mobile.json` | Use `autocomplete="email"` (small post-render fix or upstream Woo report) | S |
| F5 | Medium | Link purpose · 2.4.4 (borderline) | `front-page.html:40-43,139-142` 8× `a.p-btn` labeled **"أضف للسلة" but `href="/shop/"`** (no cart action, no JS handler); category chips "هدوم/حقائب/ساعات/نظارات" also all → `/shop/` unfiltered | live eval (`pBtn`), `front-page.html` | Rename to "اتفرج على المتجر"/"عرض التفاصيل" or wire real AJAX add-to-cart; chips → `/shop/?product_cat=*` | S |
| F6 | Medium | Language of parts · 3.1.2 AA | English `"Demo"` badges (`span.badge.demo`, 8×) and inline Latin runs with **no `lang="en"` and no `<bdi>`** — live: `bdiCount:0`, `langEnCount:0`; emails contain unmarked Latin runs | `mcp-live-home-20261006.json`, `probe-home-*.json`, `email-inspect.json` | `lang="en"` on badges/Latin spans; wrap inline Latin in `<bdi>`/`dir="ltr"` | S |
| F7 | Medium | Touch targets · 2.5.5 AAA / 2.5.8 AA | Raw sub-24px @390: checkout checkbox+radio **20×20 (5)**, address-card edit **23.6×18.2**, cart product-name link **113×18.2**, shop `select.orderby` **162×19**. axe `target-size` passes (spacing exception) → 2.5.8 AA met, raw sizes still fail 24px guidance | `targets-checkout-390.json`, `targets-cart-390.json`, `targets-shop-390.json` | CSS `min-height/min-inline-size:24px` on WC checkbox/radio inputs, edit links, `select.orderby` (theme already fixes others at `style.css:185,190,195`) | S-M |
| F8 | Low | Arabic typography | `style.css:37` `letter-spacing:-.01em` on Arabic site title → live computed **-0.18px** (`arabic-rtl`: letter-spacing on Arabic must be 0; Latin-only rule at `:40` is fine) | `mcp-live-home-20261006.json` | `letter-spacing:0` for Arabic text | XS |
| F9 | Low | Forms · `arabic-rtl` | Checkout phone `type=tel` + autocomplete ✓ but **`inputmode` missing**; email/phone inputs missing `dir="ltr"` (Latin-entry fields) | `probe-checkout-desktop.json` (`probe.forms`) | `inputmode="tel"`/`"numeric"`; `dir="ltr"` on tel/email/postcode | XS |
| F10 | Low | Images | Cart/checkout cross-sell thumbs `image-redundant-alt` (minor, 4 nodes) in run-audit scan — passed in the run-cart-checkout scan (state-dependent) | `axe-summary.json` rows vs `axe-summary-cart-checkout.json` | Unique alt ("منتج مرتبط …") or `alt=""` | XS |
| F11 | Low | ARIA (manual review) | Product page `.woocommerce-product-gallery__trigger` `aria-controls` → photoswipe dialog id absent until gallery opened (axe incomplete `aria-valid-attr-value`, both viewports) | `axe-product-desktop.json`, `axe-product-mobile.json` | Upstream Woo; harmless while dialog closed | — |
| F12 | Low | Copy · RTL | Email date `"4 أكتوبر, 2026"` uses Western comma inside Arabic text (site elsewhere uses Arabic comma `،`) | `email-inspect.json` | `"4 أكتوبر 2026"` or Arabic comma | XS |

## `arabic-rtl` §10 checklist (26 items)

**Counts: PASS 15 · FAIL 5 · PARTIAL 2 · UNVERIFIED 1 · N/A 3**

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | `<html dir="rtl" lang="ar">` server-rendered, no JS direction switch / flash | **PASS** | all `probe-*.json` (`dir:rtl, lang:ar`); live `document.documentElement`; no direction scripts in theme |
| 2 | Skip link = first focusable → jumps to `main`, visible + focus ring | **PASS** | `kb-tests.json` (4 checks PASS), `followup-skiplink-focus.json`, live (475×61, 3px outline) |
| 3 | One `h1` per page, logical h2/h3 | **PASS** | probes: `h1Count:1` on all 6 pages; home h2×9 → h3 products |
| 4 | Landmarks banner/nav/main/contentinfo (+aside) | **PASS** | probes `landmarks`; live a11y tree (banner, nav, main, contentinfo, aside, status) |
| 5 | Arabic font loads — no Latin-only fallback | **PASS** | live `document.fonts` Cairo 400/700 loaded; `theme.json:35` Cairo-first |
| 6 | `line-height ≥ 1.6` for Arabic body | **PASS** | live body 17px / 28.9px = **1.7** (`theme.json:83`, `style.css` via global styles) |
| 7 | No justified Arabic text | **PASS** | `text-align:start`; no `text-align:justify` anywhere in `style.css` |
| 8 | `letter-spacing ≥ 0` on Arabic text | **FAIL** | site title **-0.18px** live (`style.css:37`) — F8 |
| 9 | One numeral system, consistent (Western vs Eastern) | **PASS** | 0 Eastern-Arabic digits across pages; prices/emails Latin digits (email-inspect: 721 Latin / 0 Eastern) |
| 10 | Digit policy documented in `docs/DECISIONS.md` | **FAIL** | keyword search (Western/Eastern/Latin digit/لاتيني/أرقام) found **no decision line** — consistent in code, undocumented |
| 11 | Dates: consistent Arabic format | **PARTIAL** | only sample: email `"4 أكتوبر, 2026"` — Western comma inside Arabic date (F12) |
| 12 | Currency `ج.م` consistent | **PASS** | prices, cart totals, emails (`email-inspect.json`) |
| 13 | Arabic plurals correct | **PASS** | "من 2–5 أيام عمل", "إرجاع خلال 14 يوم" (colloquial-acceptable); Woo i18n strings Arabic |
| 14 | All inputs have Arabic labels (not placeholder-only) | **PASS** | `probe-checkout*.json` (label/ariaLabel on all 15 controls); newsletter `screen-reader-text` label; live tree |
| 15 | Phone: `type=tel` + autocomplete + `inputmode` + `dir` | **FAIL** | autocomplete ✓, **`inputmode` ✗, `dir` ✗** (`probe-checkout-desktop.json`) — F9 |
| 16 | Errors adjacent to field, icon+text (not color-only), Arabic | **PASS** | `screens/co-01-checkout-validation-errors.png`: red border + `!` icon + Arabic text with field name |
| 17 | Mixed AR/EN isolated (`<bdi>` / `dir="ltr"` / `lang="en"`) | **FAIL** | live `bdiCount:0`, `langEnCount:0`; "Demo" badges ×8 bare — F6 |
| 18 | Arabic comma `،` used; numeral style consistent | **PASS** | live-text scan: 6× Arabic comma, **0** Western commas between Arabic words |
| 19 | Search UI in Arabic (results, zero state) | **N/A** | no search template/control exists in the theme |
| 20 | RTL carousel/slider motion handled | **N/A** | no carousel; only native RTL overflow row (`.row-scroll`), no autoplay/mirrored transforms |
| 21 | `prefers-reduced-motion` honored (incl. RTL) | **PASS** | `motion-reduced-home.json` (hiddenCount 0); `style.css:166-168` |
| 22 | Content stays visible with JS disabled | **FAIL** | `motion-nojs-home.json`: 13/13 `.reveal` elements opacity 0 — F3 |
| 23 | Arabic email templates (subject/body/currency) | **PASS** | `email-inspect.json`: Arabic subjects/bodies, `ج.م`, Latin digits, no lorem |
| 24 | Email template HTML `dir="rtl"` attribute | **UNVERIFIED** | Woo templates live inside the wp-env container, not on host disk |
| 25 | `arabic-rtl` tests included (bidi/lang) | **PARTIAL** | axe `html-has-lang`/`html-lang-valid` PASS + manual bidi/lang matrix + live checks; no repo unit tests for bidi found |
| 26 | PDF/print output in Arabic | **N/A** | no PDF/print feature in demo |

## 5 highest-impact fixes

1. **F1 — restore mobile navigation**: set `overlayMenu:"mobile"` (or add a hamburger) instead of `display:none` ≤899px — today the entire header nav is unreachable on phones (the primary device for Egyptian retail).
2. **F2 — add the missing section ids** (`id="cats"|"best"|"about"`) — three header links + the hero CTA currently do nothing when clicked.
3. **F3 — make `.reveal` visible without JS** (`@media (scripting:none)`) — otherwise whole homepage sections are invisible whenever the inline script fails or JS is off.
4. **F4 — fix checkout `autocomplete`** (`"section-contact contact email"` → `"email"`) — removes the only serious axe violation (WCAG 1.3.5).
5. **F5+F6 — truthful link labels + `lang="en"` on "Demo" badges**: rename "أضف للسلة" links that only navigate to `/shop/`, and mark English runs — fixes 2.4.4/3.1.2 and removes user-trust traps.

## Could not verify

- **Woo email template HTML `dir`/structure** — templates live inside the wp-env container; verified rendered text via mail log only (item 24).
- **Real screen-reader output** (NVDA/JAWS/VoiceOver) and **voice-control** naming — no assistive tech available in this environment.
- **Keyboard pass at 390px** — kb-pass ran at 1440 only; mobile axe + live Tab sampling done, full mobile focus chain not scripted.
- **2 of 4 home `color-contrast` incomplete nodes** — sampled 2 manually (`Demo` badge 16.41:1 PASS, `.tile` span ≈12.1:1 PASS vs darkest gradient stop); remaining 2 are same classes but were not individually sampled.
- **Lighthouse mobile score** — only desktop run performed.
- **Photoswipe `aria-controls` behavior while gallery open** (F11) — dialog is created on demand; not exercised.
- **DECISIONS.md digit policy** — negative keyword search; a differently-worded decision cannot be fully ruled out.
- **Real devices/touch hardware** — viewport emulation only (390×844, touch enabled).

## Evidence index (`docs/AUDIT/evidence/a11y/`)

- axe: `axe-{home,shop,product,cart,checkout,contact}-{desktop,mobile}.json`, `axe-summary.json`, `axe-summary-cart-checkout.json`
- probes/structure: `probe-*.json` (6 pages × 2 viewports)
- keyboard: `kb-tests.json` (17/17 PASS), `kb-focus-chain-{home,cart,checkout}.json`, `screens/kb-*.png`
- touch targets @390: `targets-{home,shop,product,cart,checkout,contact}-390.json`
- motion: `motion-reduced-home.json`, `motion-nojs-home.json`
- contrast: `contrast-home-desktop.json`, `contrast-color-syntax-v2.json`, live math in `mcp-live-home-20261006.json`
- i18n/email: `email-inspect.json`, `tools/mail-log.json`
- live MCP pass: `mcp-live-home-20261006.json`; screenshots `screens/live-home-{1440,1024,390}.png`, `screens/co-01-checkout-validation-errors.png`
- Lighthouse: `lighthouse/report.json` + `report.html` (a11y 100)
- run log: `tools/rerun-20261006.log`; pre-run backup: `%TEMP%\a11y-bak-20261006-143450`
