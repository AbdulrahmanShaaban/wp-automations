# Runbooks — Nilad Order Ops Suite

Operations guide, one section per flow. Message wording sections are the texts
the owner must **approve before go-live** (Brief P2 acceptance).

Shared conventions (see `CONVENTIONS.md`):

- Idempotency keys live in n8n workflow static data (`sd.keys` / `sd.processed`,
  capped). They survive restarts but NOT an n8n DB wipe — re-import wipes them
  (harmless: worst case one duplicate message per item).
- **Mark-before-send**: every flow writes its idempotency key BEFORE the external
  send (email/Telegram). Reason: n8n HTTP/email nodes replace the item JSON with
  their API response, so any node after them can no longer read `orderId` — and
  at-most-once beats double-messaging customers.
- Secrets come from `$env` / credentials only. If `WOO_WEBHOOK_SECRET` is unset,
  webhooks are rejected fail-closed (`server-misconfig`).
- All failures route to the shared Error Workflow (after you attach it — see
  README step 1).

---

## F1 — new order → Telegram + Sheet

**Trigger:** WooCommerce webhook `order.created` → `POST /woo-order-created`.
**Path:** Verify HMAC (fail-closed) → dup (`f1:<id>`) → Format → Telegram + Sheets append (parallel, retry ×3).

**Expected owner message (approve wording):**
```
🛍 طلب جديد #50
👤 منى أحمد
📱 +201012345678 ✅
📦
  • عباية كتان مطرّزة ×1
💰 1310 ج.م — القاهرة
🧾 processing · الدفع عند الاستلام
```
- Sheet headers: `orderId,total,city,phone,status,createdAt` (the extra `tgText`
  field is ignored by autoMap — [ASSUMPTION] validated only at first live run).

**Common failures →** `bad-signature` (secret mismatch), `no-raw-body` (Raw Body
option off), `missing-order-id`. Each stops the run and fires the Error Workflow.

**Checks:** n8n Executions list shows the run green; row appears in the Sheet;
Telegram message arrives. Test from the store: create a test order.

---

## F2 — status update → customer email

**Trigger:** webhook `order.updated` → `POST /woo-order-updated`.
**Path:** Verify → status ∈ {processing, completed, shipped} → dup (`f2:<id>:<status>`) → Format → **Mark** → email (if address present) or NoOp.

**Expected customer email (approve wording):**
- Subject: `حالة طلبك #50 تغيّرت`
- Body includes: greeting, status line (`طلبك قيد التجهيز` /
  `تم تسليم/اكتمل طلبك` / `طلبك في الطريق إليك`), order number, total, status,
  `شكراً لتسوقك من نيلاد.`

**Notes:** other statuses (pending, cancelled, refunded) are ignored by design.
Mark runs before the send (at-most-once) — a failed SMTP send will NOT retry on
webhook replay; check the Error Workflow alert and resend manually if needed.

---

## F3 — pending-order recovery (every 3 h)

**Path:** fetch `status=pending` → keep older than `PENDING_HOURS` (default 48)
and not already reminded (`f3:<id>`) → Format → **Mark** → reminder email (if
address) → owner Telegram line.

**Expected owner line (approve wording):**
```
🕓 طلب معلق قديم #50 — منى أحمد — 1310 ج.م — منذ 72 ساعة
```
**Stop-if-paid:** enforced twice — the query only fetches `pending`, and any
order that changed status since is filtered by `status !== 'pending'`. A reminder
already sent for a since-paid order is possible within the 3 h window (accepted;
wording explicitly says "confirm or it will be cancelled").

---

## F4 — low stock (daily 08:00)

Keeps products with `manage_stock` and `stock_quantity ≤ LOW_STOCK_QTY`
(default 5). One message per day listing all hits; a product+qty pair is alerted
once (`f4:<id>:<qty>`) — restock then sell back below the threshold re-alerts.

**Expected owner message (approve wording):**
```
تنبيه: مخزون منخفض
• عباية كتان مطرّزة — المتبقي: 3
• تي شيرت قطن — المتبقي: 0
```

---

## F5 — daily summary (09:00 Cairo)

Aggregates yesterday's orders: count, revenue (pending/processing/on-hold/
completed only — cancelled/failed/refunded excluded from revenue but shown in
byStatus), pending count, top product. Duplicate runs the same day are dropped
(`f5:<YYYY-MM-DD>`).

**Expected owner message (approve wording):**
```
📊 ملخص يومي 2026-10-02
الطلبات: 3
الإيراد: 300 ج.م
المعلقة: 1
الأكثر مبيعًا: عباية كتان مطرّزة (2)
processing: 2
completed: 1
```
Zero-order days still send (proves the schedule is alive).

---

## F6 — review request (daily 10:00)

Completed orders whose `date_completed` is older than `REVIEW_AFTER_DAYS`
(default 5), have an email + a line item with `product_id`, and were never asked
(`f6:<id>`). Mark runs before the send.

**Expected customer email (approve wording):**
- Subject: `رأيك في «عباية كتان مطرّزة» يهمنا`
- Body: thanks + order number, one-line ask, product link
  `http://localhost:8888/?p=38` (store URL from `STORE_URL`), sign-off
  `فريق نيلاد`.

---

## F7 — site health (hourly) + shared Error Workflow

**Healthy:** HTTP 200–399 → NoOp, run green.
**Unhealthy:** HTTP ≥400 (`neverError` keeps the response), timeout/connection
error (`onError: continueRegularOutput`) → Code marks `healthy=false` →
`Stop And Error: Site down: …` → **Error Workflow** messages the owner:
```
⚠️ n8n: تنبيه فشل
الواجهة/Workflow: Nilad F7: site up check
العقدة/node: Site down → error workflow
التنفيذ/execution: 123
السبب: http-500
```
Emails/phones inside error text are scrubbed (`[email]`, `[phone]`); stack traces
never sent.

**Attach the Error Workflow** to F1–F7 (manual, ids exist only after import):
each workflow → `⋯` → Settings → Error workflow → *Nilad: error → owner alert*.

---

## Escalation / failure policy

| Symptom | First look |
|---|---|
| Webhook runs fail instantly with `bad-signature` | Compare Woo webhook secret vs `WOO_WEBHOOK_SECRET` |
| No runs at all | Workflow inactive? Webhook URL/tunnel reachable? |
| Telegram 401/403 | Bot token or chat id (bot must be started with `/start`) |
| Sheet errors | Google credential re-auth; `GOOGLE_SHEET_ID`/`TAB` |
| SMTP failures | Credential validity; check Error Workflow alert |
| Duplicate messages after re-import | Static data was wiped — expected once; keys rebuild on next runs |
| Config mistakes before go-live | `node n8n/check-live.js` (validates env without n8n) |

Live screenshots of all of the above = **owner-credential-blocked** (ASSETS_TODO
#4/#5 + SMTP) → recorded NOT VERIFIED until tokens exist.
