# Case study — P3 — Siraj Dental Clinic (Demo)

**An Arabic RTL clinic demo with signed booking automation**

**Type:** lead-gen + booking demo (labelled **Demo**; no medical claims, no payments, no WooCommerce) · **Stack:** WordPress 7.1.3 block theme `siraj-theme` + custom plugin `siraj-core`, PHP 8.3, `@wordpress/env` on Docker (**port 8889**), n8n workflow delivered as signed-HMAC JSON · **Market:** Egypt · **Language:** Arabic, RTL only · **Delivered:** 2026-10-06 → 2026-10-08

---

## Context

Siraj is a fictional Egyptian dental clinic, built as a portfolio demo. The whole site is Arabic RTL (`lang=ar`), every piece of copy is fictional and marked **Demo** in the footer, there are no medical claims, no before/after, no invented statistics or testimonials, and no payment flow of any kind (`docs/DECISIONS.md` → `content-demo-no-medical-claims`, `stack-wordpress-block-theme`). The single action a visitor is asked to take is **book a visit**.

## The problem it solves

A small service business (clinic, salon, studio) needs two things a template rarely gives it:

1. **Trust before contact.** A clinic visitor judges the business on how careful the site looks — clear services with prices, a real face of the place, honest labelling, no layout that breaks on a phone. Trust here is also compliance: a demo that *looks* like a real clinic with a real staff and real results is a liability, so the content rules are hard rules, not preferences.
2. **A booking path that does not depend on a plugin vendor.** The obvious route is Amelia/Bookly: licences, updates, cost ceilings, and calendar-sync requirements for a demo that needs none of that. The booking here is one shortcode in a plugin we own — zero external dependencies, data landing in a custom post type the owner can actually open in wp-admin (`booking-custom-plugin`, `booking-stores-in-custom-post-type`).

## What was built

- **Block theme `siraj-theme`** from an owner-approved design contract (`design/APPROVED.md`): direction **A «الروشتة» / the prescription pad**, approved **2026-10-06** — clinical-blue/ink palette, Alexandria only (no Cairo/Inter), soft 14px radius, a signature moment where the rule under the headline draws itself. Directions B and C stay in the repo as previews and were never built — the choice was deliberate, not defaulted.
- **Homepage sections:** services 01–06 with prices · image gallery (3 approved equipment/implant frames) · team as **monogram cards** · 4-step work path · FAQ (5 `details/summary`) · contact strip · booking CTA → `/book/`. Seeded pages: home / services / team / contact / book (the theme also ships a 404 template), all from a single idempotent boot (`seed-wp.php` + `scripts/seed.sh` — run twice = no duplicates).
- **Plugin `siraj-core`:** booking shortcode `[siraj_booking]` + private CPT `siraj_booking` (nonce + honeypot + full server-side validation, `public => false`, hashed IP) · `hardening.php` (security headers, CORS pin, throttles) · `seo.php` (meta/OG/JSON-LD) · `notifier.php` (signed n8n webhook).
- **The no-people-photos rule as a trust decision.** The owner asked for it; it also closes the recorded risk that stock photos read as a real clinic or a real staff. Visual screening rejected `team-ortho.jpg` and `band-exam.jpg`; team = monogram cards; approved imagery = equipment/implant details + an empty waiting room. It is enforced by a `verify.sh` gate, not by memory (`no-people-photos-in-demo`).
- **Motion without a library:** reveal-on-scroll over 24 elements, hidden state tied to a `js-motion` class the script adds itself, `prefers-reduced-motion` respected, no GSAP.

## Technical decisions worth defending

- **JS-only reveals after a measured failure of scroll-driven CSS.** `@supports (animation-timeline:view())` + `fill-mode:both` hid **24/24** elements with the JS path dead, and `CSS.supports()` returned false over a missing parenthesis (`'view'` vs `'view()'`). The CSS is visible-by-default and the failure is recorded (`docs/PLAN.md` 2026-10-07, `docs/PROBLEMS.md`) — measured, not guessed.
- **HMAC-signed webhook with a fail-open booking policy.** `notifier.php` signs `"<ts>.<rawBody>"` with HMAC-SHA256, sends `X-Siraj-Signature: v1=…` + `X-Siraj-Timestamp` (skew ≤ 300s), 3s timeout, and on failure writes one `error_log` line — **the booking never waits on n8n** (`booking-confirmation-hmac-webhook`).
- **`php-tune` for the bind-mount opcache.** Dev TTFB was 16–53s because Docker's Windows bind mount stats ~490 files per request; `scripts/php-tune.js` writes `validate_timestamps=0` + realpath/opcache 192MB/20000 files and is wired to `lifecycleScripts.afterStart` on both containers (`php-tune-lifecycle-validate-timestamps-0`).
- **Seed as a single idempotent boot.** One `wp-cli` pass creates/updates identity, pages and content; re-running is a no-op, so rebuilds don't drift and there is no `.sql` dump to keep in sync (`seed-owns-page-content`).
- **Self-hosted fonts from day one.** Alexandria ships as two woff2 files (arabic + latin ≈61KB, 10 faces) served from the theme, CDN only as a fallback — the P1 audit lesson applied at birth (`font-alexandria-only`, `functions.php`, `scripts/fetch-fonts.mjs`).
- **A gate per regression, not a promise.** Every class of bug that bit this project became a permanent `verify.sh` check: the **encoding gate** (PowerShell double-encoded the Arabic template once → tofu), the **no-people gate**, and the **php-tune gate** (a `wp-env start` silently reverts the ini). `verify.sh` ended at **50/50 ALL PASS**.

## The automation flow

```
booking saved (siraj_booking CPT + meta)
  → do_action('siraj_booking_created')   [fired AFTER meta is written]
  → siraj-core/notifier.php              HMAC-SHA256 signature
       X-Siraj-Signature: v1=hex(HMAC-SHA256("<timestamp>.<rawBody>"))
       X-Siraj-Timestamp: <unix seconds>   (skew ≤ 300s · 3s timeout · fail → error_log only)
  → n8n webhook (rawBody)                Code node verifies → IF → Respond 200 / 401
  → Telegram alert to the owner          + Error Workflow (error-alert.json) on failure
```

- The trigger is an explicit domain event, not `save_post` — testing showed `save_post` fires inside `wp_insert_post` **before** the meta exists, which shipped an empty payload once and was fixed with the explicit action.
- Verified three ways with the same logic: the Code node in `workflows/booking-confirmation.json`, `scripts/n8n-sink.js`, and the notifier itself.
- **Local sink test** (`docs/evidence/n8n-sink-test.txt`): full VALID payload (booking id=32) · tampered signature → **401** · expired timestamp → **401**. Post-restart the whole chain ran again: booking → e2e green → sink `signature:VALID skew=0` (id=34, `docs/evidence/n8n-sink-e2e.txt`).
- **Live runs belong to the owner's n8n** — n8n's licence forbids hosting it for a client on your own server, and the bot/data are the owner's (`n8n/README.md` spec item 10, `booking-confirmation-hmac-webhook`). The flow is delivered as importable JSON + runbook; options currently point at the local sink.

## Verification — measured, not asserted

Every number below is from `docs/AUDIT/GATE-2026-10-08.md` (verdict **GO**), post-remediation, evidence in `docs/AUDIT/evidence/remediation/`.

| Check | Result |
|---|---|
| Security probe (headers ×6 pages, generator, OG/JSON-LD, enumeration, CORS, 301 case, uploads, WDD, lang) | **PASS=68 FAIL=0** |
| Login throttle (5×200 → 429 + `Retry-After: 900` + Arabic message, counter=5) | **PASS=9 FAIL=0** |
| Booking throttle (nonce, 6 failed validations then generic reject, counter=6, bookings unchanged) | **PASS=11 FAIL=0** |
| axe-core 4.13 — 5 pages × 2 viewports (1440/390) | **0 violations × 10 runs** |
| Lighthouse home | **76 / 100 a11y / 100 BP / 100 SEO — CLS 0.033** |
| Lighthouse `/book/` | **92 / 100 a11y / 100 BP / 92 SEO — CLS 0.002** |
| `scripts/verify.sh` (incl. `php -l` ×7, encoding gate, no-people gate, php-tune gate) | **50/50 ALL PASS (exit=0)** |
| `scripts/booking-e2e.js` | **green** — invalid → in-field Arabic error + `aria-invalid` + values retained · valid → `role="status"` + `successFocused=true` · honeypot → rejected · stored rows unchanged |
| Restart resilience (`wp-env start` full cycle) | php-tune rewritten on **both** containers, permalinks restored by `seed.sh`, verify gate 4b passes → **50/50**, booking chain + notifier → sink `VALID` (id=34) |

## Measured performance — and the honest limit

- Lighthouse (mobile, lab): home **76/100/100/100**, `/book/` **92/100/100/92**; CLS **0.033** / **0.002**.
- Warm **TTFB ≈ 0.4–0.7s** after `php-tune` (the first requests are warm-up).
- Images went `.jpg → .webp` (**−81%**), all page references converted (probe jpg refs = 0).
- **These numbers measure this machine, not a storefront.** The ceiling is the Windows bind mount under Docker (finding C1); Lighthouse's `cache-insight`/`robots-txt` failures are environment artefacts (no server cache headers in wp-env, sitemap URL is `localhost:8889`). **Production performance is a publish gate, not a claim** (`GATE-2026-10-08.md` §3 and its publish gates).

## What was NOT verified

- **Live n8n.** Signed workflow JSON + local-sink proof only; the production run happens on the owner's server (`n8n/README.md`).
- **Production performance / Core Web Vitals in the field.** Lab data on a dev bind mount; no field data exists.
- **Email.** No SMTP and no delivered mail exist (booking notifications are **Telegram only**).
- **Payments.** None exist — out of scope by design (no WooCommerce, no gateway).
- **A real screen-reader pass.** 0 axe violations is not a WCAG conformance statement; no NVDA/JAWS/VoiceOver run was performed.

## Portfolio note

- **Repository:** https://github.com/AbdulrahmanShaaban/wp-automations (public, `main` @ b11505f).
- **Reproduce in ~4 commands:** `npm install` → `npm start` → `bash scripts/seed.sh` → `bash scripts/verify.sh` (**50/50**), then `node scripts/booking-e2e.js`.
- **Evidence index**
  - Gate + audits: `docs/AUDIT/GATE-2026-10-08.md` · baseline `docs/AUDIT/{security,a11y-arabic,perf-seo}.md` (archive, untouched)
  - Post-fix evidence: `docs/AUDIT/evidence/remediation/` — `probe.txt` · `login-throttle.txt` · `booking-throttle.txt` · `axe-summary.json` + `axe-*.json` · `probe-*.json` · `debug-skiplink.json` · `lighthouse-summary.json` + `lighthouse-{home,book}.json` · `booking-e2e.json` · `verify-run.txt` · `run-audit-console.txt`
  - Build/automation evidence: `docs/evidence/*.json|txt` — `content3-report.json` · `motion-report.json` · `booking-e2e.json` · `n8n-sink-test.txt` · `n8n-sink-e2e.txt` · `final-report.json`
  - Flow + runbook: `n8n/workflows/{booking-confirmation,error-alert}.json` · `n8n/README.md`
  - Diagrams: `docs/portfolio-assets/{architecture,automation}.svg`
  - Screenshots: portfolio shots regenerated 2026-10-09 as **`docs/portfolio-assets/{cover,desktop,mobile}.webp`** (headless Chrome from the running demo). The per-phase `.png` evidence referenced by `GATE-2026-10-08.md` / `PLAN.md` was removed in the 2026-10-08 repo cleanup (236 screenshots + 16 logs, 44MB — `docs/PLAN.md`); the JSON/TXT evidence above is what remains and what re-runs.
