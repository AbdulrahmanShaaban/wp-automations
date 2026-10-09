# P1 — نيلاد / Nilad: FINAL REPORT

**Date:** 2026-10-04 · **Type:** e-commerce + automation demo · **Market:** Egypt · **Phases 0–8 complete**

Everything below is separated into four things, deliberately: what was **changed**, what was **verified** (and how), what was **reviewed** (and what remains open), and what a **portfolio** buyer should be able to verify in 10 minutes.

---

## 1. CHANGED — what exists now

### Store (Phases 0–4)
- **Block theme `nilad-theme`** on an owner-approved design: RTL Arabic, approved palette, one primary CTA, pill buttons, `prefers-reduced-motion`, mobile bottom action dock. 8 content pages + shop/catalog/cart/checkout/404/account.
- **Plugin `nilad-core`** (all business logic, zero WooCommerce core edits): on-demand WooCommerce block registration (saves 3.5–5s/request), `Category:` label localization, Egyptian phone normalization + validation at the **Store API** with an Arabic 400, free-shipping notice from `totals.total_items`, branded Arabic mail + local capture, and the Phase 6 hardening module.
- **Egyptian commerce:** 2 shipping zones (Cairo/Giza 60 EGP, rest of Egypt 90 EGP, free ≥ 1,500), COD + BACS, EGP/zero-decimals, official **Paymob** plugin installed (live keys owner-supplied).
- **Catalog:** 8 categories, 8 products with generated imagery, 1200×630 OG image, site icon.

### Automation — n8n "Order Ops Suite" (Phase 5)
7 flows + 1 shared Error Workflow, each with a pinned idempotency key, HMAC verification on both webhooks, PII discipline, and Arabic messages. See `n8n/README.md` (flows table) and `n8n/runbooks.md` (per-flow runbook). A live n8n instance holds all 8 imported, published, active, with the Error Workflow attached to each.

### QA harness + fixes (Phase 6)
`scripts/qa-audit.js` (`npm run qa`) → `docs/QA-REPORT.md` + 12 Lighthouse JSONs. Fixes landed this phase: 4 security headers, meta description + OG + JSON-LD + canonical, single `h1` (site title demoted to `<p>`), content inside landmarks, WCAG 2.2 target sizes, `.screen-reader-text`, a new `page-cart.html` override, cart-seeded QA so checkout is measured for real.

### Docs (the part clients never see but always value)
`docs/PLAN.md` · `docs/DECISIONS.md` (37 entries) · `docs/PROBLEMS.md` (29 entries, real problem log) · `docs/QA-REPORT.md` · `docs/CASE-STUDY.md` · `docs/CLIENT-QA.md` (19 client answers) · `docs/GLOSSARY.md` · `docs/OWNER-BRIEF/01…06` (Arabic per-phase handoffs) · `n8n/CONVENTIONS.md`.

---

## 2. VERIFIED — with the method, not adjectives

| What | How | Result |
|---|---|---|
| Store renders + config | `scripts/verify.sh` (26 checks) | **ALL PASS** |
| Commerce behaves | Puppeteer e2e, real browser checkout | **9/9** — free-shipping notice both sides, 60/90/free rates, invalid-phone Arabic banner, COD order received |
| Order data is correct | CLI assertions on real order #50 | canonical phone `01012345678`, EGC/القاهرة/11511, 1,310 EGP, Arabic mail log, branded From |
| Automation logic | 87 assertions running the **actual `jsCode` in the shipped JSONs** | **87/87** |
| Workflows are valid | real n8n 2.41.6 import (one-shot container) | **8/8 imported** |
| **Automation works live** | real n8n + real Telegram bot | signed webhook → F1 **success** + Arabic alert delivered; tampered signature → F1 **error** → Error Workflow **success** → alert delivered (`n8n/tests/live-e2e-evidence.txt`) |
| Accessibility | axe-core WCAG 2.1 A/AA + best-practice, 390px, 6 pages | **0 violations** on home/shop/product/contact; **0** sub-24px targets anywhere |
| SEO | 15 checks × 6 pages | **15/15 every page** |
| Security headers + hygiene | 9 checks × 6 pages | **9/9 every page** |
| Visual integrity | screenshots at 1440 and 390 after the semantic changes | home + real checkout reviewed, **no regression** (`design/shots/qa6-*`) |

**Verified live (owner-provided credentials):** Telegram bot token + chat + a delivered message (`message_id=2`) and the F1/Error-Workflow end-to-end.

**NOT verified (and labelled as such everywhere):** Paymob live success/failure/refund (owner keys), Google Sheet row write (owner OAuth login), SMTP email delivery (no account), schedule firing observed on a timer, and the store→webhook hop over a public URL. `docs/QA-REPORT.md` §5 explains why performance numbers are environment-bound here, with the production expectation marked [UNVERIFIED].

---

## 3. REVIEWED — judgement calls and what remains

### Decisions I'd defend in a review
- **Seed as code, not a dump** — the whole store rebuilds from zero in ~15 min; no `.sql` to drift, no customer data at rest.
- **Presentation in templates, logic in a plugin** — WooCommerce updates can't wipe the work.
- **At-most-once messaging** (mark-before-send) with the trade-off documented in the runbook, not hidden.
- **Secrets only via `$env`**; the Telegram token is resolved inside a Code node and passed to the HTTP node through the item, so no secret appears in a node parameter, an export, or a screenshot.
- **Google Sheets node behind `SHEETS_ENABLED`** so a missing credential can never mark a good order alert as a failed run.
- **Upstream a11y defects documented, not hacked** — two serious axe findings are client-rendered by WooCommerce's React; a DOM patch would fight its re-renders. Recorded with reasoning instead of shipping a fragile workaround.

### Open (owner-action)
1. Paymob live keys → live success/failure/refund runs (`ASSETS_TODO #3`).
2. Google Sheets OAuth credential in the n8n UI → set `SHEETS_ENABLED=true` (`#5`).
3. SMTP account → real email delivery (F2/F3/F6).
4. Woo REST keys → F3/F4/F5/F6 (optional; F1/F2 don't need them).
5. **Rotate the Telegram token** — it was pasted in chat once (ASSETS_TODO #4).

### Deployment items (from QA §6, for the real host)
- Re-run `npm run qa` on the host (performance becomes meaningful there; a11y/SEO/security must hold).
- Apache `ServerTokens Prod` + `ServerSignature Off` (the local image leaks the version; PHP can't remove that header).
- HSTS + CSP only once served over HTTPS.

### Known upstream issues left as-is
- **3 axe findings in WooCommerce's client-rendered cart/checkout**: `aria-prohibited-attr` (cart + checkout) and `autocomplete-valid` (checkout) — React-generated markup, documented in `docs/PROBLEMS.md` 2026-10-04.
- `image-redundant-alt` on cart/checkout (product name is both alt text and adjacent label) — minor.

---

## 4. PERFORMANCE — measured, decomposed

| Page | Lighthouse perf (throttled) | perf (unthrottled) | a11y | best-practices | SEO | TTFB |
|---|---|---|---|---|---|---|
| home | 87 | 89 | 100 | 100 | 92 | 1.7s |
| shop | 67 | 57 | 100 | 100 | 92 | 10.6s |
| product | 71 | 63 | 100 | 100 | 100 | 7.0s |
| cart | 9 | 40 | 100 | 96 | 69 | 5.1s |
| checkout | 6 | 24 | 100 | 96 | 69 | 5.6s |
| contact | 84 | 92 | 100 | 100 | 100 | 2.9s |

The performance column **measures this machine, not the storefront**, and the report proves it three ways: the DB answers a full product query in **0.075s**; the homepage is **17KB** compressed (cart 70KB, of which ~240KB uncompressed is WooCommerce's inlined `countryData`); and the bottleneck is PHP file I/O over a Windows bind mount inside Docker (~8–10ms per stat, measured in Phase 2). Already mitigated as far as a demo can: `opcache.validate_timestamps=0` + realpath cache, deferred block registration. **Expectation on normal hosting: TTFB 200–400ms → 90–100. Marked [UNVERIFIED] until measured.**

---

## 5. SECURITY — posture and boundaries

- **Transport/headers:** nosniff, SAMEORIGIN frame options, strict-origin-when-cross-origin referrer, permissions policy, no `X-Powered-By`. HSTS/CSP intentionally deferred to HTTPS deployment.
- **Input validation:** phone normalized + validated server-side at the Store API (one chokepoint all clients pass); HMAC-verified webhooks (fail-closed); no user text reaches Telegram without HTML escaping.
- **Secrets:** `$env` only, gitignored local files, rotate-after-chat policy recorded.
- **PII:** confined to the owner's private chat, the Sheet, and the customer's own email; error alerts carry order id only, scrubbed.
- **Supply chain / updates:** no core or WooCommerce edits; the plugin is the single extension point.
- **Known boundary:** the Apache `Server` banner is host configuration, documented as a deployment item rather than papered over.

---

## 6. PORTFOLIO — what a buyer can check in 10 minutes

1. `bash scripts/reset.sh` → full store from zero, then `scripts/verify.sh` ALL PASS.
2. `npm run qa` → regenerate `docs/QA-REPORT.md` and 12 Lighthouse JSONs.
3. `node n8n/tests/run-tests.js` → 87 assertions against the shipped workflows.
4. `n8n/tests/live-e2e-evidence.txt` → the live Telegram proof.
5. `design/shots/` → the design trail from Phase 1 to the QA pass.
6. `docs/CASE-STUDY.md` → the narrative; `docs/PROBLEMS.md` → the honesty.

---

## 7. REMAINING — the honest list

- **Owner credentials** (items 1–5 above) turn three "NOT VERIFIED" lines into verified runs.
- **Deployment** on real hosting is where the performance claim gets measured.
- **Upstream a11y** in WooCommerce's checkout will be re-checked when Woo ships a fix (`npm run qa` is the test).
- **P3** (the clinic-site demo) is the next portfolio piece and starts at its design-approval gate.

**Nothing in this report claims a test that was not run.**

---

## 8. CLOSING — launch gate + remediation (2026-10-07)

*Appended, chronological. Sections 1–7 above are the report as written on 2026-10-04 (header date included) and are left exactly as they were. Two lines in them are superseded by what follows: §3's "Known upstream issues left as-is" — the checkout `autocomplete-valid` finding was fixed on 2026-10-07, and the other items on that list were **not** re-verified in the remediation wave, which re-ran axe only on home and checkout at 390 px — and §1's docs inventory, since `docs/CLIENT-QA.md` grew from 19 to 23 client answers on 2026-10-07.*

### Gate outcome

Three read-only audits ran on **2026-10-06** against the local site (`http://localhost:8888`, WP 7.1.2 + WooCommerce 11.1.2): `security.md` (18 findings — High 2 · Med 3 · Low 5 · Info 8), `a11y-arabic.md` (12 — High 3 · Serious 1 · Med 3 · Low 5), `perf-seo.md` (15 — env-bound 3, code 11). `docs/AUDIT/GATE-2026-10-06.md` issued **NO-GO** with **7 blockers**. All seven were fixed and re-verified on **2026-10-07**, and the gate was re-issued **GO (conditional)**.

What that GO covers, stated plainly: **the source tree can be handed over as-is.** It is not a "secure", "WCAG compliant" or "production ready" claim, and it does not authorise a public launch — the accepted risks in the gate table (hosting, Paymob keys, upstream cart/checkout rendering) are owner/deploy obligations, listed there and repeated at the end of this section.

**The three audit reports describe the PRE-fix state.** They were written under a read-only mandate (no code/theme/plugin/doc change outside `docs/AUDIT/`) and were deliberately left untouched as the record of what was wrong. The post-fix record is `docs/AUDIT/evidence/remediation/`: `verify-fixes.txt` / `verify-fixes.json` (fresh run `2026-10-07T10:58:33Z`), 5 screenshots, re-runnable with `node docs/AUDIT/evidence/remediation/tools/verify-fixes.js`.

### The seven fixes — one line of evidence each

| # | blocker | fix | evidence (2026-10-07) |
|---|---|---|---|
| B1 | live webhook HMAC secret hardcoded in a shipped plugin file — anyone with the source could mint a valid `X-WC-Webhook-Signature` | `register-n8n-webhooks.php` resolves it at runtime (env → wp option `nilad_n8n_webhook_secret` → generate + store via `bin2hex(random_bytes(24))`); literal deleted, existing webhook rows re-signed | first run generated a fresh 48-hex value (`source=generated length=48`) and the old literal is dead; `sync-webhook-secret` reports `matches-wp-option=true` **with the value never printed** |
| B2 | a plain zip of the folder shipped `n8n/.env`, two `.local.txt` files and 5 root `*.log` (`.gitignore` protects git only, and the repo has zero commits) | `scripts/package.ps1` + `npm run dist`, then re-open the archive and fail if a forbidden entry is present | `files=385 entries=385` · `package-secrets: PASS`; independent re-read: **0** × `.env` / `*.local.txt` / `*.log` / `.git` / `node_modules` / `*.sql`, 0 backslash entry names |
| B3 | header nav `display:none` ≤899px with `overlayMenu:"never"` → 4 links unreachable on phones, no hamburger | `overlayMenu:"mobile"`; hide only the inline list, force the 44×44 open button, drop the header shop CTA (it wrapped the header into 3 rows at 390 and is duplicated by the dock + hero), and release the header `backdrop-filter` on `html.has-modal-open` — it was clamping the `position:fixed` overlay into a strip | @390 hamburger visible **44×44**, overlay open with **4/4 links visible**; @1440 hamburger `display:none` + 4 inline links |
| B4 | `/#cats`, `/#best`, `/#about` (and the hero CTA `#cats`) pointed at ids that did not exist — the links did nothing | matching `id=` + `anchor` block attributes on the three homepage sections | every hash href resolves: `#wp--skip-link--target /#new /#cats /#best /#about #cats` → all `true` |
| B5 | without JS, **13/13** `.reveal` elements stayed `opacity:0` — whole homepage sections invisible, while a code comment claimed otherwise | `@media (scripting:none){.reveal{opacity:1;transform:none;transition:none}}` | scripting disabled: `reveal total=13 hidden=0`, hero visible (`home-390-no-js.png`) |
| B6 | checkout `autocomplete="section-contact contact email"` — invalid WHATWG token, axe **serious** (WCAG 1.3.5) | post-render fix in `qa-hardening.php` → `autocomplete="email"`, plus `inputmode=tel` + `dir=ltr` on the phone field and `dir=ltr` on email/postcode | `#email autocomplete=email`, `inputmode(phone)=tel`, `dir(phone)=ltr`; **axe @390 checkout = 0 violations** (was 1 serious) |
| B7 | unauth user enumeration (`/wp-json/wp/v2/users` → 200 with slug + Gravatar, `/?author=1` → `/author/admin/`), no login throttle, live `xmlrpc.php`, script execution possible in `uploads/` | `nilad-core/exposure-hardening.php` (endpoint filter, author redirect, `xmlrpc_enabled=false` + hard 403, per-IP throttle 5/15 min) and `harden-uploads.php` + a `seed.sh` step | `/wp-json/wp/v2/users` → **404** · `/?author=1` → 301 → home · `POST xmlrpc.php` (`system.listMethods`) → **403** · login attempt 6 returns "محاولات دخول كثيرة. انتظر 15 دقيقة…" · `uploads/.htaccess` denies `.php/.phtml/.phar/…` |

Closed in the same wave as accepted risks (not blockers): **one canonical tag per page** on `/`, `/shop/`, `/product/…`, `/cart/`, `/contact/` (was ×2); one Woo `Product` JSON-LD on the product page (two nodes shared an `@id`); sitemap reduced to 3 child sitemaps with **0** cart/checkout/my-account/author/sample URLs (was 28); `hello-world` deleted and `default_comment_status=closed`; truthful "اتفرج على المتجر" labels (8×, no "أضف للسلة" label on a link that only navigates); `lang="en"` on 8 `Demo` badges; **no** sub-24px control at 390 px; `letter-spacing: 0` on the Arabic title. **axe-core 4.13.0 @390 px: 0 violations on home, 0 on checkout** (45 and 47 rules passed).

### Rotation + packaging rules — standing, not one-off

- **No secret literal in shipped code.** The webhook signing key is resolved at runtime and the canonical copy is the wp option `nilad_n8n_webhook_secret`; `scripts/sync-webhook-secret.js` propagates it into `n8n/.env` so the n8n side verifies against the same value. The literal was deleted and **rotated on 2026-10-07** — the previous value no longer works, so an older copy of the source cannot forge a valid signature.
- **No secret value is ever printed.** Verification records length, source and `matches-wp-option=true`; the value appears in no log, screenshot or document. Secrets are referenced by **key name only** everywhere in this project.
- **The handoff archive is safe by construction, not by promise.** `npm run dist` mirrors the `.gitignore` exclusion list, stages, writes the zip with **forward-slash entry names** (Windows built-ins write `\`, which extracts wrong on Linux/macOS), then re-opens the archive and fails on `.env` / `*.local.txt` / `*.log` / `.git` / `node_modules` / `*.sql`. Last run: **385 files / 385 entries**, `package-secrets: PASS`.
- **Packaging is not rotation.** Anything ever written into shared material must be rotated at the source. Still owner actions: **Telegram bot token** (`@BotFather /revoke`) and **Google OAuth client secret** (Google Cloud Console) — `docs/ASSETS_TODO.md` #9. The webhook secret rotation is done.
- **Re-verify on change.** Re-run the remediation verifier after any touch to the header, theme CSS, `qa-hardening.php` or `exposure-hardening.php`, and re-issue the gate if a blocker returns.

### NOT verified (explicit — do not tick)

1. **Production performance / Core Web Vitals field data.** Every performance number in §4 and in the 2026-10-06 perf audit is **lab data — one machine, single throttled runs** against wp-env on a Windows bind mount (TTFB 1.4–10.6 s). There is no field/CrUX data. The "90–100 on normal hosting" expectation is **unmeasured** and stays a deployment item.
2. **Paymob live payment path.** `PAYMOB_*` keys are absent; the iframe/redirect/callback HMAC behaviour of `paymob-for-woocommerce` 4.1.14 was never exercised. No live success, failure or refund run exists.
3. **TLS / HSTS.** The site was only ever served over plain HTTP on localhost. HSTS can only be validated behind a real TLS terminator; CSP, `Cache-Control` and `ServerTokens` are host/deploy configuration, not repo changes.
4. **Real screen-reader pass.** No NVDA / JAWS / VoiceOver, no voice control, no scripted keyboard pass at 390 px. The axe runs also returned `incomplete` items needing human review (`color-contrast` on home and checkout, one `aria-valid-attr-value` on checkout). **0 axe violations is not a WCAG conformance statement.**
5. **Brute force at volume.** The login throttle was exercised for 6 sequential attempts; before remediation exactly one failed-login probe was made. No distributed or sustained testing, no WAF/DoS limits measured, and `wp-login.php` still reveals whether a username exists in its error text (WordPress core behaviour — the throttle is the mitigation, not a fix).
6. **CVE-by-CVE review.** Versions were inventoried (WP 7.1.2, WooCommerce 11.1.2, `paymob-for-woocommerce` 4.1.14 with 4.1.15 available); individual advisories were not matched against a vulnerability database. `npm audit` covers the Node tree only — 3 critical / 1 high, all dev-only through `@wordpress/env`, `--omit=dev` = 0.

Carried unchanged by this wave: PHP execution of a *newly uploaded* file in `uploads/` was **inferred** from the Apache config plus the seeded `.htaccess` — no test file was ever uploaded (read-only mandate); `/.git/*` webroot exposure, `WP_DEBUG=true` outside local, the 16 inactive default themes and the pending Paymob plugin update are host/deploy items; the n8n runtime HMAC was verified statically and against the pre-existing live evidence, **not re-run on 2026-10-07** — the 87/87 assertion suite and the delivered Telegram proof in §2 remain the record from the earlier phase.

**Nothing in this section claims a test that was not run on 2026-10-07, and nothing here upgrades the project to "secure", "WCAG compliant" or "production ready".**
