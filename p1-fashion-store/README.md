# نيلاد / Nilad — P1: Arabic-first WooCommerce fashion store (demo)

> **Status: Phases 0–6 complete** (2026-10-04). Store + commerce + n8n automation + a measured QA pass. See `docs/QA-REPORT.md` for the numbers and `docs/99-final.md` for the final report.

**What it is:** a demo e-commerce store for a fashion/accessories brand in Egypt: RTL Arabic, a block theme built on an approved design, Egyptian governorate shipping, COD + Paymob (test mode), server-side phone validation, branded Arabic order emails — and an **n8n automation suite** that alerts the owner on Telegram, emails customers, and pages the owner when the site goes down.

Brand, products and copy are fictional; the store is labelled **Demo** throughout.

**Positioning:** "I build online stores and business websites that sell, and I automate what happens after the order."

## Quick start

Prereqs: **Docker Desktop running**, Node.js, Git (all installed on this machine).

```bash
npm install                   # @wordpress/env 11.16.0 + machine patch (see docs/PROBLEMS.md)
npx @wordpress/env start      # -> http://localhost:8888 (afterStart auto-applies the PHP perf ini)
bash scripts/seed.sh          # idempotent content/config (run twice = no duplicates)
bash scripts/verify.sh        # 26 checks: WP/Woo/theme/pages/currency/render/lint/commerce/n8n tests
bash scripts/reset.sh         # destroy + start + seed + verify: full rebuild from zero
```

First `start` builds Docker images (~4 min); `reset.sh` end-to-end ~15 min on this machine.

**After editing any PHP file** (plugin/theme `*.php`): `npm run opcache:reset`
(OPcache runs with `validate_timestamps=0` for speed on this machine — PHP edits are invisible until you reset. HTML templates, patterns and `theme.json` are not affected. The first page after a reset takes ~15–19s once while OPcache recompiles. See `docs/DECISIONS.md` `opcache-validate-timestamps-off`.)
`npm run tune` re-applies the PHP perf ini manually (normally automatic after start).

## The n8n automation suite (P2)

```bash
docker run -d --name nilad-n8n -p 5678:5678 --env-file n8n/.env -v nilad-n8n-data:/home/node/.n8n n8nio/n8n:latest
node n8n/check-live.js      # validates your Telegram token / chat id / sheet / secrets without n8n
node n8n/tests/run-tests.js # 87 assertions against the jsCode embedded in the workflow JSONs
npm run n8n:check
```

`n8n/README.md` has the import/attach/activate steps, `n8n/runbooks.md` the per-flow runbook.

## QA

```bash
npm run qa          # Lighthouse (mobile, throttled + unthrottled) + axe-core + SEO + security headers
npm run qa:fast     # everything except Lighthouse
```

Writes `docs/QA-REPORT.md` and `design/qa/*.json`. Latest run: security **9/9** and SEO **15/15** on six pages, Lighthouse accessibility **100**, best-practices 96–100. Performance is environment-bound on this machine (PHP over a Docker bind mount); the report separates the two.

## Verified versions (2026-10-04)

| Piece | Version |
|---|---|
| WordPress | 7.1.2 |
| WooCommerce | 11.1.2 (pinned zip in `.wp-env.json`) |
| PHP | 8.3 |
| @wordpress/env | 11.16.0 |
| n8n | 2.41.6 (workflows import-validated + run live) |
| Docker Desktop | 29.7.2 |
| Node.js | 24.19.0 |

## Project structure
See `docs/ARCHITECTURE.md`. Human docs live here; agent/session docs live in `docs/`.

## Key docs
| File | What |
|---|---|
| `docs/99-final.md` | final report: changed / verified / reviewed / performance / security / portfolio / remaining |
| `docs/QA-REPORT.md` | measured QA numbers and how to read them |
| `docs/PLAN.md` | phases, status, risks |
| `docs/CASE-STUDY.md` | portfolio case study (what a client asks) |
| `design/APPROVED.md` | approved design (source of truth for all UI) |
| `docs/OWNER-BRIEF/` | per-phase Arabic handoff summaries for the owner |
| `docs/ASSETS_TODO.md` | **owner-only actions** with exact steps |
| `docs/CLIENT-QA.md` | answers the owner can say to clients |
| `docs/GLOSSARY.md` | Arabic term glossary |
| `docs/PROBLEMS.md` | honest problem log |
| `n8n/CONVENTIONS.md` | binding rules for every workflow in the suite |
