# Reference Sites — Pattern Study (18 sites)

**Date:** 2026-10-01 · **Method:** parallel webfetch analysis (3 agents, markup/CSS only — no JS runtime claims)
**Purpose:** owner-requested A-to-Z study so future projects reuse proven patterns. Feeds the Nilad design (Phase 1) and stays as a pattern bank.

## Status

| # | Site | Status | One-liner |
|---|------|--------|-----------|
| 1 | nourmansour.com | ✅ fetched | WP developer portfolio (EN), Astra/Elementor |
| 2 | magicpotion.sa | ✅ fetched | Salla perfume store (AR/RTL, KSA) — richest commerce reference |
| 3 | moakkad.com | ✅ fetched | AR/RTL SaaS landing — floating pill anchor nav |
| 4 | thbot.sa | ✅ fetched | AR/RTL real estate — plum+gold, status badges |
| 5 | nojoomalemarat.com | ✅ fetched | Dark EN clinic site — background marquee text |
| 6 | ahmadshabana.com | ✅ fetched | Bilingual (EN/AR) medical — conversion-tagged WhatsApp |
| 7 | freshfood-eg.com | ✅ fetched | EN Egyptian food WooCommerce — promise repetition |
| 8 | craftr.chapters-eg.com | ✅ fetched | EN academy — clickable marquee CTA |
| 9 | jawa-eg.com | ❌ fetch failed (transport error ×3) | — |
| 10 | salamproperties-eg.com | ✅ fetched | Real estate, genuine `/ar/` bilingual — `Contact Us \| تواصل معنا` single control |
| 11 | eslamtoba.com | ✅ fetched | Personal brand — stat counters inside cards, WhatsApp as menu item |
| 12 | ismilexp.com | ✅ fetched | Dental education WooCommerce — credential bullets |
| 13 | cipher.com.sa | ✅ fetched | Cybersecurity B2B (EN) — slogan headings, certificates carousel |
| 14 | ismileuae.net | ✅ fetched | Dental clinic — BNPL box, emergency line in top bar |
| 15 | esnadglobal.com | ✅ fetched | Holding company — giant typographic link list, numbered hero dots |
| 16 | hasafh.com | ✅ fetched | **Arabic-first RTL** corporate — Arabic-Indic numerals, eyebrow rhythm |
| 17 | vxscaling.com | ✅ fetched | **Arabic-first RTL** agency — per-block contextual CTAs, risk-reversal microcopy |
| 18 | skyboundcx.com | ⚠️ placeholder (coming-soon page) | no analyzable layout |

**Coverage: 16 analyzed, 1 failed, 1 placeholder.**

## Pattern bank (what keeps recurring)

### Structure & navigation
1. **Sticky/floating header + anchor offset variable** (`--header-offset`) so anchor targets never hide under the header — 5+ sites.
2. **Eyebrow label → H2 → content → text-link CTA** as the standard section grammar (hasafh, vxscaling, craftr, salam). Our `section-head` matches this; keep it.
3. **Anchor-driven one-page narrative** where nav labels mirror section IDs (moakkad, thbot).
4. **Mobile bottom/fixed action dock** (cart + WhatsApp) — freshfood, magicpotion, ismile. Strong candidate for Nilad Phase 2 mobile.
5. **Sticky section title beside scrolling content** (moakkad, B-preview) — title stays while the list scrolls.

### Motion
6. **Marquee/repeated-text ticker** as brand refrain — freshfood tagline ×4, craftr strips, nojoom oversized background text, salam repeated headings. Cheap motion, zero JS libs.
7. **Dismissible top promo banner persisted in `localStorage`** (magicpotion).
8. **Count-up stats on scroll** (eslamtoba `+0` placeholders, cipher, esnad).
9. **Reveal-on-scroll + reduced-motion guard** — widely implied by lazy-load observers; we ship it in preview A.

### Trust & conversion
10. **One commercial promise repeated 2–3×** (top bar + hero + footer): freshfood "48h Cairo", salam hotline `17051`.
11. **WhatsApp `wa.me` as first-class CTA** (menu item, floating dock, or top bar) — near-universal on Arabic sites; eslamtoba even tags it as a conversion.
12. **Risk-reversal microcopy directly under the H1/CTA** (vxscaling "دون التزامات", ismile "6 installments 0%").
13. **Logo/credential walls mid-page** before contact (all corporate sites); reviews with **platform source badge** (hasafh Google/Twitter attribution).
14. **Stat band as proof after hero or before footer** (cipher, esnad, vxscaling).

### Typography & color
15. **Arabic UI face + separate Latin display face, `font-display:swap`, self-hosted** (nourmansour, magicpotion) — we already pair Cairo + Inter.
16. **Colored/emphasized word inside H1** (B-preview `<em>`; vxscaling inline bold) — adopted into A.
17. **Tinted card system over shadows**: ~8% brand bg + 1px border + ~15px radius (thbot) — cheaper and more consistent than drop shadows.
18. **Bilingual micro-pairs**: Arabic title + small English gloss (vxscaling), single `Contact Us | تواصل معنا` control (salam).

### RTL-specific takeaways (the exploitable gap)
- Only **3 of 16** analyzed sites are genuinely Arabic-first (hasafh, vxscaling, magicpotion); most Egyptian sites are English-only despite their market — quality Arabic RTL is a differentiator.
- **Arabic-Indic numerals in stats** (hasafh `+٢٥ عميل`) = localization done right; for Nilad pricing keep Western digits (Egyptian e-commerce convention) but consider Arabic-Indic in editorial stats.
- Watch **LTR leakage in Arabic dates/punctuation** (hasafh mixed date format) — a QA item for Phase 2 content.

## Adopted into Nilad (preview A, this revision)
- **Colored word in H1** (`<em>` in primary green) — pattern 16 (from B).
- **Bigger editorial H1** (56→60px, line-height 1.15) — brief max respected.
- **Sticky section titles** on desktop (`#cats`, `#best`) — pattern 5/1 (B's `sticky-title`).
- **Reveal-on-scroll** with stagger + `prefers-reduced-motion` + noscript fallback — pattern 9.
- **`scroll-margin-top: 88px`** on `section[id]` — pattern 1 (header offset).
- **Secondary ghost CTA in hero** beside primary (one primary per group preserved) — moakkad/vxscaling dual-CTA.

## Candidates for later phases (not built yet)
- Mobile bottom action dock (cart + WhatsApp) — Phase 2 mobile.
- Marquee brand band / dismissible promo with `localStorage`.
- Count-up stats in value strip.
- Risk-reversal line under H1 ("تقدر ترجّع خلال 14 يوم").
- WhatsApp as tracked primary contact CTA.

## How to reproduce
`Task` agents with `webfetch`, batched 6 sites each, structured prompts: layout/type/color/motion/trust/RTL + 3 steal-worthy patterns + 1–2 flaws; record fetch failures honestly, never fabricate. Sites behind JS-only shells can't be judged by fetch alone — note as limitation.
