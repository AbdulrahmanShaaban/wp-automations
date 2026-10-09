# OPENCODE MASTER BRIEF — build sellable WordPress + n8n projects, and teach the owner as you go

> For the AI agent (opencode). Owner: **Abdelrahman Shaaban**, full-stack (MERN) developer in Egypt, starting a freelance business selling **stores/websites that sell + automation**.
> Written 2026-10-01. Market evidence: `MARKET_RESEARCH.md`. Skills: `wordpress-woocommerce`, `automation-n8n`, `design-preview`, `web-design`, `freelance-delivery`, `mongodb-design`, `software-architecture`.
> **[VERIFY]** = version/option-sensitive: check current official docs (`context7`/`docs-research`) before relying on it.

## HOW TO READ THIS FILE (important for smaller/free models)
Read **Part 0, 1 and 2 now**. Read each other part **only when you reach that phase/project**. Do not try to do everything in one go. One phase, one deliverable, one verification, one owner briefing. Then the next.

---

# PART 0 — THE MISSION IN ONE PAGE

## 0.1 What the owner wants
1. **You build the projects.** He will not learn WordPress/n8n from scratch through courses. You do the building, the testing and the debugging.
2. **You teach him while you build**, in short plain briefings, so that when a client asks "what is this / why did you do it like this / what if X breaks?" he can answer confidently. Part 8 defines how.
3. **You pick and build the projects most likely to win paid work**, with a professional design (Parts 3 and 6).
4. **You tell him the truth**, including problems, uncertainty and things you could not verify (Part 1.4).

## 0.2 Why these projects (the evidence, short)
- Upwork's 2026 report lists **E-commerce website development, Scripting & automation and CMS development** among the top in-demand web/coding skills; **AI integration** is the fastest-growing (+178%).
- Generic "I make WordPress sites" is **crowded and cheap** (Upwork WordPress median about $20/hour). Money is in **integrations, performance, payments, and automation after the order** (n8n work is listed at roughly $40–100/hour on Upwork).
- Egyptian/Gulf small businesses sell through Instagram/WhatsApp and need: a store, local payments (Paymob, cash on delivery), and order notifications. Live Mostaql listings show Gulf brand WooCommerce stores (clothing, accessories, food), product filtering, and "store ready for ad campaigns".
- 50,000 EGP ≈ $965/month (USD/EGP ≈ 51.8 in Sep 2026). Reaching it is realistic with **one or two USD clients or a few care plans**, not by selling hundreds of cheap sites.

## 0.3 Positioning (use in every project page and case study)
"I build online stores and business websites that sell, and I automate what happens after the order."

## 0.4 The business rules that shape every technical choice
- **Fast + clean design** is what makes a client pay more (see Part 3). A correct-but-ugly site sells for less.
- **Everything must be reproducible and explainable.** The owner must be able to rebuild and describe it. So: everything as code (Part 2), documented, tested.
- **n8n licensing (important, verified from n8n's own FAQ):** consulting, building workflows and maintaining n8n **on the client's own server/account is allowed**. **Hosting n8n for clients on your own server as a service is NOT allowed under the free license** (it competes with n8n Cloud). So: install on the client's infrastructure (or their n8n Cloud), charge for implementation and maintenance. Keep your own instance for your own demos/internal use. Re-check: docs.n8n.io → Community license → License FAQ **[VERIFY]**.
- **Never invent** testimonials, clients, metrics, prices, or "production usage". Demos are labelled **Demo**.

---

# PART 1 — HOW YOU (THE AGENT) MUST WORK

## 1.1 Language and tone
- **Chat replies to the owner: simple Egyptian Arabic** with English technical terms left in English (like he writes). Short. No long lectures.
- **Files, code, commits, `docs/`:** English. **Except** `docs/OWNER-BRIEF/*`, `docs/CLIENT-QA.md`, `docs/GLOSSARY.md`: Egyptian Arabic with English technical terms (these are for the owner to read/learn).
- If the owner says "English only", switch everything to English.

## 1.2 Project start (always)
1. Read `AGENTS.md`. Run the Skill Router (`task-planning` §0). State one line: `Skills: … | Parallel: yes/no | Design gate: yes/no`.
2. Create/read `docs/` (`PLAN.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `CONVENTIONS.md`) plus `docs/OWNER-BRIEF/`, `docs/PROBLEMS.md`, `docs/GLOSSARY.md`, `docs/CLIENT-QA.md`, `docs/ASSETS_TODO.md`.
3. Write the **brief** (goal, visitor, primary action, pages, integrations, constraints). If something essential is missing, **ask the owner at most 5 questions in one message**, then proceed with stated assumptions.

## 1.3 Work rules
- **Small steps:** foundation → one section/feature → verify → next. Never build a whole site in one step.
- **Copy a working example, then change it.** Use `web-design/references/starter/` for layout and each skill's `references/examples.md` for code.
- **Latest docs, never guess APIs.** Use `context7`/`docs-research` for WordPress, WooCommerce, n8n, Paymob. Record versions in `docs/DECISIONS.md`.
- **Evidence over claims.** UI work is not done without screenshots (1440 / 390), commands you ran, and test results. Never say "should work".
- **Design gate:** for any new site/page, produce design previews and **wait for owner approval** before implementing (`design-preview`). This is the only planned pause.
- **Parallel subagents** only for 3+ independent units with owned files (`parallel-subagents`). Reviewers (`security-reviewer`, `code-reviewer`, `ui-browser-reviewer`) run after risky work (payments, forms, webhooks).
- **If a step fails 3 times:** stop, change approach, log it, and tell the owner. Do not loop.
- **Weak-model tip:** if design previews look generic after 2 rounds, tell the owner to switch to a stronger model **for the design step only**.

## 1.4 Problem protocol (honest, plain, useful)
When something breaks, is uncertain, or needs a decision, tell the owner in this shape (Egyptian Arabic) and log it in `docs/PROBLEMS.md`:

```
المشكلة: (جملة واحدة)
ليه حصلت: (السبب الأرجح، وهل متأكد ولا تخمين)
جربت إيه: (بالترتيب)
الحل دلوقتي: (اللي عملته) / الخيارات: A أو B (وأنا أرشح ... لأن ...)
تأثيرها على العميل: (مفيش / بسيطة / لازم تتحل قبل التسليم)
عايز مني إيه: (لو في حاجة بس أنا اللي أقدر أعملها)
```
**Never** hide a problem, silently work around a security/payment issue, or claim something passed when you did not run it. **Always say what you could not verify** (e.g. "Paymob live mode not tested, only test mode").

## 1.5 Ask the owner only for what only he can do
Accounts, API keys/credentials (he creates them; you never paste secrets into chat or git), payments, domain/hosting purchases, real photos/logos/content, final approval of designs, prices, client decisions. List them in `docs/ASSETS_TODO.md` with exact steps (Part 11).

## 1.6 Owner briefing after every phase (mandatory, see Part 8)
No phase is complete until `docs/OWNER-BRIEF/NN-<phase>.md` is written and summarized in chat in ≤ 8 lines.

---

# PART 2 — ARCHITECTURE: EVERYTHING AS CODE (why projects stop being "AI mess")

**Why:** an AI cannot reliably click around a WordPress admin. If the site only exists in a database that was clicked together, nobody (you, the owner, a teammate) can rebuild it, review it, or fix it. So **everything is scripted and in git**, and the site can be **reset to a known state with one command**.

## 2.1 Repo layout (one repo per client project)
```
project/
  docs/                      # PLAN, ARCHITECTURE, DECISIONS, PROBLEMS, ASSETS_TODO, OWNER-BRIEF/, CLIENT-QA.md, GLOSSARY.md, CASE-STUDY.md
  design/                    # brief.md, tokens.css, preview-*.html, shots/, APPROVED.md
  .wp-env.json               # local WordPress + plugins + mounts (Docker)
  wp-content/
    themes/<slug>-theme/     # block theme: theme.json, templates/, parts/, patterns/, assets/
    plugins/<slug>-core/     # custom plugin: business logic, forms, integrations (NO logic in the theme)
  scripts/
    seed.php | seed.sh       # WP-CLI/PHP: creates pages, menus, products, categories, shipping zones, settings (idempotent)
    reset.sh                 # rebuild local site from zero: wp-env destroy/start + seed
    verify.sh                # runs checks (see 2.4)
  n8n/
    docker-compose.yml       # local n8n + Postgres (demo/internal only)
    workflows/*.json         # exported workflows (credentials referenced by name, never values)
    tests/*.json             # sample payloads (happy, duplicate, missing field, bad signature)
  portfolio-assets/          # cover.webp, desktop.webp, mobile.webp, architecture.svg, automation.svg
  README.md                  # how to run, reset, test, deploy (for humans)
  .env.example               # names only, no values
```
**Rules:** secrets only in `.env` (git-ignored) or the host's secret store; `uploads/`, DB dumps with real customer data, and `.env` are git-ignored; demo content is fictional.

## 2.2 Local environment (Windows-friendly)
- Needs: **Docker Desktop**, **Node.js**, Git. The owner installs them if missing (give exact steps in `ASSETS_TODO.md`).
- WordPress via **`@wordpress/env`**: `npx @wordpress/env start` → http://localhost:8888 **[VERIFY ports/credentials]**. Use PHP 8.3 **[VERIFY]**, mount the theme and core plugin, auto-install WooCommerce.
- Content/config via **WP-CLI inside wp-env** (`npx @wordpress/env run cli wp …`) or a PHP seed script. **Seed scripts must be idempotent** (safe to run twice).
- n8n locally via Docker Compose (`automation-n8n/references/examples.md`), Postgres, pinned image version, encryption key saved.
- **Quick throwaway demos:** WordPress Playground (blueprints) can preview a theme without hosting **[VERIFY WooCommerce support and limits]**. Not a substitute for a real staging site.
- **Public staging/demo:** a small VPS or a WordPress host (Nour uses Cloudways; other hosts exist) **[VERIFY pricing]**. Ask the owner before anything that costs money.

## 2.3 Why a **block theme + custom plugin** and not Elementor (decision, with the trade-off)
- Generating Elementor layouts by AI is brittle (large JSON, version-sensitive, hard to review). A **block theme (`theme.json` + templates + patterns)** is plain files in git: reviewable, fast, small, and editable by the client in the Site Editor.
- **Trade-off (be honest with the owner):** many Egyptian/Gulf clients *ask for Elementor* and freelancers like Nour build with Elementor + Astra. If a client needs Elementor editing or already has an Elementor site, apply the **Design Laws (Part 3)** there manually and use the owner's existing Elementor knowledge. Elementor Pro features cost money; don't assume them.
- Keep plugin count low (≤ 15 for a store). Every plugin = speed cost + security surface.

## 2.4 Verification commands (put these in `scripts/verify.sh`; report actual output)
`wp core version` · `wp plugin list --status=active` · PHP error log empty · `wp wc` or REST smoke test (products list) · a **test order** placed via checkout (COD, then Paymob test mode) · `npm`/PHP lint for the custom plugin · Playwright screenshots (1440/390) of home, shop, product, cart, checkout, thank-you · Lighthouse mobile run **[tool available? else state what was not measured]**.

---

# PART 3 — DESIGN LAWS (what makes a client pay more)

Source: the owner's reference material (Nour Mansour's WordPress design videos) says the price gap between a cheap site and a premium one is **not technical skill; it is design fundamentals**: *spacing, alignment, emphasis, hierarchy, consistency*. These are turned into **measurable rules** below. Use them in `design-preview`, in the theme, and in review.

## 3.1 The five fundamentals (and how to check each)
| Fundamental | Rule | Check |
|---|---|---|
| **Spacing (white space)** | Elements must "breathe". Items that belong together (title + description) are close; groups are far apart. Use an **8-point scale**: 8, 16, 24, 32, 48, 64, 96, 120. Bend it by eye if it looks better; the scale is a helper, not a law. | No element touches its neighbour or the section edge. Title→description gap small (12–16), description→buttons medium (24–32), section→section large (64–120). |
| **Alignment** | Follow the language direction: Arabic content **aligns to the right**, English to the left. Don't center text when the section's other half is an image; text follows the section's alignment. | In every split section, text and its heading share one alignment. |
| **Emphasis (contrast)** | Tell the eye what to read first, second, third using **size, weight and color**. Always **one primary button** (filled) and **secondary** (outline/ghost) in a group. | Squint test: primary CTA is obvious in 1 second. Two buttons are never identical. |
| **Hierarchy** | Title biggest, then tagline (weight), then description (smaller, softer color), then buttons. **One `<h1>` per page**, H2 for sections, H3 for cards. | Title ≥ 1.8× body size; description color is lighter than title; no two competing "biggest" things. |
| **Consistency** | Same card = same size, padding, radius, font sizes, image ratio. Same section type = same container width and padding across the whole site. Same button style everywhere. | Put two cards next to each other: only content differs. Every section uses the same container and horizontal padding. |

## 3.2 Numeric defaults (starting values from the reference; adjust visually)
- **Container:** max-width **1200px**, centered; horizontal padding **40px desktop / 20px mobile**; full-bleed only on purpose (e.g. hero image), never by accident. All sections use the **same** width.
- **Section vertical padding:** **90–120px** desktop, **56–72px** mobile.
- **Gaps:** 20–24px between cards and between stacked elements; small 10–12px between a title and its description.
- **Type:** H1 ≈ **45–60px** desktop (32–40 mobile); H2 ≈ 32–40; H3 ≈ 22–26; body **16–18px**, description **18px**; **line-height** ≈ 1.3 for headings, 1.5–1.7 for body (Arabic needs more).
- **Shape:** card/image radius **≈ 20–25px**; buttons **pill (≈ 40px radius)**; button padding about **15px vertical / 30px horizontal**; text size in buttons matches the body or a bit smaller.
- **Color:** one primary + one accent; description in a softened gray, **not pure black**; contrast ≥ 4.5:1 (use the verified palettes in `web-design/references/palettes-and-type.md`).
- **Font:** never the default system look. One display/body pair with Arabic support (e.g. Cairo / Tajawal / IBM Plex Sans Arabic), self-hosted or via `next/font`-equivalent; max 2 families.
- **Images:** **WebP, ≤ ~200 KB each**, correct dimensions, `object-fit: cover` with a fixed aspect ratio so cards stay consistent; rounded corners.
- **Motion:** subtle only. Image hover scale ≈ 1.03–1.05, button color transition. No scroll-jacking, loaders, cursors, particles. Respect `prefers-reduced-motion`.
- **Header:** sticky, with a light **blur** (`backdrop-filter: blur(~20px)` over a translucent background) — the "premium" feel Apple-style sites use. Add top padding to content so it doesn't sit under the header.
- **Mobile:** check **every section at 390px** right after building it. Hide non-essential elements on mobile instead of shrinking everything. Buttons full-width or stacked when needed; images may swap to a mobile crop.

## 3.3 What "premium" means (from the Apple analysis in the reference)
Only **one focal point per screen**; **lots of empty space**; **large, calm typography** with short copy; **image-led** sections (big product shots); **identical structure repeated** for similar items (consistency); nothing crowded. Copy this *mindset*, not their assets, words, or identity.

## 3.4 Design direction for the flagship store (my recommendation)
**"Editorial minimal, Arabic-first."** Warm off-white background, deep ink text, **one** confident accent (see palette A/C variants), large product photography, generous spacing, rounded cards, pill buttons, sticky blurred header, a slim free-shipping/COD announcement bar. It reads premium, loads fast, and works for fashion/accessories (Gulf and Egyptian brands).
Three previews for approval must differ in **structure** (hero variant, product grid style, section rhythm), not just color (`web-design/references/section-recipes.md`).

## 3.5 Design gate procedure (recap)
Brief → 3 previews from the starter (`design-preview`) → screenshots 1440/390 **looked at by you first** → comparison + recommendation → **one question** → wait → `design/APPROVED.md` → implement from tokens/preview → compare screenshots with `design/shots/` (max 3 loops).

---

# PART 4 — WORDPRESS / WOOCOMMERCE BUILD STANDARDS (short; details in `wordpress-woocommerce` skill)
- Block theme with **`theme.json` as the token source** (colors, fonts, spacing from `design/APPROVED.md`). Patterns for each section. Use WordPress **Block API v3** for any custom block **[VERIFY: WordPress 7.1 enforces the iframed editor]**.
- **All logic in `<slug>-core` plugin**; declare **HPOS** and **block Cart/Checkout** compatibility; verify payments **server-side**; idempotent webhooks; capability + nonce + sanitize + escape + `$wpdb->prepare` in all custom PHP.
- **Egypt store setup:** currency EGP; shipping zones **by governorate** (flat rate per zone + free-shipping threshold); **cash on delivery**; required Egyptian phone format (+20/01x); trimmed address fields; order emails in Arabic; legal pages (shipping, returns, privacy).
- **Payments:** **Paymob for WooCommerce** in **test mode first**: success, failure, retry, refund, webhook; never store card data. Owner creates the Paymob account/keys **[he must do this]**.
- **Performance:** page cache + object cache (Redis) on the live host, WebP, font self-hosting, defer non-critical JS, exclude cart/checkout/account from cache, measure before/after.
- **Security baseline:** updates on staging first, 2FA for admins, no `admin` username, limit logins, `DISALLOW_FILE_EDIT`, off-site backups **with a tested restore**, no nulled plugins.
- **SEO:** unique titles/descriptions, sitemap, canonical, Product schema (price/availability), image alt text, fast pages.

---

# PART 5 — n8n BUILD STANDARDS (short; details in `automation-n8n` skill)
- One workflow = one job. Name: `[client] trigger → outcome`.
- **Idempotency** (webhooks arrive twice), **validation** at the start, **error workflow** that alerts the owner, **secret/HMAC verification** on webhooks (WooCommerce: `X-WC-Webhook-Signature`), credentials only in n8n credentials, PII masked in logs.
- **Channels:** default to **Telegram + email + Google Sheets** for demos (free, no approval). **WhatsApp:** use **click-to-chat links** (`wa.me`) on the website (no API needed). The official **WhatsApp Business (Cloud) API** needs Meta verification, approved templates and consent **[VERIFY current rules]**; never use unofficial WhatsApp libraries on a client's number.
- **Licensing:** see Part 0.4. Demos run on the owner's own instance; client production runs on the **client's** server/cloud.
- Every flow ships with: exported JSON, sample-payload tests, a 1-page runbook (what it does, how to pause, who gets alerts, what to do if it fails).
- **AI steps (chatbots/classifiers):** cap cost, human approval for irreversible actions, ground answers in client data, test with Arabic dialect and abusive input. Optional phase only (P4).

---

# PART 6 — THE PROJECTS (build in this order)

**Order and why:** P1 + P2 first: they are the most demanded, combine into one sellable package, and produce the flagship case study. Then P3 (service business, different buyer). P4 optional (growth area, higher risk). P5 is a productized offer built on P2.

| # | Project | Sells to | Why it wins work | Time box (AI building, owner reviewing) |
|---|---|---|---|---|
| **P1** | **Arabic-first WooCommerce store (fashion & accessories demo)** | Instagram/WhatsApp sellers, Gulf/Egypt brands | Most requested service; shows variations, COD, Paymob, governorate shipping, RTL, speed | design 1 day + build 3–5 days |
| **P2** | **n8n "Order Ops Suite" attached to P1** | Store owners | Turns a cheap store sale into a retainer; clear business outcome | 2–3 days |
| **P3** | **Clinic / service-business lead-gen site + booking automation** | Local service businesses (clinic, dental, gym, salon, real estate) | High-value local niche; booking → Telegram/Sheet/auto-reply/reminder | 3–4 days |
| **P4** *(optional)* | **FAQ & lead-qualification assistant (n8n AI agent)** | Businesses drowning in repetitive DMs | Fastest-growing skill area; only after first real client | 2–3 days |
| **P5** | **Care plan + monitoring offer** | Every client | Recurring revenue; built from P2's monitor flow | 1 day |

## P1 — Arabic-first WooCommerce store (flagship)

**Why this niche:** fashion/accessories stores appear repeatedly in live Gulf/Egypt WooCommerce requests and exercise the hard parts (variable products, size guides, COD, filtering). Keep the brand **fictional and labelled Demo**. The owner may swap niche later; the structure stays.

**Scope (must-have)**
- Theme: block theme, Arabic RTL default, English switch optional later (Polylang/WPML **[VERIFY free options]** only if asked).
- Pages: Home, Shop (filters: category, size, color, price), Product, Cart, Checkout, Thank-you, My account, About, Contact, Shipping & Returns, Privacy, 404.
- Catalog: **12–16 demo products**, 4 categories, **6+ variable products** (size/color), sale price on some, stock levels, size-guide content, WebP images ≤ 200 KB (licensed or placeholder; log licenses in `docs/ASSETS_TODO.md`).
- Checkout: **COD + Paymob (test mode)**; shipping zones by governorate; free shipping threshold notice on cart; guest checkout; phone validation; order notes.
- Extras: announcement bar, WhatsApp order/help button (`wa.me`, prefilled message), related products, trust strip (only true items: COD, secure payment, easy returns policy *as written in the demo policy*), newsletter form (no fake counts).
- Emails: Arabic branded order emails; test delivery.
- Performance: Lighthouse mobile target **≥ 90** on home and product **[measure; report numbers]**; LCP < 2.5s; CLS < 0.1.
- SEO/schema/sitemap; accessibility basics (contrast, focus, labels, keyboard).

**Design:** Part 3.4. Home structure suggestion: announcement bar → header → hero (product-led) → category tiles → new arrivals grid → value strip → editorial split section → best sellers → testimonials **only if real (otherwise omit)** → newsletter → footer.

**Acceptance (all with evidence):**
1. `scripts/reset.sh` rebuilds the store from zero, seeded.
2. COD test order end-to-end; Paymob test success + failure + refund; emails received.
3. Screenshots 1440/390 of all key pages match `design/APPROVED.md`.
4. Lighthouse numbers recorded; no console errors; PHP log clean.
5. `docs/OWNER-BRIEF/*` + `docs/CLIENT-QA.md` written.

**Owner must do:** approve design; create Paymob test account; supply/approve images; decide brand name.

## P2 — n8n "Order Ops Suite" (for P1)

Seven flows (each: trigger → steps → idempotency → failure → tests → runbook):
| Flow | Trigger | Outcome | Why a client pays |
|---|---|---|---|
| **F1 New order alert** | Woo webhook `order.created` (verify HMAC) | Telegram message (order #, items, total, governorate, phone normalized) + Sheet row | Owner knows instantly; no missed orders |
| **F2 Status updates** | `order.updated` | Customer email (Arabic) on processing/shipped/completed; optional WhatsApp link | Fewer "where is my order?" messages |
| **F3 Pending-payment recovery** | Schedule: orders `pending` > N hours | Reminder to customer + owner alert; stop if paid | Recovers lost sales |
| **F4 Low-stock alert** | Schedule / `product.updated` | Telegram when stock < threshold | Avoids overselling |
| **F5 Daily summary** | Schedule 09:00 Africa/Cairo | Yesterday orders, revenue, top products, pending count | Owner sees the business at a glance |
| **F6 Review request** | Schedule: completed + 5 days | Email asking for a review with product link | Social proof, repeat sales |
| **F7 Error + site monitor** | Error Workflow + schedule | Alert on any failure; HTTP/SSL check of the store | Sells the care plan |

**Acceptance:** every flow has exported JSON + sample payload tests (happy, duplicate, missing field, bad signature); a **shadow run** with real test orders from P1; Telegram/Sheet/email actually received (screenshots); error path proven by forcing a failure; runbook written. **[VERIFY node names/options with n8n docs or `n8n-mcp`.]**

**Owner must do:** create a Telegram bot (BotFather) and a Google Sheet + credentials, save the n8n encryption key, approve message wording.

## P3 — Clinic / service-business lead-gen site (WordPress, demo)

**Fictional dental clinic demo, labelled Demo.** No medical claims, no before/after photos, no real patient data.
- Pages: Home, Services (4–6), Doctors/Team (fictional, labelled), Pricing/"Book a visit", FAQ (FAQ schema), Contact, Privacy.
- **Booking form** in `<slug>-core` plugin (nonce, honeypot, rate limit, server-side validation, phone/date validation) → **POST to n8n webhook with secret** → Telegram to staff + Sheet row + auto-reply email/Telegram + **day-before reminder** flow + "no reply in 2 hours" alert.
- Design: trust-first (clean, calm palette, real-looking team placeholders), WhatsApp click-to-chat, sticky "Book now" on mobile.
- Acceptance: form tested with valid/invalid/duplicate; flows tested; Lighthouse mobile ≥ 90; screenshots; docs + CLIENT-QA.

## P4 (optional) — FAQ & lead-qualification assistant
Telegram/website assistant on n8n AI agent: answers FAQs from a small knowledge base, collects name/phone/need, hands off to a human, logs to Sheet. Guardrails: say "I don't know", no medical/financial advice, cost cap, logging with PII masked, 20 real-looking test messages (Arabic dialect + typos + abuse). Only after P1–P3 and preferably after a first client. Needs an LLM API key (owner decides cost).

## P5 — Care plan offer
A one-page offer + the F7 monitor: monthly report (uptime, updates applied, backups verified, orders automated), what's included, what isn't. **Owner sets prices.** Include the n8n license note in the client contract template.

---

# PART 7 — PHASE WORKFLOW FOR EACH PROJECT (with gates and briefings)

| Phase | What you do | Gate / evidence | Briefing |
|---|---|---|---|
| **0 Discovery** | Skill Router, `docs/`, brief, assumptions, assets list | Brief + `ASSETS_TODO.md` | `00-brief.md` |
| **1 Design** | `design-preview` 3 directions → owner picks | **Owner approval** → `design/APPROVED.md` | `01-design.md` |
| **2 Foundation** | wp-env, theme skeleton, tokens→`theme.json`, core plugin, seed/reset scripts | `reset.sh` works; empty theme renders | `02-foundation.md` |
| **3 Build** | Sections/templates/patterns; catalog/pages via seed; parallel subagents for independent parts | Screenshots match approved design | `03-build.md` |
| **4 Commerce/Forms** | WooCommerce settings, shipping, COD, Paymob test, booking form | Test orders/forms pass (logs + screenshots) | `04-commerce.md` |
| **5 Automation** | n8n flows + tests + runbooks | Sample payload tests + real test events | `05-automation.md` |
| **6 QA** | Security review, performance, SEO, a11y, mobile | Numbers reported; reviewers' findings fixed | `06-qa.md` |
| **7 Package** | Case study, portfolio assets, project data entry, CLIENT-QA | Everything verified, nothing invented | `07-package.md` |
| **8 Final report** | Sections: CHANGED / VERIFIED / REVIEWED / PERFORMANCE / SECURITY / PORTFOLIO / REMAINING (+ PROBLEMS + OWNER TODO) | Evidence for each claim | `99-final.md` |

---

# PART 8 — OWNER BRIEFING SYSTEM (how the owner learns without courses)

## 8.1 Template for `docs/OWNER-BRIEF/NN-<phase>.md` (Egyptian Arabic, **max one page**)
```md
# [المرحلة] — ملخص للمالك

## اللي اتعمل (3 أسطر)
## ليه عملناه كده (بالنسبة للعميل/للفلوس)
## إزاي بيشتغل (تشبيه بسيط، مش كود)
## لو العميل سأل... (3 أسئلة + رد جاهز لكل واحد)
## المشاكل اللي ظهرت وحلّها (من PROBLEMS.md)
## مصطلحات جديدة (2–5، تتضاف لـ GLOSSARY.md)
## اللي عليك تعمله (لو في)
```
Rules: no walls of text; define every term the first time; analogy over jargon (e.g. "webhook = جرس الباب: المتجر بيرن على n8n لما يحصل طلب"; "staging = بروفة قبل العرض"; "HPOS = جدول طلبات مخصص أسرع"; "idempotency = لو الرسالة وصلت مرتين ما نبعتش الإشعار مرتين").

## 8.2 `docs/CLIENT-QA.md` (grows with each project; Arabic)
For each project: 15–25 questions a client will really ask with short answers the owner can say out loud. Must include at least:
- **Price/time/scope:** "إيه اللي داخل في السعر؟ ومدة التنفيذ؟ وإيه اللي مش داخل؟"
- **Ownership:** "الموقع والدومين ملك مين؟" (client, after full payment)
- **Payments:** "إزاي العملاء هيدفعوا؟ كاش/كارت/محفظة؟ والفلوس بتروح فين ومتى؟" (gateway settlement terms from Paymob docs **[VERIFY]**)
- **Speed/SEO:** "ليه الموقع سريع؟ وهيظهر في جوجل؟" (honest: SEO takes time; we set the foundation)
- **Security/backups:** "لو اتهكر أو وقع؟"
- **Editing:** "أقدر أضيف منتج/أعدل صفحة بنفسي؟" (yes, with a short handoff guide)
- **Automation:** "إيه اللي بيحصل لو n8n وقف؟ مين بيتابع؟" (error alerts + care plan)
- **Limits:** "إيه اللي مش هينفع؟" (be candid)
- **Why WordPress/why not X.**
Answers must be **true for the project as built**, flag uncertainty, and never promise rankings, sales numbers, or uptime guarantees.

## 8.3 `docs/GLOSSARY.md` (Arabic, alphabetical, 1–2 lines each) — maintained automatically.

## 8.4 Chat summary after each phase (≤ 8 lines, Egyptian Arabic)
`خلصنا: … | اللي اتأكدت منه: … | اللي مش متأكد منه: … | مشاكل: … | محتاج منك: … | الخطوة الجاية: …`

## 8.5 "Explain-on-demand"
If the owner asks "يعني إيه X؟" or "ليه عملت كده؟", answer in ≤ 6 lines with an analogy, then add the term to the glossary.

---

# PART 9 — PORTFOLIO PACKAGING (after each project is genuinely complete)
Create `docs/CASE-STUDY.md` and `portfolio-assets/` (`cover.webp`, `desktop.webp`, `mobile.webp`, `architecture.svg`, `automation.svg`), then a typed entry for the owner's main portfolio (`PORTFOLIO_CLIENT_FIRST.md`): title, type (**Demo / Personal / Client**), problem, solution, key features, technical decisions, automation flow, tests performed, **measured** performance, screenshots, live URL, repo URL if appropriate, real technologies, SEO title/description, slug.
**Rules:** never invent testimonials, metrics, client names, or production usage; label demos; only verified numbers.

---

# PART 10 — QUALITY GATES (definition of done for ANY project)
- [ ] Design approved by owner; implementation matches it (screenshots 1440/390)
- [ ] `reset.sh` rebuilds everything; README explains run/reset/test/deploy
- [ ] Payments/forms/webhooks tested incl. failure paths; server-side verification; idempotency
- [ ] Security review done (capabilities, nonces, sanitize/escape, secrets out of git)
- [ ] Performance numbers recorded (Lighthouse mobile ≥ 90 home/product), CLS < 0.1, LCP < 2.5s
- [ ] SEO basics + accessibility basics done
- [ ] n8n: exported JSON + tests + runbook + error workflow + license rule respected
- [ ] `docs/OWNER-BRIEF/*`, `CLIENT-QA.md`, `GLOSSARY.md`, `PROBLEMS.md` complete and honest
- [ ] Case study + portfolio assets created; nothing invented
- [ ] Final report with evidence; list of what was NOT verified

---

# PART 11 — WHAT ONLY THE OWNER CAN DO (list in `ASSETS_TODO.md` with exact steps)
1. Install Docker Desktop, Node.js, Git (and confirm they run).
2. Approve/choose design direction (Phase 1) and brand name/colors/logo.
3. Create accounts: **Paymob** (test keys), **Telegram bot** (BotFather), **Google account/Sheet** for logging, SMTP/email provider for transactional mail.
4. Supply or approve **images** (licensed or placeholders). Log licenses.
5. Decide **prices/packages** and payment terms for his own offers.
6. For anything that costs money (hosting, domain, paid plugins, LLM API): decide and buy.
7. For real clients: get written scope, deposit, and the client's own server/n8n account (licensing rule).

---

# PART 12 — FIRST PROMPTS TO PASTE (one at a time)

**Prompt 1 (setup + plan, no code yet)**
```text
Read OPENCODE_MASTER_BRIEF.md Parts 0, 1, 2 and 7. Run the Skill Router and state the one-line plan.
Scaffold the repo for P1 (Arabic-first WooCommerce fashion store, demo) as in Part 2.1, create docs/ including OWNER-BRIEF/, PROBLEMS.md, GLOSSARY.md, CLIENT-QA.md, ASSETS_TODO.md.
Write docs/PLAN.md with phases and risks. List exactly what I must install or create myself (Docker, accounts, etc.) with step-by-step instructions in simple Egyptian Arabic.
Do not write theme code yet. Then write OWNER-BRIEF/00-brief.md.
```
**Prompt 2 (design gate)**
```text
Read Part 3 and the design-preview skill. Create the 3 design previews for P1 from web-design/references/starter, with real Arabic copy, at 1440 and 390, screenshot them and look at them before showing me.
Show the comparison and your recommendation, ask me ONE question, then stop. Write OWNER-BRIEF/01-design.md.
```
**Prompt 3 (after approval)**
```text
Direction <A/B/C> approved with these changes: <list>. Write design/APPROVED.md. Do Phase 2 (foundation): wp-env, block theme with theme.json from the approved tokens, <slug>-core plugin, seed.sh and reset.sh. Prove reset.sh works. Then OWNER-BRIEF/02-foundation.md and a short chat summary.
```
**Prompt 4 (build sections)**
```text
Phase 3: build the templates and patterns section by section from the approved design. After each section: screenshot at 1440 and 390 and fix visible problems. Use parallel subagents only for independent parts with owned files. Write OWNER-BRIEF/03-build.md. Tell me any problem using the problem protocol.
```
**Prompt 5 (commerce)**
```text
Phase 4: configure WooCommerce for Egypt (EGP, governorate shipping zones, COD), integrate Paymob in test mode, and test: COD order, Paymob success, failure, refund, and emails. Show evidence. Tell me exactly which Paymob keys I must create and where to put them (.env only). Write OWNER-BRIEF/04-commerce.md and add 15 client questions to CLIENT-QA.md.
```
**Prompt 6 (n8n)**
```text
Phase 5: build P2 flows F1–F7 with exported JSON, sample-payload tests (happy, duplicate, missing field, bad signature), error workflow and runbooks. Remember the n8n license rule in Part 0.4. Tell me what credentials I must create. Write OWNER-BRIEF/05-automation.md.
```
**Prompt 7 (QA + package)**
```text
Phases 6–8: run security, performance, SEO, accessibility and mobile checks with real numbers, fix findings, then create the case study, portfolio assets and the final report with the required sections and evidence. List everything NOT verified.
```

---

# PART 13 — HONEST LIMITS (tell the owner up front)
- I/you cannot guarantee income, rankings, or that a demo wins clients; the brief raises the odds by building what the market asks for and presenting it professionally.
- Free/small models are weaker at visual design. Use a stronger model for the design step if previews look generic.
- Live Paymob, WhatsApp Business API, and production hosting need the owner's accounts and money; in demos they are **test mode / fallback channels** and must be described that way.
- The market numbers come from public reports and blogs; re-check them monthly (`freelance-delivery` §8).
