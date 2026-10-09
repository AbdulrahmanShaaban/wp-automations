# P3 — Siraj Dental Clinic (Demo): FINAL REPORT

**Dates:** 2026-10-06 → 2026-10-08 · **Type:** Arabic RTL lead-gen + booking demo (no WooCommerce, no payments) · **Stack:** WordPress 7.1.3 block theme `siraj-theme` + `siraj-core` plugin, PHP 8.3, `@wordpress/env` on port 8889, n8n workflow (signed HMAC webhook) · **Gate verdict: GO** — `docs/AUDIT/GATE-2026-10-08.md`

Everything below is separated deliberately: what was **changed**, what was **verified** (and where the evidence lives), what was **reviewed**, what was **measured**, what is still **remaining**, and what a portfolio reader can check in ten minutes. No number appears here that is not traceable to a file in this repo.

---

## CHANGED

### Site (2026-10-06 → 2026-10-07)
- **Design gate:** direction **A «الروشتة»** approved in `design/APPROVED.md` on **2026-10-06**; preview `preview-a.html` verified in the browser. B/C kept as previews, never built.
- **Block theme `siraj-theme`** from `design/tokens.css`: palette A, Alexandria only (self-hosted, two woff2 ≈61KB / 10 faces), theme.json v3, templates `front-page/index/page/single/404`, `parts/header.html` (mobile overlay menu) + `parts/footer.html`.
- **Homepage sections:** services 01–06 with prices · gallery (3 approved equipment/implant images) · team as monogram cards (**no people photos**) · 4-step work path · FAQ (5 `details/summary`) · contact strip · booking CTA → `/book/`. Seeded pages: home/services/team/contact/book (the theme also ships a 404 template).
- **Plugin `siraj-core`:** `[siraj_booking]` shortcode + private CPT `siraj_booking` (nonce, honeypot, full validation, `siraj_ip_hash`, `public => false`) · `hardening.php` · `seo.php` · `notifier.php` · idempotent single-boot `seed-wp.php`.
- **Motion:** JS-only reveal-on-scroll on 24 elements, `.reveal` visible by default, hidden state bound to the script-added `js-motion` class, `prefers-reduced-motion` honoured, no GSAP/CDN script.
- **Imagery:** 8 Unsplash frames kept local (`design/img/photos/`), original logo (`design/logo.mjs`); site images converted `.jpg → .webp` (**−81%**), probe jpg references = 0. Two photos containing people rejected by the `no-people-photos-in-demo` rule.

### Automation — n8n booking confirmation (2026-10-08)
- Domain event **`siraj_booking_created`** fired by `booking.php` **after** the meta write (not `save_post`, which fires inside `wp_insert_post` before meta exists — found by testing).
- **`siraj-core/notifier.php`:** payload `booking.created` (name / `+20…` phone / service + Arabic label / date / notes), `X-Siraj-Signature: v1=hex(HMAC-SHA256("<ts>.<rawBody>"))`, `X-Siraj-Timestamp` skew ≤300s, 3s timeout, failure = `error_log` line only.
- **`n8n/workflows/booking-confirmation.json`** (rawBody webhook → Code verify/normalize → IF → Respond 200/401 → Telegram) + **`error-alert.json`** (Error Workflow) + **`n8n/README.md`** runbook incl. the licence rule (live n8n runs on the owner's server).

### QA + remediation (2026-10-08)
- Three baseline audits written read-only: `docs/AUDIT/security.md` (**28 findings**), `docs/AUDIT/a11y-arabic.md` (**8**), `docs/AUDIT/perf-seo.md` (**15**). Original evidence in `docs/AUDIT/evidence/{security,a11y,perf}` left untouched; every re-measurement went to `docs/AUDIT/evidence/remediation/` (`audit-evidence-remediation-split`).
- Fixes landed across `style.css`, header/footer, `front-page.html` (webp, width/height, FAQPage JSON-LD), `seed-wp.php`, `.wp-env.json` (WDD off, file mods forbidden, `afterStart → php-tune`), `hardening.php`, `seo.php`, booking throttle/focus — and `verify.sh` grew to its final **50 checks**, including the standing regression gates (encoding, no-people, php-tune).

### Docs
`docs/PLAN.md` · `docs/ARCHITECTURE.md` · `docs/DECISIONS.md` (append-only, 16 entries as of this writing) · `docs/CONVENTIONS.md` · `docs/CASE-STUDY.md` · `docs/portfolio-assets/{architecture,automation}.svg` · this report. **`docs/PROBLEMS.md` and `docs/ASSETS_TODO.md` are owned by parallel writers — see below, not created here.**

---

## VERIFIED

Each claim → method → evidence path. All from the 2026-10-08 post-remediation pass unless stated.

| Claim | Evidence |
|---|---|
| Security probe across 6 pages + REST/CORS/enumeration/lang checks: **PASS=68 FAIL=0** | `docs/AUDIT/evidence/remediation/probe.txt` |
| Login throttle: 5×200 → **429 + `Retry-After: 900`** + Arabic message, counter=5, **PASS=9 FAIL=0** | `.../remediation/login-throttle.txt` |
| Booking throttle: nonce + 6 failed validations → generic reject, counter=6, bookings unchanged, **PASS=11 FAIL=0** | `.../remediation/booking-throttle.txt` |
| axe-core 4.13, 5 pages × 1440/390: **0 violations × 10 runs** | `.../remediation/axe-summary.json` + `axe-*.json` |
| Skip link draws at focus (184×48, hit-testable, z=100000) | `.../remediation/debug-skiplink.json` |
| `headingSkips=[]`, `h1=1`, `unlabelled=0`, `lang=ar` on every page | `.../remediation/probe-*.json` |
| Booking success state focuses: `role=status` + `successFocused=true` | `.../remediation/booking-e2e.json` |
| Lighthouse home **76 / 100 / 100 / 100**, CLS **0.033**; `/book/` **92 / 100 / 100 / 92**, CLS **0.002** | `.../remediation/lighthouse-summary.json`, `lighthouse-{home,book}.json` |
| `scripts/verify.sh` → **PASS=50 FAIL=0 — ALL PASS (exit=0)** incl. `php -l` ×7, encoding gate, no-people gate, php-tune gate 4b | `.../remediation/verify-run.txt` |
| `scripts/booking-e2e.js` green: invalid → in-field Arabic error + `aria-invalid` + values retained · valid → success block · honeypot → rejected · stored rows unchanged | `.../remediation/booking-e2e.json` |
| n8n sink: full **VALID** payload (id=32) · tampered signature → **401** · expired timestamp → **401** | `docs/evidence/n8n-sink-test.txt` |
| Restart resilience: full `wp-env start` → php-tune rewritten on **wordpress + cli**, permalinks restored by `seed.sh`, verify 50/50, booking chain → sink `VALID skew=0` (id=34) | `docs/evidence/n8n-sink-e2e.txt`, `.../remediation/verify-run.txt`, `docs/PLAN.md` 2026-10-08 |
| Content / booking / motion build reports (sections, images 200, reveal 24/24 visible-without-JS, reduced-motion) | `docs/evidence/{content3,motion,booking-e2e,final}-report.json` |

**NOT verified (explicit — do not tick):** live n8n on a real server (local sink only, licence rule = owner's machine) · production/Core-Web-Vitals performance (lab data on a Windows bind mount) · SMTP/email delivery (no account; **Telegram only**) · payments (none exist by scope) · a real screen-reader pass (0 axe violations ≠ WCAG conformance).

---

## REVIEWED

Three read-only audits, remediated, then re-measured:

| Audit | Findings | Status |
|---|---|---|
| `docs/AUDIT/security.md` | **28** (High 1 · Medium 6 · Low 8 · Info 13) | remediated → re-measured **68/0 + 9/0 + 11/0** |
| `docs/AUDIT/a11y-arabic.md` | **8** (F1–F6, F8; High 1 · Medium 3 · Low 4) | remediated → re-measured **0 violations × 10** |
| `docs/AUDIT/perf-seo.md` | **15** (Critical 1 · High 4 · Medium 6 · Low 4; env 2 · code 9 · config 4) | remediated; the rest documented as publish gates |

**Verdict: GO** — `docs/AUDIT/GATE-2026-10-08.md` (2026-10-08). What that GO means: the source tree can be handed over as-is with the three gates green. It is **not** a "secure / WCAG compliant / production ready" claim and does not authorise a public launch — the publish gates in that file (salts, cache headers, production measurement, live n8n) are owner obligations.

**Decisions defended in review:** JS-only reveals after scroll-driven CSS measured failure (24/24 hidden) · HMAC webhook with fail-open booking policy · `php-tune` + `validate_timestamps=0` wired to `afterStart` (trade-off: rerun after any PHP edit) · seed as single idempotent boot · self-hosted fonts · gate-per-regression (`encoding`, `no-people`, `php-tune`) · baseline audit evidence archived, remediation evidence separate · CORS pinned to `home_url()/site_url()` instead of WordPress' default origin comparison.

---

## PERFORMANCE

| Page | Perf | A11y | Best Practices | SEO | CLS |
|---|---|---|---|---|---|
| home | 76 | 100 | 100 | 100 | 0.033 |
| `/book/` | 92 | 100 | 100 | 92 | 0.002 |

- **Warm TTFB ≈ 0.4–0.7s** after `php-tune` (first requests are warm-up).
- Root cause of the slow dev numbers: **bind-mount file stats** (2–64ms × ~490 files/request) — mitigated with `scripts/php-tune.js` (`realpath` cache + opcache 192MB/20000 files + `validate_timestamps=0`) on both containers via `lifecycleScripts.afterStart`.
- Images `.jpg → .webp` (**−81%**), page references converted (probe jpg refs = 0).
- Lighthouse `cache-insight` + `robots-txt` failures are **environmental**: no cache headers in wp-env, sitemap URL is `http://localhost:8889`.
- **Environment limit:** all of the above is lab data on this machine. Production numbers require a deployment → publish gate (`GATE-2026-10-08.md` §4).

---

## SECURITY

- **Headers** on `send_headers` + `login_init` + **`init@0`** (REST exits during `parse_request`, before `send_headers`) — probe: headers present on **6 pages**, no `X-Powered-By` on REST.
- **CORS pin:** `rest_send_cors_headers` removed inside **`rest_api_init@99`** (core registers it at `rest_api_init@10`, so earlier removal is a no-op) and replaced with an emitter comparing `home_url()/site_url()` (core's `get_allowed_http_origins()` strips the `:8889` port). Probe: **evil origin 0 · own origin 1**.
- **Throttles** in `siraj-core/hardening.php`: login **5 → 429 + `Retry-After: 900`** with an Arabic message; booking form **6 failed validations → generic reject**, bookings unchanged. Both green post-remediation (**9/0**, **11/0**).
- **Hardening highlights:** author/enumeration and XML-RPC retirement, 404/301 handling, WDD checks, uploads inspection, private CPT (`public => false` → not in REST/archives/search), hashed client IP in meta, nonce + honeypot on the booking form.
- **Secrets:** `SIRAJ_N8N_SECRET` is locally generated (64 hex) and referenced by option name only; the security audit's secret scan reported **0 pattern hits**, and report evidence is redacted (`docs/AUDIT/security.md` checks 2 and the `redact-evidence.js` tool).
- **Publish gates still open (owner):** `wp config shuffle-salts` + rename `admin` + strong password · static-asset `Cache-Control` on the real host · live n8n · production measurement · after any PHP edit: `node scripts/php-tune.js`.

---

## PORTFOLIO

1. **Case study:** `docs/CASE-STUDY.md` (narrative, verified-vs-not split).
2. **Diagrams:** `docs/portfolio-assets/architecture.svg` · `docs/portfolio-assets/automation.svg` (cover/desktop/mobile screenshots added separately by the lead).
3. **Repo:** https://github.com/AbdulrahmanShaaban/wp-automations (public, `main` @ b11505f).
4. **Ten-minute check:** `npm install` → `npm start` → `bash scripts/seed.sh` → `bash scripts/verify.sh` (**50/50**) → `node scripts/booking-e2e.js` → `SIRAJ_N8N_SECRET=<hex> node scripts/n8n-sink.js` + a test booking → VALID in the sink log.
5. **Evidence:** `docs/AUDIT/GATE-2026-10-08.md` + `docs/AUDIT/evidence/remediation/` + `docs/evidence/*.json|txt`.

---

## REMAINING

Owner-blocked (each has a runbook; none is a code defect):

1. **Deploy** to real hosting (wp-env demo is not a launch).
2. **Live n8n** — import `n8n/workflows/*.json`, set `SIRAJ_N8N_SECRET`, set production webhook URL (`n8n/README.md`, install steps). Licence rule: it runs on the owner's server.
3. **`wp config shuffle-salts` + rename the `admin` user + strong password** (GATE publish gate 1 — not needed inside wp-env).
4. **Static-asset cache headers** on the publish host (GATE publish gate 2).
5. **Production performance measurement** after publish (GATE publish gate 3) — today's scores are lab data.
6. **Optional SMTP** — only if email replies are wanted; the shipped path is Telegram (`docs/ASSETS_TODO.md` §6).
7. **Upstream / none:** no open upstream defect is claimed; the remaining Lighthouse misses are documented as environmental in the GATE.

---

## PROBLEMS

Index: **20 entries as of this writing** (19 resolved, 1 open/owner-blocked) in **`docs/PROBLEMS.md`** — that file is being written concurrently by another writer and is the authority for this index; it is referenced here, not duplicated or created.

---

## OWNER TODO

The owner's checklist lives in **`docs/ASSETS_TODO.md`** (9 sections: environment, pre-launch security, cache headers, production measurement, live n8n, optional SMTP, demo-content replacement, admin access, secrets). It is being written concurrently — reference it, do not treat this report as its contents.

---

**Nothing in this report claims a test that was not run.** Gate of record: `docs/AUDIT/GATE-2026-10-08.md` → **GO**, 2026-10-08.
