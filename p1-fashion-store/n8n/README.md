# Nilad — Order Ops Suite (P2, n8n)

7 production-shaped n8n workflows + 1 shared Error Workflow for the Nilad store
(P2 of `OPENCODE_MASTER_BRIEF.md`). Arabic owner/customer messages, HMAC-verified
webhooks, idempotency everywhere, PII kept out of error alerts.

## Flows

| # | File | Trigger | Does |
|---|------|---------|------|
| F1 | `workflows/f1-new-order-alert.json` | Webhook `POST /woo-order-created` (HMAC) | Verify → dedupe → Arabic Telegram alert to owner + row in Google Sheet |
| F2 | `workflows/f2-status-updates.json` | Webhook `POST /woo-order-updated` (HMAC) | On `processing/completed/shipped` → Arabic status email to customer, once per order+status |
| F3 | `workflows/f3-pending-recovery.json` | Every 3 h | Pending orders older than `PENDING_HOURS` → reminder email to customer + Telegram line to owner (once per order) |
| F4 | `workflows/f4-low-stock-alert.json` | Daily 08:00 | Products with `stock ≤ LOW_STOCK_QTY` → one Telegram message (per product+qty, no repeat spam) |
| F5 | `workflows/f5-daily-summary.json` | Daily 09:00 | Yesterday's count / revenue / top product → owner Telegram (once per day) |
| F6 | `workflows/f6-review-request.json` | Daily 10:00 | Completed orders older than `REVIEW_AFTER_DAYS` → Arabic review-request email (once per order) |
| F7 | `workflows/f7-site-monitor.json` | Hourly | Store URL health check → `Stop And Error` on failure → Error Workflow alerts owner |
| — | `workflows/error-workflow.json` | Error Trigger | Shared failure alert to owner: workflow + node + execution id, first error line, PII-scrubbed, Arabic |

License rule (DECISIONS `n8n-hosting-rule`): the **demo runs on the owner's own
n8n**; never host client production n8n on our server under the community license.

## Requirements

- n8n ≥ 1.x (import-validated against **n8n 2.41.6** — see `tests/import-evidence.txt`)
- Env vars: copy `.env.example` → your n8n environment. All secrets via `$env`
  (n8n start flag `--env-file` or Docker `-e`), **never inside nodes**.
- For F1's HMAC Code node: `NODE_FUNCTION_ALLOW_BUILTIN=crypto`.
- **Required for n8n 2.41:** `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` — otherwise every
  Code node throws "access to env vars denied" (it blocks `$env` unless the value is
  exactly the string `false`; see `n8n-workflow/dist/*/workflow-data-proxy-env-provider.js`).
- Timezone: workflows pin `settings.timezone = "Africa/Cairo"`.

## Before you import: check your credentials

```bash
copy n8n\.env.example n8n\.env        # fill the 4 secrets you own
node n8n/check-live.js                # verifies what it can, prints nothing secret
node n8n/check-live.js --new-secret   # generate a WOO_WEBHOOK_SECRET
```

`check-live.js` validates the Telegram token against `getMe`, checks the chat is
reachable by the bot, flags a weak webhook secret or a non-numeric tuning value,
and lists what is still missing — so import/activate failures are diagnosed
before n8n is involved. The Google **credential** can only be chosen in the n8n
UI, so it is reported as a reminder, not checked.

For the order log: upload `order-log-template.csv` to
[sheets.new](https://sheets.new) and name it `P1 Order Log`, keeping the header row
(`orderId,total,city,phone,status,createdAt` — the Sheets node maps by header).
Two values identify it: `GOOGLE_SHEET_ID` (the `/d/<ID>/` part of the URL) and
`GOOGLE_SHEET_GID` (the `#gid=<N>` part). F1 selects the tab **by gid** — n8n's
Sheet field accepts *From list / By URL / By ID / By Name*, and the docs define the
"sheetId" as that `gid` value — so a localized tab name never has to be typed.
Delete the 3 sample rows if you want an empty log.

## Quick start (Docker)

```bash
docker run -d --name nilad-n8n \
  -p 5678:5678 \
  -e NODE_FUNCTION_ALLOW_BUILTIN=crypto \
  -e GENERIC_TIMEZONE=Africa/Cairo \
  -e WOO_WEBHOOK_SECRET=... -e TELEGRAM_BOT_TOKEN=... -e TELEGRAM_CHAT_ID=... \
  -e GOOGLE_SHEET_ID=... -e GOOGLE_SHEET_TAB=Orders \
  -e STORE_URL=http://host.docker.internal:8888 \
  -e WC_API_KEY=... -e WC_API_SECRET=... \
  -e PENDING_HOURS=48 -e LOW_STOCK_QTY=5 -e REVIEW_AFTER_DAYS=5 \
  -v n8n-data:/home/node/.n8n \
  -v "$PWD/workflows:/workflows" \
  n8nio/n8n:latest
docker exec nilad-n8n n8n import:workflow --separate --input=/workflows
```

Then in the n8n UI:

1. **Settings → General → Save these columns** is irrelevant — instead open each
   workflow (F1–F7) → `⋯` → **Settings → Error workflow** → pick
   *Nilad: error → owner alert*. (Workflow ids only exist after import, so this
   one attachment step is manual; the Error Workflow itself has none — loop-safe.)
2. Create credentials and re-point them:
   - **SMTP** (emailSend nodes in F2/F3/F6 — currently `REPLACE_ON_IMPORT`).
   - **Google Sheets OAuth2** (F1 append node).
3. Activate all 8 workflows.
4. Register the WooCommerce webhooks (Store → Settings → Advanced → Webhooks):
   - `order.created` → `https://<n8n-host>/webhook/woo-order-created`
   - `order.updated` → `https://<n8n-host>/webhook/woo-order-updated`
   - Secret = the same value as `WOO_WEBHOOK_SECRET`.
   For local testing use a tunnel (ngrok/cloudflared) or same-LAN host.

> Quirk: don't run `n8n import:workflow` inside a container whose n8n **server**
> process is already running — SQLite locks (`SQLITE_BUSY`). Use a one-shot
> container (`--entrypoint sh -c "n8n import:workflow ..."`) or stop the server.

## Tests (no n8n needed)

```bash
node n8n/tests/run-tests.js
```

Executes the **actual `jsCode` embedded in the workflow JSONs** through shims
(`$input`, `$env`, `$getWorkflowStaticData`, `require`) against pinned fixtures:
happy / duplicate / missing field / bad signature / phone variants / PII scrub /
aggregation math — **87 assertions, all passing**. `helpers.js` exports the
shims; per-flow cases live in `tests/cases/fN.cases.js` and are auto-loaded.

Structural import validation against a real n8n is recorded in
`tests/import-evidence.txt` (8/8 imported, n8n 2.41.6).

## Live end-to-end (local n8n in Docker)

Proven on the owner's machine against a real n8n 2.41.6 + the real Telegram bot —
evidence in `tests/live-e2e-evidence.txt`:

- A correctly HMAC-signed `order.created` POST → **F1 execution `success`** →
  Arabic Telegram alert delivered to the owner's chat.
- A tampered signature → **F1 execution `error`** (`F1 rejected webhook:
  bad-signature`) → shared **Error Workflow `success`** → failure alert sent.
- The Google Sheets node is skipped via `SHEETS_ENABLED=false` (no credential yet),
  so a missing Google connection can never mark a good alert as failed.

Helpers (all read secrets from the gitignored local files, never print them):
```bash
node scripts/probe-f1-webhook.js           # signed + tampered webhook probes
node scripts/list-n8n-executions.js 8      # recent executions + status
node scripts/cleanup-n8n-api.js --delete-stale --attach-error --activate-all
node scripts/live-e2e-evidence.js          # regenerate the evidence file
```

n8n 2.x maintenance notes (learned the hard way, see DECISIONS):
- `n8n import:workflow` **creates new ids** — re-importing duplicates every flow.
  Clean up first: `node scripts/cleanup-n8n-api.js --delete-stale`.
- A workflow must be **published** before it can be activated or referenced as an
  error workflow, and `publish:workflow --all` was removed — use
  `scripts/n8n-publish.sh` (run with the server stopped).
- Deleting requires archiving first: `POST /rest/workflows/:id/archive`, then DELETE.
- Activation needs the published `versionId` in the POST body.

## What is NOT verified here

- **Telegram is verified live** (2026-10-03/04): bot `@nilad_notify_bot`, token
  valid against `getMe`, chat id auto-read from the owner's `/start`, a real test
  message delivered (`message_id=2`), and F1 order alerts + Error Workflow alerts
  delivered end-to-end (`tests/live-e2e-evidence.txt`). Rotate the token before real
  use — it was pasted in chat once (ASSETS_TODO #4).
- **WooCommerce → n8n webhook delivery** is registered (webhooks #1/#2 point at
  `http://host.docker.internal:5678/webhook/...` with the HMAC secret) and F1 was
  proven with signed payloads posted directly to the webhook; the full
  store→webhook hop still needs a public URL/tunnel or a queue flush in wp-env —
  CLI-created orders only set `pending_delivery` (Phase 5 note in PROBLEMS).
- **Google Sheet rows** need the Google OAuth2 credential in the n8n UI (owner
  login), then `SHEETS_ENABLED=true` + container restart.
- **SMTP emails** (F2/F3/F6) — no credential configured yet.
- **Schedule firing** (F3/F4/F5/F6/F7) — activated but not yet observed on a timer.
Runbook: `runbooks.md`. Owner-facing summary: `../docs/OWNER-BRIEF/05-automation.md`.
