# Decisions (append-only; never rewrite old entries)

## block-theme-over-elementor — 2026-10-01
Chose a **block theme (`theme.json` + templates + patterns) + custom plugin** over Elementor.
Why: layouts stay plain reviewable files in git, faster pages, smaller attack surface, and an AI can generate/maintain them reliably. Business logic must never live in the theme (OPENCODE_MASTER_BRIEF Part 2.3).
Alternative considered: Elementor + Astra (what many local freelancers use) — kept as a **fallback if a client demands Elementor editing**; then apply the Design Laws manually.

## everything-as-code — 2026-10-01
Site content and config are created only by idempotent `scripts/seed.sh` (WP-CLI/PHP), rebuildable with `scripts/reset.sh`.
Why: a click-assembled admin state can't be reviewed, rebuilt or handed off; this is the whole point of Part 2.
Alternative considered: manual admin setup — rejected (unreproducible, unreviewable).

## slug-provisional — 2026-10-01
Theme slug `demo-store-theme`, plugin slug `demo-store-core`, repo folder `p1-fashion-store` are **provisional** until the owner approves a brand name.
Why: renaming after Phase 2 gets expensive (paths, text domain, patterns). Brand name is an owner decision (ASSETS_TODO #2).
→ **Superseded by `brand-name` (2026-10-01).**
Alternative: invent a brand now — rejected (Brief Part 0.4: never invent client-facing assets).

## n8n-hosting-rule — 2026-10-01
Demos run on the owner's own n8n instance; any client production n8n runs on the **client's** server or their n8n Cloud. Never host client n8n on our server under the free license.
Why: n8n Community license FAQ — hosting for others competes with n8n Cloud (Brief Part 0.4). Re-check: docs.n8n.io → Community license **[VERIFY at Phase 5]**.

## demo-labeling — 2026-10-01
Brand, products, testimonials are fictional and the site is labelled **Demo**. No invented metrics, clients or prices anywhere (portfolio, case study, chat).
Why: Brief Part 0.4 + Part 9 — trust and honesty are the product.

## brand-name — 2026-10-01
Brand: **نيلاد / Nilad** (owner-approved 2026-10-01; Egyptian Arabic, rooted in النيل; vocalization: **نِيلَاد**, latin `nilad`).
Technical names: theme `nilad-theme`, plugin `nilad-core`, text domain `nilad`, PHP function prefix `nilad_`, repo folder unchanged (`p1-fashion-store`, internal only).
Why: decided before Phase 2, so the rename cost is zero. Supersedes `slug-provisional`.
Note: domain availability (`nilad.com` etc.) not verified — owner checks at purchase time (ASSETS_TODO #8).

## builder-sourced-images — 2026-10-01
All site images (product shots, hero, editorial) are **sourced by the builder**, not the owner (owner: "مش هضيفلك انا").
Sources: CC0/royalty-free libraries (Unsplash/Pexels/etc.) or generated placeholders; every file converted to WebP ≤ 200KB with its **license logged in `docs/ASSETS_TODO.md` #7**; replace anything without a clear license.
Why: owner explicitly opted out of providing assets; demo needs to look complete on its own.
Supersedes: the owner-sourced-images wording of ASSETS_TODO #7 (tasks #3–#6 there remain owner-only).

## design-a-merged-with-b — 2026-10-01
Owner picked **direction A** at the design gate, then asked to merge B/C elements into it. Applied to `design/preview-a.html`:
- B's colored word in H1 (`<em>`, primary green) + larger editorial H1 (max 60px = brief ceiling, was 56px).
- B's sticky section titles (`#cats`/`#best`, desktop, opaque bg) + reveal-on-scroll with stagger (IntersectionObserver, `prefers-reduced-motion` + `<noscript>` fallbacks).
- `scroll-margin-top:88px` on `section[id]` (anchor offset pattern from reference study).
- Hero secondary ghost CTA beside primary (one-primary-per-group rule kept).
Why: owner explicitly requested "ضيف عناصر التصميمات التانية في A وبالذات B". Direction A remains the base — structure/palette untouched.
Verification: 4 shots regenerated (`scripts/screenshot.js` now force-reveals `.reveal` for full-page capture); widths exact at 1440/390, green-word/button/news pixel probes pass, no blank bands beyond section padding.

## wp-env-stack — 2026-10-01
Verified foundation versions (recorded from the first fully green `reset.sh`): **WordPress 7.1.2, WooCommerce 11.1.2, PHP 8.3, @wordpress/env 11.16.0, Docker Desktop 29.7.2, Node 24.19.0.**
WooCommerce is pinned as `woocommerce.11.1.2.zip` (never `latest-stable`): wp-env derives the plugin slug from the zip filename and only strips numeric version suffixes — `woocommerce.latest-stable.zip` installs under the slug `woocommerce.latest-stable`, which breaks every slug-based check/seed (PROBLEMS.md 2026-10-01).
Why: a client handoff must rebuild identically; bump the pin deliberately (Phase 4/6), never silently.

## wp-env-workarounds — 2026-10-01
Two machine-specific workarounds, both scripted; evidence in PROBLEMS.md:
1. `scripts/patch-wp-env.js` (runs on `postinstall` and at the top of `reset.sh`) — fixes @wordpress/env's CLI image build failing on Windows usernames containing spaces ("Abdelrahman Shaaban"): creates the home dir + sets `ENV HOME` before the composer step. Marker-based, idempotent; re-check after any `npm install` that bumps @wordpress/env.
2. `scripts/verify.sh` exports `MSYS2_ARG_CONV_EXCL='*'` + `MSYS_NO_PATHCONV=1` — stops Git Bash rewriting `/var/www/...` arguments into Windows paths, which made `php -l` fail with "Could not open input file".
Why not fork wp-env: a pinned version + a 30-line patch is cheaper to maintain than a fork, and both are removable when upstream fixes land (github.com/WordPress/wp-env/issues).

## deferred-wc-block-registration — 2026-10-01
Plain frontend HTML views disable WooCommerce's eager block-type registration (`woocommerce_should_register_blocks → false` outside admin/REST/AJAX/cron); the full block set registers **on demand** when a `woocommerce/*` block actually renders (via `pre_render_block`, mirroring WC's own on-demand path for short descriptions). Admin, editor, REST and Store API keep WooCommerce's default behaviour.
Why: measured `BlockTypesController::register_blocks` at **3.5–5s per frontend request** on this machine (~100 block classes × per-block file ops at ~8–10ms/stat over the Docker bind mount) — the single largest cost in a page load. Verification: temp test page with `<!-- wp:woocommerce/product-categories /-->` logged `fired=... has_run=0`, registered, rendered with no `wp:missing`; page deleted after the test.
Alternative considered: keep eager registration with a reduced list via `woocommerce_get_block_types` — rejected (a curated list rots as Phase 3 adds blocks; on-demand costs nothing on pages without WooCommerce blocks and stays fully faithful when they appear).
Cost note: the first page that *does* render a WooCommerce block pays the one-time ~3.5–5s registration in that request.

## opcache-validate-timestamps-off — 2026-10-01
`scripts/php-tune.js` writes `/usr/local/etc/php/conf.d/zz-nilad-perf.ini` inside the wordpress container (`realpath_cache_size=4194304`, `realpath_cache_ttl=600`, `opcache.max_accelerated_files=20000`, `opcache.memory_consumption=192`, `opcache.interned_strings_buffer=32`, **`opcache.validate_timestamps=0`**) and reloads Apache. It runs automatically via `.wp-env.json` `lifecycleScripts.afterStart` (so it survives `reset.sh`/container recreate) and manually via `npm run tune`.
Why: every stat() over the Docker Desktop bind mount costs ~8–10ms here; default timestamp revalidation plus a too-small realpath cache made page loads 8–24s (PROBLEMS 2026-10-01 "8–24 seconds"). With `validate_timestamps=0` warm pages dropped to ~1.7–2.0s.
Dev workflow (documented in README): **after editing any PHP file run `bash scripts/opcache-reset.sh` (`npm run opcache:reset`)** — the first request after a reset recompiles everything (~15–19s, once); everything after is fast. HTML templates/patterns and theme.json are not PHP and are unaffected.
Alternative considered: `opcache.revalidate_freq=60..600` — rejected (edits stay invisible for up to the window — confusing — and idle gaps still trigger a multi-second re-stat storm).

## woocommerce-coming-soon-off — 2026-10-02
`scripts/seed.sh` sets `woocommerce_coming_soon = no` and `woocommerce_coming_soon_store_pages_only = no` right after the onboarding-profile options.
Why: WooCommerce 9+ silently enables "coming soon" mode during new-store onboarding, which serves an empty `<div class="wp-site-blocks"></div>` (plus a `woo-coming-soon-page` meta) for shop/cart/product to anonymous visitors — a scary, hard-to-diagnose state that appeared mid-session (PROBLEMS 2026-10-02). A demo store must show the real storefront to every visitor from the first request.
Alternative considered: leaving it on and logging in for every check — rejected (screenshots/clients/crawlers are anonymous; the failure mode hides itself).

## seed-content-via-eval-file — 2026-10-02
Page/catalog content larger than a couple of KB is never passed as a wp-env CLI argument. It lives as files inside the mounted plugin directory (`scripts/content/*.html`, `nilad-core/seed-catalog.php`) and is applied with `wp eval-file` or short `base64_decode` one-liners.
Why: the `npx @wordpress/env run` bridge truncates any argv containing newlines at the first line, and Windows rejects ~9KB argv with "The command line is too long." (PROBLEMS 2026-10-02). `wp eval-file` against the mounted path has neither limit and stays reviewable in git.
Alternative considered: `wp post update --post_content="$(cat file)"` — rejected (quoting/encoding does not survive the PowerShell → npx → docker exec chain).

## localized-static-block-content — 2026-10-02
Static block HTML stored in the database (Woo's install-generated cart page content, hardcoded block-template attributes like `post-terms` prefixes) is localized by explicit code, not gettext: `seed-catalog.php` swaps baked English strings idempotently, and `nilad-core.php` rewrites the `Category: ` prefix through `render_block_data` (reading the raw `attrs` key that `parse_blocks` produces).
Why: gettext only sees PHP strings at runtime; text frozen into `post_content` or into template attributes is invisible to it, so Arabic-locale sites still show English (PROBLEMS 2026-10-02).
Alternative considered: overriding Woo's `cart`/`single-product` templates with `wp_template` posts — rejected (a full copy of a 400KB+ generated page rots on every WooCommerce upgrade; surgical swaps don't).

## checkout-header-override — 2026-10-02
Theme template `templates/page-checkout.html` overrides WooCommerce's shipped `page-checkout.html` (which points at the logo-only `checkout-header` part and ships no footer); the override mirrors WC's own `page-cart.html` structure but references the theme's `header`/`footer` parts.
Why: checkout must stay consistent with the rest of the storefront — the announce bar carries the "شحن مجاني فوق 1,500" promise exactly where the purchase decision happens, and nav/footer let shoppers browse back. Cart already rendered the theme header through WC's template, so checkout was the lone inconsistent page (PROBLEMS 2026-10-02).
Alternative considered: keep WooCommerce's minimal checkout header (a recognized distraction-free checkout pattern) — rejected for cart/checkout consistency; revisit only if a client explicitly wants distraction-free checkout.

## header-cart-pill-no-count — 2026-10-02
The header cart pill stays the static live-HTML label `🛒 السلة` (no item count).
Why: `design/APPROVED.md` doesn't specify a count, a hardcoded "(0)" would lie the first second an item is added, and a live count means mini-cart JS on every page — scope creep with no approved design backing.
Alternative considered: static "(0) 🛒" to match the mock's shape — rejected (dishonest the moment the cart is non-empty). Live count via WooCommerce mini-cart JS — deferred unless the owner asks or a later design iteration approves it.

## whatsapp-demo-number — 2026-10-02
The mobile bottom dock's WhatsApp button links to the placeholder `https://wa.me/201000000000` with a pre-filled Arabic greeting ("السلام عليكم نيلاد، عايز أستفسر عن منتجاتكم (تجربة ديمو)").
Why: no real number exists yet (owner item in ASSETS_TODO); the demo runs on localhost only, so the placeholder cannot message a real person. A wrong-but-visible CTA beats a missing CTA in a demo.
Follow-up: swap in the owner's real number in `parts/footer.html` before any public deployment/handoff — tracked here because it must not ship as-is to production.

## seed-single-boot — 2026-10-03
All seeding runs inside **one** wp-cli boot: `nilad-core/seed-wp.php` (identity, pages, content, front page, every WooCommerce setting, PHP media import, verification echo) includes `seed-catalog.php`; `scripts/seed.sh` became a thin wrapper (language check via `L<digit>` sentinel → optional `wp language` installs → single `wp eval-file` → Paymob install). Page HTML moved from `scripts/content/` into `nilad-core/assets/content/` so one mounted path carries everything.
Why: the previous flow ran ~45 separate `wp` boots and a single boot costs 20–260s on this host → seed took 40+ minutes; the rewritten flow completes in **~50 seconds** total. Content stays reviewable files in git and `eval-file` sidesteps the argv limits (see `seed-content-via-eval-file`).
Verified: full `bash scripts/seed.sh` run (2026-10-03) printed the zone table (state:EG:EGC + state:EG:EGGZ before country:EG; flat 60/90, free ≥1500), 8 products, and Paymob install + activate — no duplicate pages on re-run.

## paymob-official-plugin — 2026-10-03
Payment integration = the official **`paymob-for-woocommerce`** plugin from wordpress.org, installed and activated by `seed.sh` (offline-safe: install failure degrades to a warning), configured later with the owner's test keys.
Why: maintained by Paymob — no custom payment/iframe code to own (PCI-adjacent surface, webhook signing), updates stay theirs. A hand-rolled Paymob integration was rejected for a demo.
Live success/failure/refund runs are **owner-key-blocked** (ASSETS_TODO #3) → recorded as NOT VERIFIED in PROBLEMS and the final report; COD + bank transfer are the verified payment paths.

## egypt-governorate-zones — 2026-10-03
Two shipping zones, seeded idempotently: **#1 "القاهرة والجيزة"** (order 0, locations `state:EG:EGC` + `state:EG:EGGZ`) → free shipping ≥ 1500 EGP + flat rate **60**; **#2 "باقي المحافظات"** (order 1, location `country:EG`) → free ≥ 1500 + flat **90**. Store defaults `country EG:EGC`, `ship_to_countries = EG`.
Why: mirrors Egyptian market reality (Cairo/Giza delivery is cheaper) while the store advertises "شحن مجاني فوق 1,500"; zone **order** makes the state-specific zone win over the country-wide fallback (WooCommerce evaluates zones top-down).
Verified: seed VERIFY echo + browser e2e `rate-cairo-60`, `rate-sohag-90`, `rate-free-above-threshold` (shots `b18-*`).

## storeapi-phone-validation — 2026-10-03
Phone is validated and normalized **server-side at the Store API** (`woocommerce_store_api_checkout_update_customer_from_request` → `nilad_normalize_eg_mobile()` → `RouteException(400, "رقم الموبايل غير صحيح. مثال: 01012345678")`). Canonical form `01XXXXXXXXX`; accepts `+20`/`0020`/spaces/dashes; rejects wrong length/prefix. Empty phone passes through (guest checkout may skip it).
Why: the block checkout phone field is optional and any HTML pattern is bypassable — an Egyptian store must not persist garbage phone numbers (orders become uncancellable). Store API placement covers every client (blocks, classic, REST) in one chokepoint.
Alternative considered: `woocommerce_checkout_process` — rejected (classic checkout only; the blocks checkout never runs it).
Verified: e2e `phone-invalid-blocked` receives the exact Arabic 400 banner and no order is created; unit cases in `check-phase4.php`; order #50 stores `01012345678`.

## local-mail-capture — 2026-10-03
`orders@nilad.example.com` (reserved TLD — non-routable) replaces the admin address as the WooCommerce From (display name **نيلاد**); on local installs every `wp_mail()` is appended to the `nilad_mail_log` option (ts/to/subject/effective From/message, last 20) so Arabic order emails are verifiable without an MTA. The effective sender is resolved from the `From:` header **or** via `wp_mail_from(_name)` filters (WooCommerce registers those during its send — `class-wc-email.php ~1230`). Production installs never write the log (`nilad_is_local_site()` guard).
Why: wp-env runs no sendmail (`Connection refused` is expected and harmless) and the demo needs email evidence anyway; the branded From proves the store identity end-to-end; `.example.com` can never leak mail to a real inbox.
Verified: order #50 → 10 log entries, last subject `[نيلاد]: لديك طلبًا جديدًا: رقم50`, From `نيلاد <orders@nilad.example.com>` (`check-phase4.php` inside `verify.sh`).

## store-api-total-items — 2026-10-03
The free-shipping notice JS reads `totals.total_items` from `/wc/store/v1/cart`, guards `NaN`, and hides itself when `!cart.items_count`.
Why: the WooCommerce 11 Store API totals payload has **no `items_subtotal` key** — `parseFloat(undefined)` → `NaN`, and `NaN > 0.009` is `false`, so the notice permanently claimed "مؤهل للشحن المجاني" on every cart (PROBLEMS 2026-10-03). `currency_minor_unit: 0` for EGP means values are already in EGP — no scaling.

## n8n-mark-before-send — 2026-10-03
Every n8n workflow writes its idempotency key (Code node "Mark …") **before** the external send (Telegram HTTP / emailSend), never after; anything that must be read after an HTTP/email node is fetched with a cross-node reference (`$('<node>').item.json…`) instead of `$json`.
Why: n8n HTTP/email nodes **replace** the item JSON with their API response — a post-send Mark node would silently write `f3:undefined`-style keys and lose all duplicate protection (found during F2–F7 parallel build, PROBLEMS 2026-10-03). Trade-off accepted and documented in `n8n/runbooks.md`: at-most-once messaging (a failed send is alerted by the Error Workflow but not auto-retried on webhook replay) beats double-messaging customers.
Verified: full test suite `node n8n/tests/run-tests.js` → 87/87 after the graph rewrites (F2: Format→Mark→email; F3: Mark before hasEmail branch; F4/F5: Mark before Telegram; F6: Mark before email).

## n8n-schedule-rule-interval — 2026-10-03
Schedule Trigger nodes (typeVersion 1.2) must carry the interval under `parameters.rule.interval` (`{field:'hours'|'days', hoursInterval|daysInterval, triggerAtHour}`); bare `parameters.interval` is ignored by n8n and the trigger falls back to its default cadence.
Why: F3/F5 were authored with the bare shape from a bad prompt, F4/F7 with the documented shape — the split would have run F3/F5 at the wrong frequency with no import error to reveal it (PROBLEMS 2026-10-03). Rule pinned in `n8n/CONVENTIONS.md`.
Verified: all three scheduled flows (F3/F5/F6) normalized; `f3.cases.js` asserts `rule.interval`; all 8 workflows import cleanly on n8n 2.41.6 (`n8n/tests/import-evidence.txt`).

## n8n-logic-tests-via-shims — 2026-10-03
`n8n/tests/run-tests.js` unit-tests the **actual `jsCode` strings embedded in the shipped workflow JSONs** by extracting them from the file and executing under shims for `$input`/`$env`/`$getWorkflowStaticData`/`require` (`helpers.js`); per-flow cases live in `tests/cases/*.cases.js` and auto-load.
Why: the brief requires pinned sample-payload tests (happy/duplicate/missing-field/bad-signature) that must not drift from the shipped flows — testing a copied function would rot the moment the JSON changes. This runs without any n8n instance, so it stays in `verify.sh`.
Scope: what it proves = business logic (HMAC, normalization, dedupe, filters, aggregation, escaping, PII scrub). What it does not = node parameter shapes, credentials, live sends — covered separately by the real-import validation (8/8 on n8n 2.41.6, `n8n/tests/import-evidence.txt`) and blocked on owner credentials for live runs (ASSETS_TODO #4/#5 + SMTP).
Alternative considered: run flows in a live n8n with pinned input data (`pinData` + `n8n execute`) — rejected for CI (needs credentials for Telegram/Sheets/SMTP to reach the interesting nodes; much slower); kept as a possible owner-side shadow-run step.

## n8n-import-validation-oneshot — 2026-10-03
Workflow JSONs are validated with a **one-shot Docker container** (`--entrypoint sh -c "n8n import:workflow --separate --input=/workflows && n8n list:workflow"`) against a pinned-by-digest `n8n` image — not inside the container that hosts a running n8n server.
Why: `import:workflow` next to a live server fails with `SQLITE_BUSY` (database locked) — the server holds the SQLite lock through migrations (PROBLEMS 2026-10-03). The one-shot run gives a fresh DB per validation and leaves no container behind.
Verified: 8/8 workflows imported + listed on n8n 2.41.6 (evidence: `n8n/tests/import-evidence.txt`), run 2026-10-03.

## n8n-env-access-gate — 2026-10-04
The n8n instance runs with **`N8N_BLOCK_ENV_ACCESS_IN_NODE=false`** (in `n8n/.env`), and **no** Telegram credential appears in any node expression: the Format/Code node resolves `$env.TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` into the item (`tgToken`, `tgChatId`) and the HTTP node reads `{{$json.tgToken}}`.
Why (two independent reasons): (1) n8n 2.41 throws `access to env vars denied` unless `process.env.N8N_BLOCK_ENV_ACCESS_IN_NODE === 'false'` — and it blocks `$env` inside **Code nodes too**, which killed every execution until it was set (PROBLEMS 2026-10-04); (2) belt-and-braces — a secret that never appears in a node parameter cannot leak through the UI, an export, or a shared screenshot, so the flows stay safe to hand to a client. Docker caveat that cost the first fix: `docker restart` does **not** re-read `--env-file`, so the container must be recreated after adding the variable.
Verified live: signed webhook → F1 execution `success` + Telegram delivered; tampered signature → F1 `error` (`F1 rejected webhook: bad-signature`) → shared Error Workflow `success` → alert delivered (`n8n/tests/live-e2e-evidence.txt`).

## n8n-sheet-behind-gate — 2026-10-04
F1's Google Sheets node sits behind an IF node (`Sheet log enabled?`) driven by `SHEETS_ENABLED` (default `false`), ending in a NoOp when off.
Why: a missing Google credential makes the Sheets node fail, and a failed node marks the whole execution failed — so the Telegram alert for a real order would look like a broken automation (exactly what happened during the first live run). With the gate, F1 is Telegram-only and green until the owner connects the credential, then flips to `true` and the log starts filling.
Verified: live runs show `lastNodeExecuted: Sheet log skipped` with `status=success`; a structure test asserts the gate exists, reads `$env.SHEETS_ENABLED`, and that Telegram still receives the item directly (so the gate can never accidentally disable the alert).

## n8n-2x-lifecycle-scripts — 2026-10-04
Two maintenance scripts ship with the project because n8n 2.x makes every lifecycle step non-obvious: `scripts/cleanup-n8n-api.js` (delete duplicate imports, unarchive strays, attach the Error Workflow, activate — all via the local REST API using the owner account) and `scripts/n8n-publish.sh` (publish every workflow; run with the server stopped).
Why: n8n 2.x facts that each cost a debugging cycle (PROBLEMS 2026-10-04) — `import:workflow` creates **new ids** (so re-importing duplicates every flow), a workflow must be **published** before it can be activated or referenced as an error workflow (`publish:workflow --all` was removed), deletion requires `POST /:id/archive` first, activation needs `{"versionId": …}` in the body, and an error workflow must itself be published **and** active or F1 fails with "Error workflow is not active and cannot be executed".
Alternative considered: doing this by hand in the n8n UI each time — rejected (8 workflows × 5 steps, and every manual step is a chance to leave the suite half-attached, which is how the first live run failed).

## phase6-qa-harness — 2026-10-04
Phase 6 ships one repeatable harness: `scripts/qa-audit.js` (`npm run qa`) runs Lighthouse (mobile, **two passes** — throttled + unthrottled), axe-core (WCAG 2.1 A/AA + best-practice at 390px), 15 SEO checks and 9 security/HTML-hygiene checks over six pages, then writes `docs/QA-REPORT.md` + `design/qa/lighthouse-*.json` + `design/qa/qa-summary.json`. It **seeds the cart through the Store API first** (`GET /cart` for the nonce → `POST /cart/add-item`) and passes the `cart_token` cookie to the HTTP client, puppeteer and Lighthouse (`extraHeaders`).
Why: a QA pass that measures the wrong page is worse than no QA — `/checkout/` 302s to `/cart/` with an empty cart, which hid three real accessibility problems on the single most important page in the store. Two Lighthouse passes exist because the throttled performance score on this machine is dominated by PHP latency over the wp-env bind mount (TTFB 1.7-10.5s) and therefore measures the environment, not the storefront; the unthrottled pass separates app cost from host latency. Both numbers are reported — neither is presented as "the" score.
Result (2026-10-04): security 9/9 and SEO 15/15 on all six pages, Lighthouse accessibility **100** and best-practices 96-100 everywhere, axe clean on home/shop/product/contact, zero sub-24px touch targets anywhere. Evidence: `docs/QA-REPORT.md`, `design/qa/`.
Alternative considered: running the audits by hand in a browser — rejected (not repeatable, and "it looked fine" is not evidence a client can inspect).

## theme-semantics-fixes — 2026-10-04
Four markup defects found by axe and fixed in the theme/plugin: the announce bar became `<aside aria-label>` (content must sit in a landmark), the storefront `</main>` now wraps **all** sections (it previously closed right after the hero, leaving every section outside the landmark), a visually-hidden `<h2>` heads the new-arrivals card row so the outline never skips h1→h3, and the cart page gained a `templates/page-cart.html` override mirroring the checkout override so both transactional pages carry a single `<h1>`.
Why: these are not cosmetic — a screen-reader user navigating by landmark or heading level was losing whole sections of the homepage, and the cart/checkout pages had no h1 at all.
Verified: axe `region` and `heading-order` violations gone on all pages; `page-has-heading-one` gone on cart/checkout (`docs/QA-REPORT.md` §2).

## site-title-not-a-heading — 2026-10-04
The `core/site-title` block output is rewritten from `<h1>` to `<p>` in `nilad-core/qa-hardening.php`.
Why: WordPress renders the site title as the front-page `h1`, which collided with the hero headline — two h1 elements and an ambiguous document outline. The brand mark is a logo, not a page heading; every template emits its own single h1 (hero, post title, or a visually-hidden heading on cart/checkout).
Alternative considered: demoting the hero headline to h2 instead — rejected (the hero is the page's real subject; the logo is chrome).
Verified: exactly one h1 on all six audited pages (QA SEO check).

## seo-output-in-plugin — 2026-10-04
Meta description, Open Graph/Twitter tags, a canonical link and JSON-LD (`Organization` + `WebSite` on storefront pages, `Product` with price/availability/currency on products) are printed from `nilad-core/qa-hardening.php`, with a per-context Arabic description kept in the 50-160 character search-snippet window.
Why: the theme templates carry no head metadata, so before this the site had **no** meta description, no OG tags and no structured data on any page — measured, not assumed. The canonical is printed unconditionally because WordPress omits it for the WooCommerce shop archive. The product description is padded with the storefront promise (shipping/COD/returns) because WooCommerce short descriptions are ~30 characters, which reads as empty in Google.
Social image: a 1200x630 brand card generated by `scripts/make-placeholders.ps1` (wordless on purpose — GDI+ cannot shape Arabic text), imported by the seed into attachment `og-nilad` and stored in the `nilad_og_image_id` option, also used as the site icon. Reproducible from `reset.sh`.
Verified: 15/15 SEO checks on all six pages.

## security-headers-and-server-banner — 2026-10-04
`send_headers` in `qa-hardening.php` adds `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` and `X-XSS-Protection: 0`, and removes `X-Powered-By`. HSTS and CSP are deliberately **not** set: the demo is plain http on localhost, where HSTS is ignored and a CSP risks breaking the block checkout.
The Apache `Server` banner cannot be removed from PHP (Apache sets it at protocol level), so the QA check treats a version leak as a **deployment item** rather than a code defect, and the report tells the owner to set `ServerTokens Prod` + `ServerSignature Off` on the real host. Attempting a theme `.htaccess` for it was reverted: it had no effect in wp-env and would only have looked like hardening.
Verified: 9/9 security checks on all six pages (`docs/QA-REPORT.md` §3).

## wcag-22-target-sizes — 2026-10-04
A `.screen-reader-text` utility was added to the theme, and WCAG 2.2 target sizes were enforced in CSS: product-card title links, and WooCommerce's checkout controls (`.wc-block-components-address-form__address_2-toggle`, `.wc-block-components-panel__button`, `.wc-components-link`) got `min-height:24px` with inline-flex alignment.
Why: axe measured these at 18-20px tall, under the WCAG 2.2 AA minimum of 24px, on real shop and checkout screens. Padding fixes ergonomics without touching typography or layout.
Verified: the QA harness reports **0** sub-24px targets on all six pages (it excludes skip links and visually-hidden helpers, which are intentionally 1x1 until focused).

## webhook-secret-canonical-source — 2026-10-07
The WooCommerce webhook signing key lives in the wp option `nilad_n8n_webhook_secret`, generated inside WordPress; `register-n8n-webhooks.php` resolves it (env var → option → generate) and re-signs webhook rows whose secret differs. `scripts/sync-webhook-secret.js` copies the option into `n8n/.env` (which is what the n8n flows verify with).
Why: the audit found the live key as a 48-hex literal in a shipped plugin file, so anyone holding the source could mint valid `X-WC-Webhook-Signature` headers and drive F1/F2 (customer name/phone → Telegram/Sheets). The container cannot read the host's `n8n/.env`, and `.gitignore` does not protect a zip, so WordPress has to own the value and everything else has to pull from it. Rotation is therefore three commands: delete the option, run the register script, run the sync script.
Alternative considered: keeping the key in `n8n/.env` and passing it into wp-env as a container env var — rejected (needs the secret in `.wp-env.json`/compose, i.e. still a file in the tree).
Verified: fresh `source=generated length=48` on first run, webhooks #3/#4 re-signed, `sync-webhook-secret` reports `matches-wp-option=true`; no value is printed by either path. The old literal is dead — the pair was rotated, not just moved.

## safe-handoff-packaging — 2026-10-07
`npm run dist` (`scripts/package.ps1`) is the only supported way to hand the project over: it filters `.gitignore`-mirrored exclusions (`.env`, `*.local.txt`, `*.log`, `.sql*`, `dump*`, `.git`, `node_modules`, `wordpress/`, generated caches), stages the survivors, writes `dist/nilad-source-<stamp>.zip`, then re-opens the archive and fails the build if a forbidden entry is present.
Why: `.gitignore` only protects git, and this repo had **zero commits** — the realistic leak path was a plain zip (audit evidence listed the 10 secret files it would have shipped).
Two implementation details that are easy to get wrong: Windows `Compress-Archive` / `ZipFile.CreateFromDirectory` write `\` inside entry names, which extracts as literal backslashes on Linux/macOS, so entries are written by hand with `/`; and the verification step earned its place immediately — the first run shipped `n8n/.env` because the exclusion regex was anchored to the project root.
Alternative considered: storing secrets outside the project tree — rejected (n8n workflows, runbooks and `check-live.js` all expect `n8n/.env` next to them).
Verified: 385 entries, 0 forbidden entries, 0 backslash entries, `.env.example`/`n8n/workflows/`/plugin/theme/docs all present, checked both by the script and by an independent re-read of the zip.

## exposure-hardening-plugin — 2026-10-07
`nilad-core/exposure-hardening.php` closes the enumeration/brute-force doors: unauthenticated `/wp/v2/users` routes removed via `rest_endpoints`, author archives 301 to home, XML-RPC refused (`xmlrpc_enabled` false **plus** a 403 at `plugins_loaded` when `XMLRPC_REQUEST` is defined, since the filter alone still answered `system.listMethods`), and a per-IP transient login throttle (5 failures / 15 minutes, cleared on success). Uploads script execution is denied by a `.htaccess` written by `harden-uploads.php` from `seed.sh`.
Why: on a local demo these were cheap doors that become real the moment the site leaves localhost — the username leaked through both REST and `/?author=`, and XML-RPC advertised `wp.getUsersBlogs` for credential stuffing. Keeping them in one small file (rather than growing `qa-hardening.php`) keeps the security-audit traceability: each block cites the audit finding it closes.
Known limits, stated rather than hidden: the throttle keys on `REMOTE_ADDR`, so behind a proxy it must move to the proxy layer; and WordPress still says "unknown username" in its login error text (core behaviour — the throttle is the mitigation).
Verified: `/wp-json/wp/v2/users` 404 · `/?author=1` and `/author/admin/` 301 → home · `system.listMethods` 403 · attempts 1–5 return the normal Arabic error and attempt 6 returns the throttle message · `uploads/.htaccess` written by the idempotent seed.

## mobile-nav-overlay-at-900 — 2026-10-07
The header navigation uses the core overlay menu (`overlayMenu:"mobile"`); below 900px the inline list is hidden and the open button is forced to 44×44, while the header's "اتسوّق الآن" CTA is hidden (the dock and the hero already carry it — and with the hamburger added it wrapped the header into three rows at 390px).
Two traps worth remembering: (1) an ancestor with `backdrop-filter` turns a `position:fixed` descendant into a positioned box, so the overlay collapsed into a thin strip until `html.has-modal-open .site-header{backdrop-filter:none}` was added; (2) the inline list must be hidden with a **direct-child** selector (`.wp-block-navigation > .wp-block-navigation__container`) — the overlay reuses the same class for its own list, and hiding it globally produced an empty menu.
Why: the audit's highest-impact accessibility finding was that at 390px the whole header nav was unreachable — for an Egyptian mobile-first store that is the difference between a usable site and a broken one.
Verified: hamburger visible 44×44 at 390 with **4/4 links visible after the click** (screenshots `home-390-nav-closed.png`, `home-390-nav-open.png`), desktop 1440 unchanged with 4 inline links, axe @390 clean.

## reveal-content-visible-without-js — 2026-10-07
`@media(scripting:none){.reveal{opacity:1;transform:none;transition:none}}` in the theme CSS.
Why: the reveal-on-scroll effect starts every `.reveal` element at `opacity:0` and only the inline IntersectionObserver script adds `.in`. With JS disabled (or if that script fails) 13/13 elements — whole homepage sections — stayed invisible, which is hidden content, not a missing animation. `scripting` is exactly the media feature for this; a `.no-js` class would need server-side cooperation this block theme does not have.
Verified: with script execution disabled, `reveal total=13 hidden=0` and the hero is visible (`home-390-no-js.png`).

## truth-over-conversion-labels — 2026-10-07
The eight homepage "أضف للسلة" buttons link to `/shop/` and do nothing else, so they now read **"اتفرج على المتجر"**; the `Demo` badges carry `lang="en"`.
Why: a button that says "add to cart" and navigates to the shop is a broken promise to every customer and a link-purpose failure (WCAG 2.4.4) — the audit counted it as a user-trust trap. The alternative (wiring real AJAX add-to-cart for static demo cards) would invent a cart state for products the cards don't represent. Mixed Arabic/Latin runs are marked rather than left for a screen reader to guess (WCAG 3.1.2).
Verified: 0 add-to-cart labels on plain links, 8/8 badges with `lang="en"`, axe @390 clean.

## seo-output-follows-core-not-duplicates — 2026-10-07
`qa-hardening.php` now prints the canonical link only when core is silent (`! is_singular()`), and no longer emits its own `Product` JSON-LD (WooCommerce owns it). The sitemap drops the `noindex` Woo pages and the author archive; `hello-world` is deleted and `default_comment_status` is `closed` in the seed.
Why: the audit measured two identical canonicals on five pages (core prints them for singular views, we printed unconditionally) and two `Product` nodes sharing one `@id` with divergent offer shapes — two entities for one product. Woo's node is the richer one (offer array with `UnitPriceSpecification`, `validThrough`), so ours was the one to remove rather than suppress Woo's.
Alternative considered: buffering `wp_head` and de-duplicating whatever appears — rejected as fragile; the explicit `is_singular()` guard matches how core actually behaves (it stays silent on the shop archive, which the audit evidence confirms).
Verified: exactly 1 canonical on `/`, `/shop/`, `/product/…`, `/cart/`, `/contact/`; product page emits 1 Organization graph + 1 Woo Product; sitemap has 3 child sitemaps with 0 noindex/author/sample URLs (was 28 URLs including all of them).

## arabic-numerals-western-digits — 2026-10-07
Digits are **Western (0-9)** everywhere on the storefront and in emails: prices, quantities, dates, phone examples, and the login throttle message. The Arabic comma `،` is the only punctuation used inside Arabic sentences.
Why: the `arabic-rtl` §10 checklist requires one numeral system and a documented decision; the audit found the code consistent but undocumented (item 10 FAIL). Mixed numerals make prices ambiguous in RTL context and break copy-paste into forms.
Arabic typography rule that came with it: `letter-spacing` must be `0` on Arabic text (the site title was `-0.18px`); the positive `letter-spacing` on the `NILAD · DEMO` sub-label stays, because that run is Latin only.
Verified: computed `letter-spacing: normal` on the Arabic title, and 0 Eastern-Arabic digits across the audited pages.
