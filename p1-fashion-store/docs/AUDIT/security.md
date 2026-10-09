# Security Audit — Nilad (P1, `p1-fashion-store`)

**Date:** 2026-10-06 · **Mode:** READ-ONLY (no code, theme, plugin, n8n or doc changes outside `docs/AUDIT/`; `scripts/verify.sh` and `scripts/qa-audit.js` NOT run)
**Target:** http://localhost:8888 — WordPress 7.1.2 + WooCommerce 11.1.2 + `nilad-core` 0.1.0 + `nilad-theme` 0.1.0 + `paymob-for-woocommerce` 4.1.14, n8n workflows in `n8n/workflows/`, local wp-env (Docker, Apache 2.4.68 / PHP 8.3.35)
**Scope:** the 9 checks in the audit brief (HTTP security headers, secrets handling, upload hardening, exposure/enumeration, Store API validation + PII endpoints, webhook/HMAC handling, dependencies/attack-surface inventory, forms/CSRF, password/auth basics)
**Skills applied:** `security-trust` + `references/advanced-appsec.md`
**Evidence root:** `docs/AUDIT/evidence/security/` (75 files, indexed at the bottom)

> **Severity context:** this is a **LOCAL DEMO**, not production. Severities below are rated for a demo that will be handed off as source (zip / repo) to a client — so "secret leaves the machine" is treated seriously even though the service is not internet-facing. Anything that only matters behind a real TLS terminator or a public IP is marked as a deployment item rather than an active defect.

## Exact tools / commands used

```powershell
# 1) headers (per page, saved to check1-headers-*.txt)
curl.exe -sI http://localhost:8888/                     # also /shop/ /product/oversized-cotton-tee/ /cart/ /checkout/ /my-account/
curl.exe -sIL http://localhost:8888/checkout/           # follow 302 → /cart/ (empty cart)
# checkout with an item in cart: cookie jar + ?add-to-cart=45 → check1-headers-checkout-incart.txt

# 2) secrets: .gitignore read, git ls-files/-o/--ignored/check-ignore, recursive *.env glob,
#    key-name-only extraction, example-vs-real equality (MATCH/DIFFER only), pattern sweep
git rev-parse --is-inside-work-tree ; git status --ignored --porcelain ; git log --oneline -5

# 3) uploads (read-only)
npx wp-env run cli bash -c "ls -la wp-content/uploads/"
npx wp-env run wordpress bash -c "ls -la /var/www/html/wp-content/uploads/; find ... -name '.htaccess'; cat ..."
npx wp-env run wordpress bash -c "grep -rn -E 'AllowOverride|Options' /etc/apache2/; cat /etc/apache2/conf-enabled/docker-php.conf"
curl.exe -sI/-o NUL -w "%{http_code}"  on uploads dirs, an .webp, and an existing uploads/*.php

# 4) exposure
curl.exe -sI http://localhost:8888/xmlrpc.php ; curl.exe -s POST xmlrpc.php (system.listMethods)
curl.exe -s http://localhost:8888/wp-json/wp/v2/users ; curl.exe -s -L "/?author=1"
curl.exe -s http://localhost:8888/wp-json/  (route/namespace inventory) ; sensitive-path probe list

# 5) Store API (one POST, malformed phone only — order count compared before/after)
npx wp-env run cli wp db query "SELECT COUNT(*) FROM wp_wc_orders"
curl.exe -s -D - .../wc/store/v1/cart          (capture Nonce + Cart-Token headers)
curl.exe -s -X POST .../wc/store/v1/checkout -H "Nonce: ..." --data @<body with phone "12345">
curl.exe -s -o NUL -w "%{http_code}" .../wc/v3/orders|customers, .../wc/store/v1/order/1, ...

# 6) n8n: static reads + pattern scan (8 secret patterns × 24 files, values never printed)
Get-Content n8n/workflows/*.json ; Select-String X-WC-Webhook-Signature|createHmac|timingSafeEqual

# 7) dependencies / inventory
npm audit --json ; npm audit --omit=dev --json
npx wp-env run cli wp core version ; wp plugin list ; wp theme list

# 8/9) forms, comments, auth
npx wp-env run cli wp option get default_comment_status ; wp post list --post_type=page|post|product
curl.exe -s .../contact/ (form tags) ; one failed POST to wp-login.php (single attempt)
npx wp-env run cli wp config list ; wp eval(–) → php -i | grep display_errors
```

No mutation beyond read-only requests; one `?add-to-cart` (cart cookie, session-local) and **one** malformed-phone checkout POST (rejected with 400, order count unchanged 6 → 6).

## Attack-surface inventory (check 7)

| component | version | note | evidence |
| --- | --- | --- | --- |
| WordPress core | 7.1.2 | `wp core version`; `<meta name="generator" content="WordPress 7.1.2" />` on `/` | `check7-wp-inventory.txt`, `check4-version-disclosure.txt` |
| WooCommerce | 11.1.2 | pinned in `.wp-env.json` | `check7-wp-inventory.txt` |
| paymob-for-woocommerce | 4.1.14 | **update available 4.1.15** | `check7-wp-inventory.txt` |
| nilad-core / nilad-theme | 0.1.0 | project code (audited) | `check7-wp-inventory.txt` |
| PHP / Apache | 8.3.35 / 2.4.68 | banners visible on non-themed endpoints | `check4-xmlrpc-cron-login.txt` |
| npm tree | 484 pkgs | all in `devDependencies` (`@wordpress/env`, `axe-core`, `chrome-launcher`, `lighthouse`) | `package.json`, `check7-npm-audit-*.json` |
| REST surface | 662 routes | namespaces incl. `wc/v3`, `wc/store/v1`, `wc-admin`, `wc-analytics`, `wc/private`, `jetpack/v4`, `wp/v2` | `check4-wp-json-index.json`, `check4-wp-json-summary.txt` |
| inactive themes | 16 × twenty* | default wp-env content, present on disk | `check7-wp-inventory.txt` |

## Findings

| # | severity | area | location | evidence (quoted / file:line) | fix | effort |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **High** | Secrets in source | `wp-content/plugins/nilad-core/register-n8n-webhooks.php:9` | A literal 48-hex value is assigned to `$secret` (line 9) and passed to `set_secret()` (line 29). Compared without printing it: `hardcoded-literal-present: True`, `hardcoded-literal-length: 48`, `identical-to-n8n-env-WOO_WEBHOOK_SECRET: True` → the **live** webhook signing key is in a shipped plugin file, so anyone holding the source can mint a valid `X-WC-Webhook-Signature` for `order.created` / `order.updated` and drive the F1/F2 flows (customer name/phone → Telegram/Sheets). Value withheld per audit rule. Evidence: `check6-hardcoded-webhook-secret.txt` | Load the secret from env / `wp option`, delete the literal, and **rotate** `WOO_WEBHOOK_SECRET` (WooCommerce webhook + `n8n/.env`) | M |
| 2 | **High** | Secrets leave the machine on handoff | `n8n/.env`, `n8n/oauth-client.local.txt`, `n8n/owner-account.local.txt`, root `*.log` | These files exist on disk (`n8n\.env` 1711 B, `oauth-client.local.txt` 964 B, `owner-account.local.txt` 546 B) and `.gitignore:14-16` only protects **git** — the repo has *zero commits* (`fatal: your current branch 'master' does not have any commits yet`) so the real risk is a plain zip: `check2-zip-inclusion-sim.txt` lists all 10 entries a naive zip ships. `owner-account.local.txt` is parsed as `email`/`password` by `scripts/cleanup-n8n-api.js:11-28`. Key inventory only: `TELEGRAM_BOT_TOKEN`, `WC_API_KEY`, `WC_API_SECRET`, `WOO_WEBHOOK_SECRET`, `GOOGLE_SHEET_*`, `N8N_ENCRYPTION_KEY`… (`check2-env-key-names.txt`) | Add a packaging script with an exclusion list (or move `n8n/.env` + the two `.local.txt` outside the project); rotate anything ever shared | S |
| 3 | **Medium** | User enumeration | `/wp-json/wp/v2/users`, `/?author=1`, admin path default | Unauthenticated `GET /wp-json/wp/v2/users` → **200** returning `{"id":1,"name":"admin",…,"slug":"admin",…,"is_super_admin":true}` plus a Gravatar hash (`check4-users.json`, `check4-enumeration.txt`); `GET /?author=1` → `301 Location: /author/admin/` → 200 (`author1-follow=200 final=http://localhost:8888/author/admin/`). Valid username also confirmed as `admin` in the same REST payload. | Filter unauth user listing (e.g. `rest_endpoints` / `users_can_register` policy), redirect author archives, and rename the admin account on any non-local install | S |
| 4 | **Medium** | Auth brute-force surface | `wp-login.php`, `xmlrpc.php` | One failed `POST /wp-login.php` → `HTTP/1.1 200 OK` with **no** 429/`Retry-After`/throttle header (`check9-login-probe.txt`); installed plugins are only `hello`, `nilad-core`, `paymob-for-woocommerce`, `woocommerce` — no login-limiter (`check7-wp-inventory.txt`). `POST /xmlrpc.php` (`system.listMethods`) → **200** and lists `wp.getUsersBlogs` (`check8-xmlrpc-listmethods.xml`, `check8-forms-xmlrpc.txt`), i.e. XML-RPC auth methods are live for credential stuffing / pingback abuse. | Rate-limit `wp-login.php` (+ `wp-admin`) at Apache or via a limiter plugin; disable/remove `xmlrpc.php` if no client needs it; fail2ban for repeat offenders | M |
| 5 | **Medium** | Upload hardening | `wp-content/uploads/` (root + `2026/`) | Deny-all `.htaccess` exists **only** in `paymob-private-logs/`, `wc-logs/`, `woocommerce_uploads/` (`find` output in `check3-uploads-protection-source.txt`, contents in `check3-htaccess-contents.txt`); **none at `uploads/` root or `uploads/2026/`**. Apache runs mod_php with `<FilesMatch \.php$> SetHandler application/x-httpd-php` and `<Directory /var/www/> AllowOverride All` (`check3-apache-authz-full.txt`), so a `.php` dropped in a dated upload folder would be executed rather than served as text. Not exploited here (uploads are admin-only in the demo). Existing protections observed: directory listings off (`Options -Indexes` → 403), protected subdirs 403, static `.webp` 200 (`check3-upload-exec-probe.txt`). | Ship a root `wp-content/uploads/.htaccess` denying script execution (`php_flag engine off` / `<FilesMatch \.php$> Require all denied`) and/or run uploads from a non-executed alias | S |
| 6 | **Low** | Webroot exposure | `/.git/*` served by Apache | `GET /.git/HEAD` → **200** (commit id), `/.git/config` → 200, `/.git/index` → 200, `/.git/refs/heads/master` → 200 (`check4-webroot-source-exposure.txt`). Container check shows it is the **WordPress core** clone (`/var/www/html/.git`, origin host `https://github.com`, refs such as `refs/remotes/origin/1.5-branch`), `embedded-userinfo: False` (`check4-git-config-summary.txt`, `check4-container-git-config.txt`) — i.e. public upstream code today, but the docroot is willing to serve `.git`. Other project files are **not** reachable: `/.env` 404, `/n8n/.env` 404, `/package.json` 404, `/scripts/seed.sh` 404, `/wp-config.php` 200-with-0-bytes (executed, no source disclosure) (`check4-sensitive-path-probe.txt`). | Apache rule `RedirectMatch 404 ^/\.git` (the stock `security.conf` line is commented out) before any real deployment | S |
| 7 | **Low** | Transport / headers | all pages; `wp-login.php`, `xmlrpc.php`, `wp-cron.php` | Home/shop/product/cart/my-account: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(), microphone=(), camera=(), interest-cohort=()`, `X-XSS-Protection: 0` (from `nilad-core/qa-hardening.php:33-37`) — **no `Content-Security-Policy`** and **no `Strict-Transport-Security`** anywhere (HSTS is meaningless on plain-HTTP localhost: deployment item). CSP is present only as `Content-Security-Policy: frame-ancestors 'self';` on checkout-with-cart and `wp-login.php`. `Server: Apache/2.4.68 (Debian)` + `X-Powered-By: PHP/8.3.35` still leak on non-themed endpoints because `header_remove()` runs on `send_headers` only (`qa-hardening.php:29-42`); Apache is set to `ServerTokens OS` / `ServerSignature On` (`check3-apache-authz-full.txt`). Evidence: `check1-headers-*.txt`, `check4-xmlrpc-cron-login.txt` | Full CSP (start `frame-ancestors` + `object-src 'none'`), `ServerTokens Prod`/`ServerSignature Off`, `mod_headers` so `wp-login.php`/`xmlrpc.php` are covered too, HSTS at the TLS terminator | M |
| 8 | **Low** | Debug configuration | `.wp-env.json:11-13` | `"config": { "WP_DEBUG": true }` ships with `SCRIPT_DEBUG=1`, `WP_ENVIRONMENT_TYPE=local` (`check9-wp-config-constants.txt`). `php -i` shows `display_errors => Off`, `log_errors => On`, and core's `wp_debug_mode()` only raises `display_errors` when `WP_DEBUG_DISPLAY` is true (`check9-php-display-errors.txt`, `check9-wp-debug-mode-source.txt`) — so noise goes to the log, not the response, but verbose errors are one constant away from leaking paths/queries. | Keep `WP_DEBUG` local-only; assert `WP_DEBUG false` in any staged/prod config | S |
| 9 | **Low** | Dependencies (dev) | `package.json` devDependencies | `npm audit --omit=dev` → `{"critical":0,"high":0,"moderate":0,…}`; full `npm audit` → **3 critical, 1 high, 6 moderate** — all reached through `@wordpress/env` (`simple-git` command-execution class, `js-yaml`, `express`/`qs`, `sprintf-js`, `http-cache-semantics`) (`check7-npm-audit-all.json`, `check7-npm-audit-prod.json`). Nothing in the runtime path of the store (the PHP app has no composer manifest in this project). | `npm audit fix` / bump `@wordpress/env`, run `npm audit` in CI; keep dev tooling off production hosts | S |
| 10 | **Low** | Patch currency | `paymob-for-woocommerce` | `wp plugin list` → `paymob-for-woocommerce,active,update available,4.1.14,4.1.15` (`check7-wp-inventory.txt`) — a payment plugin with a pending upstream release; also 16 inactive default themes sit on disk. | Update the payment plugin before any public launch; remove unused themes | S |
| 11 | Info | Verified control — input validation | `nilad-core/nilad-core.php:133-165` | Live re-test: `POST /wp-json/wc/store/v1/checkout` with `phone:"12345"` → `HTTP 400` + `{"code":"nilad_invalid_phone","message":"رقم الموبايل غير صحيح. مثال: 01012345678"}` (`check5-phone-invalid-checkout.json`); order count before/after identical (`6` → `6`). Matches `docs/DECISIONS.md` `storeapi-phone-validation` (hook fires before order creation — code comment `nilad-core.php:120-124`). | none | – |
| 12 | Info | Verified control — authz on PII endpoints | REST | Unauth status codes: `/wc/v3/orders` **401**, `/wc/v3/customers` **401**, `/wp/v2/settings` **401**, `/wp/v2/plugins` **401**, `/wc/v3/system_status` **401**, `/wc/store/v1/order/1` **404**, `/wc/store/v1/checkout` **401** `woocommerce_rest_missing_nonce` (`check4-endpoint-status.txt`, `check5-pii-endpoints.txt`, `check5-store-checkout-get.json`). Public-by-design: `/wc/store/v1/products`, `/wc/store/v1/cart`, `/wp/v2/pages`, `/wp/v2/posts` → 200. | none | – |
| 13 | Info | Verified control — webhook HMAC | `n8n/workflows/f1-*.json`, `f2-*.json` | Both flows compute `crypto.createHmac('sha256', $env.WOO_WEBHOOK_SECRET)` over the raw body and compare with `crypto.timingSafeEqual`, with fail-closed guards `server-misconfig: WOO_WEBHOOK_SECRET missing`, `no-raw-body`, `missing-signature-header` (`check6-workflow-secret-recheck.txt` = `server-misconfig True / timingSafeEqual True / no-raw-body True` for both). Secrets come from `$env` refs (1–9 per workflow) + n8n `credentials` blocks; **0** long-hex / Telegram-token literals across 24 n8n files and **0** matches for 8 secret patterns (`check6-secret-scan-workflows.txt`), 0 in `n8n/workflows/*.json` (`check6-workflow-secret-recheck.txt`). One test-only literal exists in `n8n/tests/helpers.js:13,23` (`test-secret-do-not-use-prod`, `cs_test`) — fixtures, flagged so they are never reused. | rotate secret from finding #1 so the pair stays consistent | S |
| 14 | Info | Forms / CSRF / comments | pages, products, Store API | `default_comment_status = open` (site default) but **all 11 pages** are `comment_status=closed`; products (8) and `hello-world` post are `open` — reviews/comments reachable, standard WP nonce-protected forms (`check8-pages-comments.txt`). Contact page has **no `<form>`** (`check8-contact-page.html`), so no contact-form spam surface. Store API enforces its own nonce: missing → `401 woocommerce_rest_missing_nonce`, and responses carry `Nonce:` + `Cart-Token:` (JWT) headers (`check8-nonce-evidence.txt`). | set `default_comment_status=closed` for tidiness; keep review moderation on | S |
| 15 | Info | Misc exposure | `wp-cron.php`, `readme.html`, `license.txt`, generator meta | `wp-cron.php` → 200 (publicly triggerable, default WP), `readme.html`/`license.txt` → 200, `<meta name="generator" content="WordPress 7.1.2" />` on home (`check4-version-disclosure.txt`, `check4-xmlrpc-cron-login.txt`). | Disable `WP_DISABLE_CRON` + system cron on servers; drop the generator tag; consider removing readme/license | S |
| 16 | Info | Observed — no leak in logs | root `*.log` | 5 logs scanned: `email-like-tokens=0`, `egypt-phone-like-tokens=0` per file (`check2-log-pii-counts.txt`) | keep `*.log` out of handoff (already `.gitignore:23`) | S |
| 17 | Info | Observed — example files | `.env.example`, `n8n/.env.example` | Root example is **all-empty values** (13 keys); `n8n/.env.example` non-empty values are placeholders for the credential-shaped keys and **differ** from the live `n8n/.env` for `WOO_WEBHOOK_SECRET`, `TELEGRAM_BOT_TOKEN`, `WC_API_KEY`, `WC_API_SECRET`, `GOOGLE_SHEET_ID` (`check2-example-files-placeholder.txt`, `check2-example-vs-real.txt`) | none | – |
| 18 | Info | Observed — CORS + listings | Store API, webroot | Cross-origin probes with `Origin: http://evil.example` return **no** `Access-Control-Allow-Origin` (only `Access-Control-Allow-Credentials: true`, which browsers reject without ACAO) for both simple and preflight requests (`check4-cors-probe.txt`). Directory listing suppressed: `/wp-content/uploads/` 403, `/wp-content/` 200 with 0 bytes (`wp-content/index.php` "Silence is golden"), `/n8n/`, `/docs/`, `/scripts/` 404 (`check3-wp-content-status.txt`, `check4-sensitive-path-probe.txt`). | none | – |

**Counts:** High 2 · Medium 3 · Low 5 · Info 8 (18 rows).

## 5 highest-impact fixes

1. **Get the live webhook secret out of source** — `register-n8n-webhooks.php:9` currently holds the same key `n8n/.env` verifies with (finding #1). Read it from environment/`wp option`, then **rotate** `WOO_WEBHOOK_SECRET` in WooCommerce + `n8n/.env` so the copy in git/zip history stops working.
2. **Make the handoff zip safe by construction** — a plain zip of the folder ships `n8n/.env`, `n8n/oauth-client.local.txt`, `n8n/owner-account.local.txt` and 5 logs (finding #2). Ship a `package.ps1`/`npm run dist` with an exclusion list (or keep secrets outside the project tree), and rotate anything that has ever been shared.
3. **Close the two cheap brute-force/enumeration doors** — block unauth `/wp/v2/users` + author archives (finding #3) and add login rate limiting while disabling `xmlrpc.php` (finding #4). Both are a few lines/Apache rules and matter the moment this leaves localhost.
4. **Deny script execution in `wp-content/uploads/`** — root `.htaccess` is missing while mod_php + `AllowOverride All` are active (finding #5); one file drop turns an upload bug into code execution.
5. **One Apache hardening pass for headers/exposure** — `ServerTokens Prod`, `ServerSignature Off`, `RedirectMatch 404 ^/\.git`, a real CSP, and `WP_DEBUG=false` outside local (findings #6-#8); add HSTS at the TLS terminator when the demo gets a real domain.

## Could not verify / out of scope (explicit)

- **Paymob live payment path** — `PAYMOB_*` keys are absent (`.env.example` values empty) and `docs/PLAN.md` marks live runs owner-blocked; the iframe/redirect/callback HMAC behavior of `paymob-for-woocommerce` 4.1.14 was **not** exercised. No claim is made about it.
- **Actual PHP execution of a *newly uploaded* file in `uploads/`** — creating a test file would modify the system (forbidden), so finding #5 is inferred from Apache config (`SetHandler` + `AllowOverride All`) plus HTTP probes of *existing* files.
- **TLS / HSTS behaviour** — HTTP-only localhost; HSTS can only be validated behind real TLS.
- **Brute-force at volume, lockout timing, WAF/DoS limits** — exactly one failed login attempt was made; no distributed or sustained testing.
- **n8n runtime HMAC execution** — verified statically (code + guards) and against the pre-existing `n8n/tests/live-e2e-evidence.txt` / `import-evidence.txt`; `npm run n8n:test` was **not** re-run (not in the allowed command set).
- **Classic (non-block) checkout CSRF/nonce paths** — this build has no classic checkout page (`nilad-core.php:125`); only the Store API nonce path was probed.
- **Host/container-level exposure beyond port 8888** — no port scan, no Docker-socket/MySQL-credential review (wp-env default DB credentials assumed untouched, not assessed), no filesystem ACL review of the Docker volumes.
- **WooCommerce/WordPress core CVE-by-CVE review** — versions were inventoried (check 7) but individual core/plugin advisories were not matched against a vulnerability database; `npm audit` covers the Node side only.
- **Anything requiring code changes** — no fixes were applied (read-only mandate); `scripts/verify.sh`, `scripts/qa-audit.js`, `design/` and `docs/QA-REPORT.md` untouched.

## Evidence index (`docs/AUDIT/evidence/security/`)

- **Check 1 (headers):** `check1-headers-home.txt`, `-shop`, `-product`, `-cart`, `-checkout`, `-checkout-follow`, `-checkout-incart`, `-my-account`
- **Check 2 (secrets):** `check2-env-key-names.txt`, `check2-git-ignored.txt`, `check2-zip-inclusion-sim.txt`, `check2-example-files-placeholder.txt`, `check2-example-vs-real.txt`, `check2-project-secret-sweep.txt`, `check2-log-pii-counts.txt`
- **Check 3 (uploads):** `check3-uploads.txt`, `check3-uploads-protection-source.txt`, `check3-htaccess-contents.txt`, `check3-apache-config.txt`, `check3-apache-authz-full.txt`, `check3-apache-directory-opts.txt`, `check3-upload-exec-probe.txt`, `check3-uploads-dirlist.html`, `check3-paymob-logs-dir.html`, `check3-wc-logs-dir.html`, `check3-wp-content-listing.html`, `check3-wp-content-status.txt`
- **Check 4 (exposure):** `check4-xmlrpc-cron-login.txt`, `check4-users.json`, `check4-enumeration.txt`, `check4-author1.html`, `check4-author1.txt`, `check4-wp-json-index.json` (2.4 MB), `check4-wp-json-summary.txt`, `check4-endpoint-status.txt`, `check4-sensitive-path-probe.txt`, `check4-webroot-source-exposure.txt`, `check4-container-git.txt`, `check4-container-git-config.txt`, `check4-git-web-config.txt`, `check4-git-config-summary.txt`, `check4-cors-probe.txt`, `check4-version-disclosure.txt`, `check4-products.json`
- **Check 5 (Store API):** `check5-phone-invalid-checkout.json`, `check5-pii-endpoints.txt`, `check5-wcv3-orders.json`, `check5-wcv3-customers.json`, `check5-store-order1.json`, `check5-store-checkout-get.json`, `check5-additem-headers.txt`, `check5-additem-body.json`
- **Check 6 (webhooks):** `check6-hardcoded-webhook-secret.txt`, `check6-workflow-secret-recheck.txt`, `check6-secret-scan-workflows.txt`, `check6-credentials-refs.txt`
- **Check 7 (deps/inventory):** `check7-npm-audit-all.json`, `check7-npm-audit-prod.json`, `check7-wp-inventory.txt`
- **Check 8 (forms/CSRF):** `check8-pages-comments.txt`, `check8-contact-page.html`, `check8-forms-xmlrpc.txt`, `check8-xmlrpc-listmethods.xml`, `check8-nonce-evidence.txt`
- **Check 9 (auth/config):** `check9-login-probe.txt`, `check9-failed-login-body.html`, `check9-hardcoded-creds-scan.txt`, `check9-wp-config-constants.txt`, `check9-php-display-errors.txt`, `check9-wp-debug-mode-source.txt`, `check9-debug-display.txt`
- **Site up check:** `check0-site-200.txt`

*No secret values are stored in this document or quoted in evidence summaries; secrets are referenced by key name, file path and status only (`check6-hardcoded-webhook-secret.txt` records presence/length/equality with the value withheld).*
