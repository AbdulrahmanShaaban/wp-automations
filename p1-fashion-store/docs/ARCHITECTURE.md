# Architecture — P1 demo fashion store

## Stack (versions verified 2026-10-01 from the green `reset.sh` run)
- WordPress **7.1.2** via `@wordpress/env` **11.16.0** (Docker Desktop **29.7.2**), PHP **8.3** (Node 24.19.0 on host)
- **Block theme** `nilad-theme` (`theme.json` = approved tokens) + custom plugin **`nilad-core`** — no business logic in the theme
- WooCommerce **11.1.2** (pinned versioned zip; HPOS + block Cart/Checkout declared), Egypt config: EGP, 0 decimals, COD ✅ — governorate shipping zones in Phase 4
- Paymob for WooCommerce — **test mode only** in the demo (owner creates keys)
- n8n local via Docker Compose (demo/internal only) for P2 flows — client production runs on the client's server (license rule, Brief Part 0.4)
- Tooling: WP-CLI inside wp-env, `scripts/screenshot.js` (puppeteer-core, 1440/390), Lighthouse mobile

## Structure
```
docs/            PLAN, ARCHITECTURE, DECISIONS, PROBLEMS, ASSETS_TODO, OWNER-BRIEF/, CLIENT-QA.md, GLOSSARY.md
design/          brief.md, tokens.css, preview-*.html, APPROVED.md, shots/ (design + foundation-*.png evidence)
wp-content/themes/nilad-theme/         block theme (theme.json, templates/, parts/, functions.php)
wp-content/plugins/nilad-core/         all logic/forms/integrations
scripts/         seed.sh (idempotent), reset.sh, verify.sh, patch-wp-env.js (machine fix), php-tune.js (perf ini, afterStart), opcache-reset.sh, screenshot.js, *-runner.sh (detached-log helpers)
n8n/             docker-compose.yml, workflows/*.json, tests/*.json (Phase 5)
portfolio-assets/ cover/desktop/mobile webp, architecture.svg, automation.svg (Phase 7)
```

## Key patterns in use
- **Everything as code:** site content/config created by idempotent `scripts/seed.sh`; `scripts/reset.sh` rebuilds from zero. No click-together admin state.
- **Secrets:** only in `.env` (git-ignored); `.env.example` lists names only. No credentials in chat or git.
- **Plugin owns logic:** capability checks + nonce + sanitize + escape + `$wpdb->prepare` in every custom PHP; webhook handlers idempotent and server-side verified.
- **Demo honesty:** fictional brand, labelled Demo; no invented testimonials, metrics, clients, or prices.
- **Verification:** every phase reports evidence (commands run, screenshots, test results) — never "should work".

## Performance (machine-specific — Docker bind mounts on Windows)
Measured: stat()/file reads over the Docker Desktop bind mount cost ~8–10ms here; default settings made pages 8–24s. Three-part fix (PROBLEMS "8–24 seconds", DECISIONS `opcache-validate-timestamps-off` + `deferred-wc-block-registration`):
1. **`scripts/php-tune.js`** (runs on `.wp-env.json` `lifecycleScripts.afterStart`, or `npm run tune`) writes `/usr/local/etc/php/conf.d/zz-nilad-perf.ini`: realpath 4MB, opcache 192M/20k files/interned 32M, `validate_timestamps=0` → warm pages ~1.7–2.0s. PHP edits require `npm run opcache:reset` (HTML/theme files unaffected).
2. **Deferred WooCommerce block registration** in `nilad-core`: plain frontend views set `woocommerce_should_register_blocks → false`; the full set registers on first `woocommerce/*` block render via `pre_render_block` (admin/REST/editor keep WooCommerce defaults). Pages without WooCommerce blocks pay zero registration cost; the first page with one pays it once (~3.5–5s).
3. Templates: `page.html` + `single.html` render `wp:post-content` (static pages used to fall back to the blog-only `index.html` and showed empty bodies).

## Not yet decided (by phase)
- Caching/object cache (Redis) and hosting → Phase 4/6, host-dependent
- Image sourcing and licenses → `docs/ASSETS_TODO.md` #4
- Curated nav menu (auto page-list currently shows Woo's English pages) → Phase 3
