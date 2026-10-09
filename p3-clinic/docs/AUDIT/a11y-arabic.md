# Accessibility + Arabic/RTL Audit — Siraj Clinic (p3)

| | |
|---|---|
| **Date** | 2026-10-08 |
| **Target URL** | http://localhost:8889 (WP 7.1, block theme `siraj-theme`, plugin `siraj-core`, wp-env Docker) |
| **Pages audited** | `/`, `/services/`, `/team/`, `/contact/`, `/book/` |
| **Standard** | WCAG 2.2 Level A/AA (axe tags: `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa, best-practice`) + `arabic-rtl` skill §10 checklist |
| **Viewports** | Desktop 1440×900, Mobile 390×844 (+ 1024×768 screenshots) |
| **Statement** | This is an evidence-based audit, **not** a conformance certification. The site is NOT claimed "WCAG compliant". |
| **Scope note** | READ-ONLY audit: no code/theme/plugin changes were made. |

## Commands & tools run

```bash
node docs/AUDIT/evidence/a11y/tools/run-audit.js        # axe + probes + targets@390 + screenshots, 5 pages × 2 viewports (2026-10-08 04:22)
node docs/AUDIT/evidence/a11y/tools/kb-nav.js           # 33 keyboard/menu checks (/ , /book/ @1440; overlay menu @390)
node docs/AUDIT/evidence/a11y/tools/booking.js          # 21 booking-form checks (static/invalid/retained/honeypot/success/no-JS)
node docs/AUDIT/evidence/a11y/tools/motion.js           # 16 motion checks (JS on/off + prefers-reduced-motion)
node docs/AUDIT/evidence/a11y/tools/contrast-followup.js# manual contrast math for the 7 axe color-contrast incompletes
node docs/AUDIT/evidence/a11y/tools/visual-verify.js    # pixel decode of screenshots (skip link, error states, fingerprints)
node docs/AUDIT/evidence/a11y/tools/debug-skiplink.js   # live root-cause probe of the skip link + fresh screenshot md5
```

Earlier in-session baselines: `kb-pass.js` (superseded by kb-nav), `booking-form.js` (superseded by booking.js), `nav-mobile.js` + `nav-followup.js` (overlay-menu behavior), `contrast.js`, `html-scan.js`.

Versions: axe-core **4.13.0** · Chrome **154.0.8037.98** (headless=new) · screenshots reviewed both visually and by PNG pixel-decode (`visual-verify.json`).

## Baseline delta

No prior accessibility audit exists for p3 (first run). The one related claim in `docs/PLAN.md:31` — `.reveal` content visible without JS (24/24) + `prefers-reduced-motion` guard — was **re-verified ✓** (`motion-tests.json` 16/16 PASS, `motion-js-off-home.json` `hiddenCount:0` of 24).

axe results: **2 rule hits total** — `heading-order` (moderate, best-practice) on `/services/` and `/team/`, both viewports; everything else 0 violations on 10 page-viewport runs. The 7 home `color-contrast` **incomplete** nodes were computed manually and **all pass** (worst case 5.71:1 vs the gradient band, 6.34:1 vs solid — `contrast-manual-home.json`).

## Severity counts

**8 findings: 1 High · 3 Medium · 4 Low.**
Direct WCAG 2.2 failures: **2.4.7 Focus Visible (F1), 3.1.2 Language of Parts (F4), 2.4.4 borderline (F3)**. F2 is an axe best-practice/structure violation (not an SC). The headline surprise: F1 was initially recorded as PASS by computed-style keyboard checks — **pixel verification overturned it** (computed outline ≠ painted pixels).

## Findings

| # | Severity | Area | Location | Evidence | Fix | Effort |
|---|---|---|---|---|---|---|
| F1 | **High** | Skip link invisible when focused · WCAG 2.4.7 AA | `style.css:77-78` `.screen-reader-text{… clip:rect(0,0,0,0)}` — on real Tab focus, size/position/`clip-path` are restored by the focus styles (rect `4,4 → 184.6×48`, outline `3px solid rgb(163,35,27)`, `z-index:100000`) but **computed `clip` stays `rect(0,0,0,0)` → zero painted area**; `elementFromPoint()` over the link returns `.site-header`, and pixel scan finds **0 accent-red pixels** near the skip box (`kb-01` ≡ `home-1440` ≡ fresh live shot, md5 `A4B56E05…`). Activation still works (Enter jumps to `#wp--skip-link--target` ✓), but sighted keyboard users see nothing | `debug-skiplink.json`, `visual-verify.json` (`skipLink`), `kb-tests.json` (computed PASS ×4), `screens/kb-01-skip-link-focused.png` | Remove the legacy `clip` from `style.css:78` (the `clip-path` alone hides it), or add `.screen-reader-text:focus{clip:auto!important;clip-path:none!important}` — same rule WP core uses | XS |
| F2 | Medium | Heading order · axe `heading-order` moderate (best-practice) | `/services/` h1 → h3 (`h3:nth-child(2)` "فحص وتشخيص") and `/team/` h1 → h3 ("طبقة التقويم") — heading level skips; **both viewports**, 1 node each | `axe-services-{desktop,mobile}.json`, `axe-team-{desktop,mobile}.json`, `axe-summary.json` (`headingSkips:1`), `screens/services-1440.png` | Demote the service/role headings to `h2` (they directly follow the page `h1`), or wrap each block in an `h2` section heading | S |
| F3 | Medium | Link purpose · 2.4.4 (borderline) | `parts/header.html:15` header CTA **"احجز زيارة" → `/contact/`** on every page, while identical label → `/book/` elsewhere (`front-page.html:13,255`, contact-page CTA, footer CTA) — same accessible name, two different destinations (9 CTA instances in `ctaByLabel`) | `analysis-notes.json` (`crossPage.ctaByLabel`), `probe-*-desktop.json` (`ctaLinks`), `header.html:15` vs `front-page.html:13` | Point the header CTA at `/book/` (the actual booking page), or rename it ("تواصل معنا") if contact is intended | XS |
| F4 | Medium | Language of parts · 3.1.2 (A) | English runs without `lang="en"`: header brand badge `<span class="demo-badge">Demo</span>` (`parts/header.html:4`, all pages — `langAncestor:"ar"`), footer `(Demo)` (`parts/footer.html:8`), stamp `سراج · Cairo` (`front-page.html:42`). **0 `<bdi>` on all 5 pages**; only the home/contact info badge is correctly tagged (`front-page.html:234`, `langAncestor:"en"`). Latin runs do render in correct order (zoom of `RX—001` / footer `Cairo 2024` verified) | `analysis-notes.json` (foreignRuns, `langEnCount:1` on home, `bdiCount:0` everywhere), `header.html:4`, `footer.html:8`, `front-page.html:42,234` | `lang="en"` on every English run (header badge, footer "(Demo)", "Cairo"); wrap free-standing Latin runs in `<bdi>` | XS |
| F5 | Low | ARIA pattern mismatch (WP core) | Menu toggle: `aria-haspopup="dialog"` but **no `aria-expanded`/`aria-controls`**, and the open overlay container (`#modal-1`) has **no `role="dialog"`/`aria-modal`** — the button promises a dialog that never materializes in the a11y tree (behavior itself works: open/close/Escape/focus-trap all PASS) | `nav-followup.json` (`toggleAttrs`), `navmenu-open-390.json`, `nav-mobile.json` | Upstream WP; if customized later: `aria-expanded` on the button + `role="dialog"` (or drop `aria-haspopup`) | — |
| F6 | Low | Booking success not announced · 4.1.3-adjacent | After valid submit, server renders `role="status" tabindex="-1"` but focus stays on `<body>` (`focusOn:"body"`) — on a full page load a pre-existing `role=status` is **not** announced by screen readers, and focus doesn't land on it | `booking-success.json`, `screens/booking-1440-success.png` | Small JS after render: `document.querySelector('[role=status]').focus()` (the `tabindex="-1"` is already there) | XS |
| F7 | Low | Digit policy undocumented · `arabic-rtl` §10 | Western digits everywhere, consistently (`digits.eastern=0` on all 5 pages; error messages western-only: `eastern:0, latin:38`) but **no decision line** in `docs/DECISIONS.md` (keyword search: digit/Western/Eastern/لاتيني/أرقام) | all `probe-*.json`, `booking-tests.json` (`errors-western-digits-only`), docs keyword search | One line in `docs/DECISIONS.md`: "أرقام لاتينية (Western) في كل النصوص العربية" | XS |
| F8 | Low | Arabic typography | Hero `h1` line-height **1.15** (84px/96.6px, `probe-home-desktop.json` `lowLineHeight`) — tight for Arabic display text; no clipping observed in current copy, but headings containing tashkeel risk it | `probe-home-desktop.json`, `screens/home-1440-full.png` | `line-height:1.25–1.4` on `h1`/display sizes | XS |

## `arabic-rtl` §10 checklist (26 items)

**Counts: PASS 15 · FAIL 2 · PARTIAL 4 · N/A 5**

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | `<html dir="rtl" lang="ar">` server-rendered, no JS direction switch / flash | **PASS** | all `probe-*.json` (`dir:rtl, lang:ar`); no direction scripts in theme; `verify.sh:89-100` asserts both |
| 2 | Skip link = first focusable → jumps to `main`, **visible** + focus ring | **FAIL** | first-focusable ✓, target `#wp--skip-link--target` ✓, computed outline ✓ — but **0 painted pixels** when focused → F1 |
| 3 | One `h1` per page, logical h2/h3 | **PARTIAL** | `h1:1` on all 5 pages ✓; heading skip h1→h3 on services+team → F2 |
| 4 | Landmarks banner/nav/main/contentinfo (+aside) | **PASS** | `analysis-notes.json` landmarks: header/nav/main/footer 1× each page, aside on home; axe `landmark-*` rules clean |
| 5 | Arabic font loads — no Latin-only fallback | **PASS** | `fonts-platform.json`: **Alexandria** 400/700 `document.fonts` loaded, Arabic glyph counts 36/95 on hero h1/lead |
| 6 | `line-height ≥ 1.6` for Arabic body | **PASS** | body 16px / 27.2px = **1.7** (`probe-home-desktop.json` `bodyStyle`) |
| 7 | No justified Arabic text | **PASS** | `justifySeen:null` on all 5 pages; no `text-align:justify` in `style.css` |
| 8 | `letter-spacing ≥ 0` on Arabic text | **PASS** | `negativeLetterSpacing:null` on all 5 pages (P1's title bug not repeated) |
| 9 | One numeral system, consistent (Western vs Eastern) | **PASS** | `digits.eastern=0` all pages (home 69 Latin, services 27, contact 17, book 14, team 0); errors western-only |
| 10 | Digit policy documented in `docs/DECISIONS.md` | **FAIL** | keyword search found no decision line → F7 |
| 11 | Dates: consistent Arabic format | **PARTIAL** | only date UI is `input[type=date]` — displayed format follows browser locale (`mm/dd/yyyy` in en-US headless); no site-rendered dates; hint text Arabic ✓ (`booking-static.json`) |
| 12 | Currency `ج.م` consistent | **PASS** | `digits.egp`: home 6, services 6 (`من 12,000 ج.م`); western thousands separators |
| 13 | Arabic plurals correct | **PASS** | samples: "أربع خطوات", "أقل من دقيقتين", "3 أحرف على الأقل", "يوميًا 10ص — 9م" — colloquial-acceptable |
| 14 | All inputs have Arabic labels (not placeholder-only) | **PASS** | `booking-static.json` `unlabelled:0`, 7/7 visible controls labelled, `placeholder:null` everywhere |
| 15 | Phone: `type=tel` + autocomplete + `inputmode` + `dir` | **PASS** | `autocomplete:"tel"`, `inputmode:"tel"`, `dir:"ltr"`, `aria-required`, hint `aria-describedby` (P1 failed this row; here all four ✓) |
| 16 | Errors adjacent to field, icon/text (not color-only), Arabic | **PASS** | `role=alert` summary + per-field `siraj-error` + `aria-invalid` + `aria-describedby{hint,error}`; check `errors-visible-not-color-only` PASS; `screens/booking-1440-invalid.png` (red summary box + 18k red px in form region) |
| 17 | Mixed AR/EN isolated (`<bdi>` / `dir="ltr"` / `lang="en"`) | **PARTIAL** | info badge `lang="en"` ✓; header badge + footer "(Demo)" + "Cairo" unmarked, `bdiCount:0` → F4 (renders correctly regardless) |
| 18 | Arabic comma `،` used; numeral style consistent | **PASS** | `arabicComma`: 24/7/6/2/4 per page; `westernCommaInArabic:0` everywhere |
| 19 | Search UI in Arabic | **N/A** | no search template/control exists |
| 20 | RTL carousel/slider motion handled | **N/A** | no carousel/slider in theme |
| 21 | `prefers-reduced-motion` honored (incl. RTL) | **PASS** | `motion-reduced-home.json`: query matches, script not armed, `.rule` animation none, all content visible |
| 22 | Content stays visible with JS disabled | **PASS** | `motion-js-off-home.json`: 24 reveals, `hiddenCount:0` (matches PLAN.md:31 claim ✓) |
| 23 | Arabic email templates | **N/A** | demo has no email at all (`booking.php:8` "no email or SMTP in this demo") |
| 24 | Email template HTML `dir="rtl"` | **N/A** | no email templates exist |
| 25 | `arabic-rtl` tests included (bidi/lang) | **PARTIAL** | `scripts/verify.sh:89-100` asserts `dir="rtl"` + `lang="ar"` on home HTML; axe lang rules PASS; manual bidi/lang matrix run — but no dedicated bidi unit tests in repo |
| 26 | PDF/print output in Arabic | **N/A** | no PDF/print feature in demo |

## 5 highest-impact fixes

1. **F1 — restore the skip link's focus visibility**: drop the legacy `clip:rect(0,0,0,0)` from `style.css:78` (or add `.screen-reader-text:focus{clip:auto!important}`). Today the very first Tab stop paints nothing — the site's primary keyboard affordance is invisible (2.4.7).
2. **F2 — fix heading order on `/services/` and `/team/`**: demote the h3 blocks to h2 (they follow h1 directly) — removes the only axe violations in the whole audit and restores logical heading navigation.
3. **F3 — align the header CTA destination with its label**: "احجز زيارة" must go to `/book/` (or be renamed) so the same accessible name stops meaning two things.
4. **F4 — mark English as English**: `lang="en"` on header/footer "Demo" badges and "Cairo", plus `<bdi>` for free-standing Latin runs (3.1.2).
5. **F6 — focus the success status** after booking submit (the `tabindex="-1"` is already in place) so screen-reader users are told the booking landed.

## Keyboard, motion & forms (summary of passes)

- **33/33 keyboard checks** (`kb-tests.json`): skip-link focusable/activates (visibility → F1), full tab chains on `/` and `/book/` with **no focus trap**, every stop ≥1 visible outline (except excluded native date-widget internal stops), shift-tab reverses, FAQ `<details>` opens with Enter **and** Space, focus rings visible in `screens/kb-home-focus-ring.png`.
- **Overlay menu @390** (part of the 33): hamburger reachable (24×24 = exactly WCAG 2.5.8 minimum), opens via real key events, focus moves inside and stays trapped inside, Escape closes and restores focus, scroll locked while open, no desktop-link duplication (`navmenu-*.json`, `nav-followup.json`).
- **21/21 booking-form checks** (`booking-tests.json`): 7/7 labelled, honeypot 1×1 clipped + `tabindex="-1"` + labelled, `role=alert` ×4 errors with `aria-invalid`+`aria-describedby` adjacency, values retained on invalid, phone error shown, Western digits only in messages, `role=status` on success, **JS-disabled native POST validates and re-renders errors** (`booking-nojs-post.json`).
- **16/16 motion checks** (`motion-tests.json`): reveal content visible with JS off and under `prefers-reduced-motion`.
- **Touch targets @390**: raw probe `small:[]` on all 5 pages; axe `target-size` passed (no violations/incomplete) → WCAG 2.5.8 AA met.
- **No horizontal overflow** on any page/viewport; **0 unlabelled controls**; **0 images without alt**.

## Could not verify

- **Real screen-reader output** (NVDA/JAWS/VoiceOver) and **voice-control** naming — no assistive tech in this environment (F6 announcement behavior reasoned from spec, not heard).
- **Lighthouse a11y score** — not run in this session (axe + manual probes used instead).
- **Full tab chain at 390px** — menu behavior fully tested at 390; complete mobile focus chain only spot-checked (desktop chains scripted for `/` and `/book/`).
- **Chrome native date-widget internal tab stops** (4 stops) — excluded by design; host `:focus-visible` intentionally drops on the last internal stop (`kb-date-native-internal.json`, `screens/kb-07-date-native-internal-focus.png`).
- **Which stylesheet's focus rule "should" clear `clip`** (core vs theme cascade) — computed behavior verified live (clip persists at focus); the fix is identical either way.
- **DECISIONS.md digit policy** — negative keyword search; a differently-worded decision cannot be fully ruled out.
- **Real devices/touch hardware** — viewport emulation only (390×844).
- **Print/PDF and email output** — features don't exist in this demo (§10 rows 23/24/26 N/A).

## Evidence index (`docs/AUDIT/evidence/a11y/`)

- axe: `axe-{home,services,team,contact,book}-{desktop,mobile}.json`, `axe-summary.json` (10 runs, only `heading-order`)
- probes/structure: `probe-*-desktop|mobile.json` (5 pages × 2), `analysis-notes.json` (cross-page `ctaByLabel`, foreignRuns, digits, landmarks)
- keyboard: `kb-tests.json` (33/33), `kb-focus-chain-{home,book}.json`, `kb-date-native-internal.json`, `navmenu-{open,closed,after-esc,tabstops}-390.json`, `nav-{mobile,followup}.json`
- booking form: `booking-{static,invalid,invalid-retained,honeypot,success,nojs,nojs-post}.json`, `booking-tests.json` (21/21)
- motion: `motion-{js-on,js-off,reduced}-{home,book}.json`, `motion-tests.json` (16/16)
- contrast: `contrast-incomplete-home.json` (axe's 7 nodes), `contrast-manual-home.json` (all PASS, 5.71–17.15:1), `contrast-sampled.json`
- visual/pixel verification: `visual-verify.json` (skip link = 0 red px, error-state red/pink counts, screenshot fingerprints), `debug-skiplink.json` (live root cause + fresh md5), `screens/skiplink-live-focused.png`
- touch targets: `targets-{home,services,team,contact,book}-390.json` (small:[] everywhere)
- fonts: `fonts-platform.json` (Alexandria loaded)
- screenshots: `screens/*-{1440,1440-full,390,390-full,1024}.png`, `screens/kb-*.png`, `screens/booking-*.png`, `screens/motion-*.png`, `screens/nav-390-*.png`
- HTML snapshots: `html/*.html`; run logs: `tools/*.log`
