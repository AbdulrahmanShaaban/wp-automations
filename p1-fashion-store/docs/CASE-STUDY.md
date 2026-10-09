# Case study — نيلاد / Nilad: an Arabic-first WooCommerce store with order automation

**Type:** e-commerce + automation demo · **Stack:** WordPress 7.1.2 (block theme), WooCommerce 11.1.2, PHP 8.3, n8n 2.41.6, Docker (wp-env) · **Market:** Egypt · **Language:** Arabic-first, RTL

---

## The problem

An Egyptian fashion/accessories brand selling online faces three things a template can't solve:

1. **The storefront must feel Egyptian, not translated.** Arabic RTL layout, Egyptian governorate shipping with real prices, cash on delivery as the default expectation, and Arabic order emails that carry the brand.
2. **A bad phone number kills the sale.** One wrong digit and the courier can't deliver — and a garbage phone number in the order table makes the order uncancellable. Validation has to happen where it can't be bypassed.
3. **The work after the order is what kills small stores.** Watching for new orders, chasing status changes, remembering to follow up on abandoned carts, noticing stockouts, and finding out the site is down only when a customer complains.

This project builds the store *and* the after-the-order system, and then measures both.

---

## What was built

### The store
- **Block theme** (`nilad-theme`) built from an owner-approved design: one primary CTA, pill buttons, approved palette, `prefers-reduced-motion` respected, mobile-first (bottom action dock at <900px).
- **Egyptian commerce:** two shipping zones (Cairo/Giza flat 60 EGP, rest of Egypt flat 90 EGP, free over 1,500 EGP), COD + bank transfer live, official **Paymob** plugin installed and ready for the owner's test keys.
- **Phone validation at the Store API** — one chokepoint that every client (block checkout, classic, REST) goes through, with an Arabic 400 message: `رقم الموبايل غير صحيح. مثال: 01012345678`. Accepts `+20` / `0020` / spaces / dashes; stores the canonical `01XXXXXXXXX`.
- **Branded Arabic order emails** captured locally (`نيلاد <orders@nilad.example.com>`) so the email path is demonstrable without an MTA.

### The automation suite (n8n, 7 flows + a shared error workflow)
| Flow | Trigger | What it does |
|---|---|---|
| F1 | `order.created` webhook (HMAC) | Arabic Telegram alert to the owner + a row in a Google Sheet |
| F2 | `order.updated` webhook | Arabic status email to the customer (processing / shipped / completed), once per status |
| F3 | every 3 h | Finds pending orders older than `PENDING_HOURS`, reminds the customer, alerts the owner, **stops if the order was paid in the meantime** |
| F4 | daily 08:00 | Low-stock alert (products at or below `LOW_STOCK_QTY`) |
| F5 | daily 09:00 | Yesterday's summary: count, revenue, pending, top product |
| F6 | daily 10:00 | Review request 5 days after a completed order, with the product link |
| F7 | hourly | Store health check; failure → shared Error Workflow alerts the owner with workflow + node + execution id |

Design decisions that matter more than the feature list:
- **HMAC verification on every webhook** (fail-closed: no signature = rejected).
- **Idempotency keyed on order id (+ status/event)** — a replayed webhook cannot double-message a customer.
- **Mark-before-send**: the dedupe key is written *before* the external send, because at-most-once beats double-messaging (the failure mode is a manual resend the owner sees in the alert).
- **PII discipline**: customer name/phone appear only in the owner's private Telegram chat, the Sheet, and the customer's own email. Error alerts carry the order id only, with emails/phones scrubbed.
- **One shared Error Workflow**, attached to all seven flows — failures are reported once, in Arabic, with a link to the execution.

---

## How it was verified (not "it works")

| Layer | Tool | Result |
|---|---|---|
| Business logic | 87 assertions executing the **actual `jsCode` embedded in the shipped workflow JSONs** | **87/87 pass** — happy, duplicate, missing field, bad signature, phone variants, PII scrub, aggregation math |
| Import validity | real n8n 2.41.6, one-shot container | **8/8 workflows imported** |
| **Live end-to-end** | real n8n + real Telegram bot | signed webhook → F1 **success** + Arabic alert delivered; tampered signature → F1 **error** → Error Workflow **success** → alert delivered |
| Store behavior | Puppeteer e2e (real browser checkout) | **9/9 pass** — free-shipping notice both sides, Cairo 60 / Sohag 90 / free-over-threshold, invalid phone blocked with the Arabic banner, COD order received |
| Commerce data | CLI assertions on a real order | order #50: canonical phone `01012345678`, EGC / القاهرة / 11511, total 1,310 EGP, Arabic mail log with branded From |
| Project health | `scripts/verify.sh` | **ALL PASS** (WP/Woo/theme/pages/currency/render/PHP lint/commerce/n8n tests) |
| Accessibility | axe-core, WCAG 2.1 A/AA + best-practice, 390px | **0 violations** on home/shop/product/contact; **0** touch targets under 24px anywhere |
| SEO | 15 checks/page × 6 pages | **15/15 on every page** (description, OG, canonical, JSON-LD, one h1, lang/dir, alt text) |
| Security | 9 checks/page × 6 pages | **9/9 on every page** (nosniff, frame-options, referrer-policy, permissions-policy, no PHP errors, no path leaks) |
| Performance | Lighthouse mobile | accessibility **100**, best-practices 96–100; performance **environment-bound** (see below) |

**On performance, honestly:** the throttled Lighthouse performance score ranges 6–92 on this machine because PHP serves WordPress from a Windows bind mount inside Docker, where every file stat costs ~8–10ms. It is not the storefront: the database answers a full product query in **0.075s** and the homepage is **17KB compressed**. The report states the production expectation (TTFB ~200–400ms on normal hosting) as **[UNVERIFIED]** — a deployment item, not a claim.

---

## Engineering decisions worth arguing about

- **Seed as code, not a database dump.** The whole store rebuilds from zero with `bash scripts/reset.sh` (destroy → start → seed → verify) in ~15 minutes, and the seed is a single wp-cli boot (~50s instead of 40+ minutes). There is no `.sql` file to keep in sync and nothing customer-specific to leak.
- **Presentation stays in templates, business logic stays in a plugin.** `nilad-core` holds shipping/phone/email/SEO/hardening; `nilad-theme` holds markup. No WooCommerce core edits, so updates don't wipe the work.
- **On-demand block registration.** WooCommerce's eager block registration cost 3.5–5s per frontend request on this filesystem; it is now registered only when a WooCommerce block actually renders.
- **Secrets never live in nodes.** All credentials come from `$env`; the Telegram token is resolved inside a Code node and handed to the HTTP node through the item, so no secret appears in a node parameter, an export, or a screenshot.
- **QA measures the right page.** An empty cart makes `/checkout/` redirect to `/cart/`, which initially hid three real accessibility bugs on the most important page in the store. The harness now seeds a cart through the Store API first.
- **Upstream defects are documented, not hacked.** Two serious axe findings live in WooCommerce's client-rendered checkout. A DOM patch would fight React's re-renders, so they are recorded as upstream with the reasoning, instead of shipping a fragile workaround.

---

## What a client gets

- A store that **sells** in their market: real shipping zones, the payment methods Egyptians actually use, a phone number that always reaches the courier, and order emails in Arabic.
- Automation that **works after the order**: new-order alerts, status emails, abandoned-cart recovery, low-stock warnings, a daily digest, review requests, and downtime alerts — with a shared error path so nothing fails silently.
- Evidence instead of adjectives: a QA report with measured numbers, a live end-to-end proof of the automation, a 9/9 browser checkout test, and an honest problem log.

**Not included in the demo (owner-supplied on go-live):** Paymob live test keys, Google Sheets OAuth credential, SMTP account, domain/hosting. The Telegram bot and Sheet are wired and verified; the remaining credentials are listed in `docs/ASSETS_TODO.md`.
