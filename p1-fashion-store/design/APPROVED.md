# Design Approval — Nilad (نيلاد)

**Date:** 2026-10-01 · **Status:** APPROVED (design gate passed)

## Approved direction
**Direction A — "Clean commerce"** (light/trustworthy, product-first) with **merged elements from B** at the owner's request.

Owner trail:
1. Owner reviewed all 3 previews + shots → picked **A** ("عجبني تصميم a").
2. Owner requested modifications: "ضيف عناصر باقي التصميمات، وبالذات preview B — حوار الشكل والكتابة وكلمة بلون مختلف، وحركة الاسكرول اللي عجبتني ضيفها".
3. A revised accordingly; owner replied **"كمل"** → approval of the revised A and start of Phase 2.

## What was merged into A (from B/C)
| Element | Source | Where |
|---|---|---|
| Colored word in H1 (`<em>`, primary green) | B | `preview-a.html` hero h1 |
| Larger editorial H1 (max 60px = brief ceiling; was 56px), line-height 1.15 | B | `.hero h1` |
| Sticky section titles (desktop, opaque bg) | B (`sticky-title`) | `#cats`, `#best` |
| Reveal-on-scroll with stagger (`prefers-reduced-motion` + `<noscript>` fallback) | owner request ("حركة الاسكرول") | `.reveal` via IntersectionObserver |
| Anchor offset `scroll-margin-top:88px` | B/reference study | `section[id]` |
| Hero secondary ghost CTA beside primary | B/C (dual CTA) | `.hero-actions` |
| Brand sub-label colored primary | B (`.brand small` colored) | header |

Palette, structure, and product-first layout of A are **unchanged** (base direction).

## Source files (source of truth for Phase 3 build)
- `design/preview-a.html` — the approved design (revised version)
- `design/tokens.css` — shared spacing/type/shape tokens
- `design/shots/a-1440.png`, `a-1440-top.png`, `a-390.png`, `a-390-top.png` — approved-look evidence
- Preview A `:root` palette: bg `#FAF8F4` · surface `#FFFFFF` · text `#1B1A17` · muted `#5F5A52` · primary `#0B6B57` · on-primary `#FFFFFF` · accent `#B45309` · border `#E6E1D8` · primary-soft `#E4F1EC` · sale `#9A3412`
- Fonts: **Cairo** (Arabic UI, weights 400/600/800) + **Inter** (Latin fallback)

## Non-negotiables carried into the build
- Brief Part 3 design laws (8pt spacing, container 1200px, one primary CTA, one h1, pill buttons, radius 20–25px, sticky blurred header, WebP ≤ 200KB).
- Arabic RTL default (`dir="rtl"`).
- Demo labeling: "متجر تجريبي (Demo)" everywhere promised.
- Motion must respect `prefers-reduced-motion`.

## Out of scope of this approval
Catalog content, product photography (builder-sourced per `docs/DECISIONS.md`), and later-phase chrome (mobile bottom dock, marquee band) are Phase 3+ items logged in `docs/REFERENCE-SITES.md`.
