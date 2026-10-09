# Brief — P1 Arabic-first WooCommerce fashion store (Demo)

Phase 0 deliverable (OPENCODE_MASTER_BRIEF Part 1.2). **Design direction is chosen in Phase 1, not here.**

## Goal
A demo store that makes a brand owner say "I want one for my shop" — Arabic-first, fast, and ready for Egyptian/Gulf selling (COD, Paymob, governorate shipping), plus proof that orders can be automated afterwards.

## Visitor
Owner of a small fashion/accessories brand (Egypt or Gulf) selling today via Instagram/WhatsApp. Mobile-first, scrolls fast, distrusts "cheap template" sites.

## Primary action
**Add to cart → checkout** (COD or test-mode card). Secondary: WhatsApp chat (`wa.me` prefilled), browse by category.

## Pages
Home · Shop (filters: category, size, color, price) · Product (variable size/color, sale price, size guide) · Cart · Checkout · Thank-you · My account · About · Contact · Shipping & Returns · Privacy · 404.

## Integrations
- **WooCommerce**: EGP, shipping zones by governorate, free-shipping threshold, COD, guest checkout, Egyptian phone validation, Arabic transactional emails.
- **Paymob** (test mode only): success / failure / retry / refund — owner supplies keys (ASSETS_TODO #3).
- **WhatsApp**: `wa.me` click-to-chat only (no official API in demo).
- **Newsletter**: form only, no fake counts.
- (Phase 5, separate) n8n Order Ops Suite — alerts, summaries, review requests.

## Constraints
- RTL Arabic default; English switch only if asked (Polylang/WPML **[VERIFY free options]**).
- Block theme + `nilad-core` plugin (logic never in theme); ≤ 15 active plugins.
- Design Laws (Brief Part 3): 8-pt spacing scale, one primary CTA per group, one h1, consistency, sticky blurred header, WebP ≤ 200 KB, subtle motion only.
- Lighthouse mobile ≥ 90 on home + product **[measure, report numbers]**.
- Everything reproducible: `scripts/reset.sh` rebuilds from zero.
- Demo honesty: fictional brand labelled Demo; no invented testimonials/metrics.
- **Gate:** 3 structure-different previews → owner picks → `design/APPROVED.md` before any theme code.

## Open decisions (owner)
1. ~~Brand name + slug~~ — done: **نيلاد / Nilad** (`nilad-*` slugs).
2. Prices/packages/timeline (ASSETS_TODO #6) — after design.
3. Images + licenses (ASSETS_TODO #7).
