# n8n CONVENTIONS — how every workflow in this folder is built

Read this fully before creating/editing any workflow JSON. Facts below are verified
against n8n docs (docs.n8n.io, fetched 2026-10-03) or n8n source; anything marked
**[ASSUMPTION]** gets proven by the import validation step (`n8n/README.md` §Validate).

## Verified facts (do not deviate)

- **Workflow JSON** requires: `name`, `nodes`, `connections`, `settings` (with
  `"executionOrder": "v1"`), plus optional `pinData: {}`. We also set
  `"settings": { "executionOrder": "v1", "timezone": "Africa/Cairo" }`.
- **Node object**: `{ parameters, id, name, type, typeVersion, position }` — `id` is a
  UUID (generate any stable unique UUID), `position` = `[x, y]` on a 220px grid.
- **connections**: keyed by EXACT source node name → `main` → array of outputs; each
  output is an array of `{ node, type: "main", index: 0 }` (use `null` for an unused
  output slot, e.g. IF false-branch only).
- **Webhook node** `n8n-nodes-base.webhook` typeVersion **1**:
  `httpMethod`, `path`, `responseMode: "onReceived"`, `options: { "rawBody": true }`,
  top-level `webhookId` (UUID). **Raw Body ON is mandatory for HMAC flows** — the raw
  bytes arrive at `item.binary.data.data` (base64, source: Webhook.node.ts), while
  `item.json.body` is the parsed body and `item.json.headers` carries the headers.
- **Code node** `n8n-nodes-base.code` typeVersion **2**, single param `jsCode` (string).
  - `require('crypto')` works only with `NODE_FUNCTION_ALLOW_BUILTIN=crypto` (document
    the env var in the workflow's runbook — compose file sets it).
  - `Buffer` is a Node global — usable **[ASSUMPTION: proven by tests/run-tests.js and
    container execution]**.
  - `$env` reads instance env vars (self-hosted default; `N8N_BLOCK_ENV_ACCESS` not set).
  - `$getWorkflowStaticData('global')` = our idempotency store (persists per workflow).
  - Style: one `//` header comment listing required env vars + what it outputs; early
    returns always return `[{ json: {...} }]`; no `console.log`.
- **IF node** `n8n-nodes-base.if` typeVersion **2** shape for a boolean test:
  ```json
  "parameters": { "conditions": {
      "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose", "version": 2 },
      "conditions": [ { "id": "<uuid>", "leftValue": "={{ $json.ok }}", "rightValue": "",
          "operator": { "type": "boolean", "operation": "true", "singleValue": true } } ],
      "combinator": "and" } }
  ```
  Outputs: `main[0]` = true, `main[1]` = false.
- **Stop And Error** `n8n-nodes-base.stopAndError` typeVersion **1**:
  `{ "errorMessage": "={{ '...' }}" }` — used ONLY for real failures (bad signature,
  misconfig) so the shared Error Workflow fires. **Never** use it for benign skips.
- **No Operation** `n8n-nodes-base.noOp` typeVersion **1**, `parameters: {}` — benign
  branch terminators (e.g. duplicate skipped).
- **Schedule Trigger** `n8n-nodes-base.scheduleTrigger` typeVersion **1**:
  - daily at hour: `{"rule": { "interval": [{ "field": "hours", "triggerAtHour": 9 }] }}`
    (F5 = 09:00 Cairo; workflow timezone Africa/Cairo covers DST-free Egypt) **[ASSUMPTION:
    param name `triggerAtHour` — [ASSUMPTION], import-validate]**.
  - every N hours: `{"rule": { "interval": [{ "field": "hours", "hoursInterval": 3, "triggerAtMinute": 0 }] }}` **[ASSUMPTION]**.
- **Telegram**: we do NOT use the Telegram node. We use **HTTP Request**
  `n8n-nodes-base.httpRequest` typeVersion **4.2**:
  ```json
  "parameters": { "method": "POST",
    "url": "=https://api.telegram.org/bot{{ $env.TELEGRAM_BOT_TOKEN }}/sendMessage",
    "sendBody": true, "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify({ chat_id: $env.TELEGRAM_CHAT_ID, text: $json.tgText, parse_mode: 'HTML' })) }}",
    "options": {} }
  ```
  plus node-level `"retryOnFail": true, "maxTries": 3, "waitBetweenTries": 2000`.
  (No stored credential → owner only fills 2 env vars.)
- **Google Sheets** `n8n-nodes-base.googleSheets` typeVersion **4.5**:
  ```json
  "parameters": { "operation": "append",
    "documentId": { "__rl": true, "value": "={{ $env.GOOGLE_SHEET_ID }}", "mode": "id" },
    "sheetName": { "__rl": true, "value": "={{ $env.GOOGLE_SHEET_GID }}", "mode": "id" },
    "columns": { "mappingMode": "autoMapInputData", "matchingColumns": [], "schema": [] },
    "options": {} },
  "credentials": { "googleSheetsOAuth2Api": { "id": "REPLACE_ON_IMPORT", "name": "Nilad Google Sheet" } }
  ```
  autoMapInputData = "Map Automatically": incoming keys must equal sheet header row.
  **Tab by id, not name:** n8n docs confirm the Sheet selector offers *From list /
  By URL / By ID / By Name*, and that the "sheetId" **is the `#gid=` value** in the
  sheet URL (docs: sheet-operations.md, "Append or Update Row"). F1 therefore uses
  `mode: "id"` + `$env.GOOGLE_SHEET_GID` — a localized tab name ("الصفحة1") is not a
  value we can type reliably, a numeric gid is exact. **[ASSUMPTION: the expression
  is accepted in that field — proven by import validation; actual write needs the
  OAuth credential.]**
- **Error Trigger** `n8n-nodes-base.errorTrigger` typeVersion **1**, `parameters: {}` —
  first node of the shared error workflow.
- **Env vars consumed** (all in `.env.example`): `WOO_WEBHOOK_SECRET`,
  `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_GID`
  (`GOOGLE_SHEET_TAB` only if the tab is selected by name in the UI), `STORE_URL`
  (http://localhost:8888 for the demo), `PENDING_HOURS`, `LOW_STOCK_QTY`,
  `REVIEW_AFTER_DAYS`.

## Rules every flow must follow

1. **One workflow = one job.** Name pattern: `Nilad F<n>: <trigger> → <outcome>`.
2. **Idempotency**: before any side effect, check
   `$getWorkflowStaticData('global')` under a key like `processed:f1:orderId`;
   mark AFTER formatting, BEFORE sends (webhook responds 200 immediately, so there is
   no retry to protect — early marking + failure alerting is the correct trade).
3. **Validation first**: required fields, phone normalized, amounts numeric — reject
   into Stop And Error with a clear Arabic/English message (security/misconfig only)
   or NoOp (benign data skips).
4. **Secrets**: only via `$env.*` / n8n credentials — never literal strings in nodes.
5. **PII**: phone/name allowed ONLY in F1 Telegram (owner's private chat), F2 customer
   email, F6 review email, and Sheet rows. Error workflow + F7 mention order id only.
6. **jsCode must be pure & self-contained** (inputs via `$input`/`$env`/static data) so
   `tests/run-tests.js` can extract it and execute it — keep ALL branch logic that has
   a test in Code nodes, not in opaque node params.
7. **HTML-escape** any user-controlled text before `parse_mode: 'HTML'` Telegram sends
   (write an `esc()` helper in the Format Code node).
8. **Positions**: x grid `-160, 60, 280, 500, 720, 940, 1160…`, y `0` main line,
   `220` failure/skip branches.
9. Every flow JSON: `"pinData": {}`, unique UUIDs (any), English node names (Arabic
   lives in message content), ≤ 9 nodes.

## Test harness contract (tests/run-tests.js)

- Loads a workflow JSON by path, finds a Code node by name, evaluates its `jsCode`
  with shims: `($input, $env, $getWorkflowStaticData, require)`.
- Fixtures pin raw JSON strings + HMAC signatures computed with the test secret
  `test-secret-do-not-use-prod`.
- A flow is "tested" when: happy path asserts its outputs; duplicate/missing-field/
  bad-signature cases behave per its CONVENTIONS duties; `node tests/run-tests.js`
  exits 0.

## Runbook template (n8n/runbooks.md, one section per flow)

```
### F<n> <name>
- Trigger / Schedule:
- Steps (node list in order):
- Idempotency key:
- Failure path (what the owner sees):
- Env/credentials required:
- How to pause: toggle workflow off in n8n UI
- Test: which fixture cases prove it (command)
```

## Lessons applied (Phase 5 build + live run, 2026-10-03/04)

Verified against n8n 2.41.6 — both by the import/`87/87` test run **and by a live
local instance** (`tests/live-e2e-evidence.txt`). Treat these as facts:

- **`$env` is blocked by default — in Code nodes too** (`access to env vars
  denied`). The gate is `process.env.N8N_BLOCK_ENV_ACCESS_IN_NODE !== 'false'`, so
  the value must be exactly `false` (n8n 2.41). Docker note: `docker restart` does
  **not** re-read `--env-file` — the container must be recreated after adding it.
- **Telegram credentials travel through the item, never through expressions.** The
  Format/Code node resolves `$env.TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` once and
  adds `tgToken` / `tgChatId`; the HTTP node uses
  `=https://api.telegram.org/bot{{ $json.tgToken }}/sendMessage` and
  `{{ JSON.stringify({ chat_id: $json.tgChatId, ... }) }}`.
- **F3's Telegram node was rewired** to be fed by the IF branch instead of sitting
  after `emailSend` (email nodes replace item JSON → credentials would be lost).
- **The Google Sheets node is gated** behind `Sheet log enabled?`
  (`SHEETS_ENABLED`, default false) → a missing credential can never mark a good
  order alert as a failed execution.
- **Sheet tab is selected by gid** (`GOOGLE_SHEET_GID` = the `#gid=` value, node
  `sheetName.mode = "id"`) — locale-proof, unlike an Arabic tab name.
- n8n 2.x lifecycle: import creates **new ids** (re-import duplicates flows);
  publish is required before activate / error-workhook attach (`--all` removed →
  `scripts/n8n-publish.sh`); delete needs `POST /:id/archive` first; activation
  needs `{"versionId": …}` in the body; an error workflow must itself be published
  and active. Helper: `scripts/cleanup-n8n-api.js` (+ `n8n-publish.sh`).
- **WooCommerce only fires webhooks inside Store API/REST requests.** A CLI-created
  order (`wc_create_order`) sets `pending_delivery = 1` and waits for the async
  queue, which does not run in wp-env's CLI context — so CLI orders never reached
  n8n. Use a real checkout (browser/Store API) to prove the store→webhook hop.
- **HTTP/email nodes REPLACE the item JSON** with their API response. Anything a
  later node must read (`orderId`, dedupe key…, or now `tgToken`) has to be written
  **before** the send or fetched with a cross-node reference.
- **Idempotency keys per flow** (actual values shipped): `f1:<id>`,
  `f2:<id>:<status>`, `f3:<id>`, `f4:<id>:<qty>`, `f5:<YYYY-MM-DD>`, `f6:<id>`;
  caps: 500 (F5 100). Stored in `global.keys` / `global.processed`.
- **F7 health = three paths into Evaluate**: 2xx/3xx → healthy NoOp; 4xx/5xx
  kept as data (`fullResponse: true` + `neverError: true`); connection errors /
  timeouts flattened by `onError: "continueRegularOutput"`. All failures end in
  `Stop And Error` → shared Error Workflow.
- **Import validation runs in a one-shot container** (a running server holds the
  SQLite lock → `SQLITE_BUSY`); pinned image digest recorded in
  `n8n/tests/import-evidence.txt`.
- **Parallel authoring**: one agent per flow writing only its own
  `fN-*.json` + `tests/cases/fN.cases.js` worked; the harness auto-loads
  `tests/cases/*.cases.js`. Always verify the agent actually created its files
  before trusting the report (F6 agent returned empty → rebuilt manually).
