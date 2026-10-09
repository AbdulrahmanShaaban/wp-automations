# PORTFOLIO — typed entries (P1 + P3)

Entry format per `OPENCODE_MASTER_BRIEF.md` Part 9. **Rules applied:** demos are labelled Demo; only measured/verified numbers; no invented clients, testimonials, live URLs, or production metrics.

---

## 1. Nilad — Arabic-first WooCommerce fashion store (Demo)

- **Title:** Nilad — متجر أزياء عربي (WooCommerce Demo)
- **Type:** Demo (personal/portfolio)
- **Problem:** Small Egyptian stores need an Arabic RTL storefront that feels local (governorate shipping, COD, Arabic order emails) plus day-to-order operational automation — most off-the-shelf setups are translated-English templates with none of it.
- **Solution:** WordPress **block theme** (no page-builder) + WooCommerce + custom `nilad-core` plugin + an n8n **“Order Ops Suite”** — everything as code (idempotent seed, verify gates, packaged handoff).
- **Key features:** Arabic RTL layout & typography · Egyptian shipping zones (القاهرة/الجيزة 60 ج.م · باقي المحافظات 90 · مجاني ≥1,500) · COD + bank transfer · server-side phone validation/normalization at the Store API (Arabic 400) · branded Arabic order emails (captured locally) · 8 demo products / 4 categories · mobile dock + working overlay menu · care-plan offer (`docs/CARE-PLAN.md`).
- **Technical decisions:** block theme + custom plugin over Elementor (owns the data, no builder lock-in) · seed rewritten to a single wp-cli boot (40+ min → ~50s) · deferred WooCommerce block registration until a Woo block renders · webhook secret lives in `wp option`, never in source (rotated 2026-10-07) · `package.ps1`/`npm run dist` builds the handoff zip with a mirrored exclusion list + forbidden-entry re-read (385/385, `package-secrets: PASS`).
- **Automation flow:** WooCommerce webhook (HMAC-signed) → n8n F1 new-order → Telegram + Sheet · F2 status → customer email · F3 pending-order recovery (every 3h) · F4 low-stock alert (08:00) · F5 daily summary (09:00) · F6 review request · F7 hourly site-up check → shared **Error Workflow** (any failure alerts the owner). Idempotency keys before every send; PII scrubbed from error messages; secrets only in `n8n/.env`.
- **Tests performed:** browser e2e `scripts/phase4-test.js` **9/9 PASS** (rates 60/90/free, invalid-phone Arabic 400, COD order round-trip) · n8n logic harness **87/87** · real-import validation **8/8 on n8n 2.41.6** · F1 **live-verified** (signed webhook → Telegram delivered; tampered signature → rejected + Error Workflow fired) · `scripts/verify.sh` **ALL PASS** (incl. §9 n8n) · QA: security **9/9** + SEO **15/15** on all 6 pages, Lighthouse a11y **100** / best-practices **96–100**, axe clean, **0** sub-24px targets · GATE `docs/AUDIT/GATE-2026-10-06.md` = **GO**.
- **Measured performance (honest):** lab-only, environment-bound — DB fast (0.075s for 8 products) while PHP over the wp-env bind mount gives TTFB 1.4–10.6s and perf scores 6–92; production numbers are a deployment item, not a claim.
- **Screenshots:** `p1-fashion-store/docs/portfolio-assets/{cover,desktop,mobile}.webp` · diagrams `{architecture,automation}.svg`.
- **Live URL:** none — local demo (wp-env). Publish gates tracked in `docs/AUDIT/GATE-2026-10-06.md` + `docs/ASSETS_TODO.md`.
- **Repo URL:** https://github.com/AbdulrahmanShaaban/wp-automations (folder `p1-fashion-store/`).
- **Real technologies:** WordPress (block theme, `theme.json`) · WooCommerce · official `paymob-for-woocommerce` (installed; live keys = owner) · PHP 8.3 / wp-env (Docker) · n8n 2.41.6 (workflows + tests) · Node scripts (seed/verify/e2e/package).
- **SEO title/description (proposed for launch):** `نيلاد — ملابس وإكسسوارات بجودة تليق بك | متجر تجريبي` / `تسوّق تشكيلة نيلاد: كاش عند الاستلام، شحن لكل المحافظات، واستبدال خلال 14 يومًا. (نموذج تجريبي)`.
- **Slug:** `nilad-fashion-store`

---

## 2. Siraj Dental Clinic — Arabic lead-gen + booking site (Demo)

- **Title:** Siraj Dental Clinic — عيادة سِراج للأسنان (Booking Demo)
- **Type:** Demo (personal/portfolio) — labelled Demo, no medical claims, no real patients, no people photos.
- **Problem:** A service business (clinic) needs trust-first presentation and a booking flow that works on a phone — without depending on a SaaS form or a plugin that phones home.
- **Solution:** Arabic RTL **block theme** (`siraj-theme`) + custom `siraj-core` plugin (booking shortcode + private CPT + hardening) + signed n8n → Telegram confirmation flow; content rules enforced by CI-style gates in `verify.sh`.
- **Key features:** trust-first homepage (services 01–06 with prices, work path, FAQ with FAQPage JSON-LD, team cards without photos, gallery) · booking page: nonce + honeypot + server-side validation + phone/date validation + per-IP throttle · success state with `role=status` + focus management · skip link, 0 axe violations, WCAG 2.2 target sizes · self-hosted Alexandria fonts (2 files ≈61KB) · reveal-on-scroll that degrades to fully visible without JS.
- **Technical decisions:** JS-only motion after measuring scroll-driven CSS fail-open (24/24 hidden w/o JS) · HMAC-SHA256 signed webhook (`X-Siraj-Signature: v1=…` + timestamp skew ≤300s) with **fail-open booking** (site never waits on n8n) · CORS pinned at `rest_api_init@99` + custom origin emitter (core strips the port) · opcache `validate_timestamps=0` via `php-tune` on **both** wp-env containers (afterStart) · “no people photos” rule implemented as a verify gate · seed owns page content (idempotent).
- **Automation flow:** booking saved (CPT + meta) → `do_action('siraj_booking_created')` → `notifier.php` signed POST (3s timeout, failure = `error_log` only) → n8n webhook (rawBody → verify → IF → 200/401) → Telegram staff alert + shared Error Workflow. Tested on a local sink: signature **VALID** (full Arabic payload), tampered/expired → 401; live runs = owner’s own n8n (license rule).
- **Tests performed:** `scripts/verify.sh` **50/50 ALL PASS** (incl. encoding gate, no-people gate, php-tune gate 4b) · booking e2e (invalid/valid/honeypot) green · security probe **68/0** · login throttle **9/0** · booking throttle **11/0** · axe-core 4.13 **0 violations ×10** · restart-resilience test (permalinks re-seeded, php-tune re-applied, sink chain re-validated) · GATE `docs/AUDIT/GATE-2026-10-08.md` = **GO**.
- **Measured performance (honest):** Lighthouse mobile home **76** perf / **100** a11y / **100** BP / **100** SEO (CLS 0.033); book **92/100/100/92** (CLS 0.002); warm TTFB ≈0.4–0.7s in the dev env; `.jpg → .webp` −81%; ceiling is bind-mount-bound — production numbers = publish gate.
- **Screenshots:** `p3-clinic/docs/portfolio-assets/{cover,desktop,mobile}.webp` · diagrams `{architecture,automation}.svg`.
- **Live URL:** none — local demo (wp-env, port 8889). Publish gates: `docs/AUDIT/GATE-2026-10-08.md` §4 + `docs/ASSETS_TODO.md`.
- **Repo URL:** https://github.com/AbdulrahmanShaaban/wp-automations (folder `p3-clinic/`).
- **Real technologies:** WordPress 7.1.3 (block theme, `theme.json` v3) · PHP 8.3 / wp-env · custom plugin (booking CPT, hardening, SEO, notifier) · n8n (HMAC webhook + Telegram + Error Workflow) · axe-core / Lighthouse in verify+audit loops.
- **SEO title/description (proposed for launch):** `عيادة سِراج للأسنان — احجز زيارتك أونلاين | نموذج تجريبي` / `فحص وتلطيف وتلميع بمواعيد مرنة في وسط البلد. موقع نموذجي لعرض تجربة الحجز الإلكتروني.`
- **Slug:** `siraj-dental-clinic`
