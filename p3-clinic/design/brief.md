# P3 — Clinic / service-business lead-gen site (demo) — design brief

**Project:** fictional dental clinic demo, labelled **Demo** everywhere. Not a real clinic.
**Sells to:** local service businesses (clinic, dental, gym, salon) — the buyer is the clinic owner, not the patient.
**Platform:** WordPress block theme (same stack as P1) + n8n booking automation.
**Time box:** 3–4 days (owner reviewing).

## Goal
Convert a local visitor into a **booked visit request** (or a WhatsApp/phone lead) in one screen, on mobile, in Arabic.

## Audience & language
Arabic-speaking Egyptian visitors on mobile (majority), RTL. Fictional brand: **عيادة سِراج للأسنان (Demo)**.

## Primary action (ONE per screen)
**احجز زيارة** — a booking request form (name, phone, service, preferred time). Repeated in the header, hero, and the booking section. Everything else (call, WhatsApp, FAQ) is secondary.

## Guardrails (hard rules, non-negotiable)
- **No medical claims.** No "guaranteed", no treatment outcomes, no statistics, no "before/after" imagery.
- **No real patient data**, no real doctor names/photos, no real testimonials.
- Every fictional element carries a visible **Demo** label.
- Phone/email/address are clearly marked placeholders.

## Pages (from the master brief)
Home · Services (6) · Team (3 fictional doctors) · Booking + prices · FAQ (FAQ schema in build) · Contact · Privacy.

## Section list for the homepage previews
1. Header — sticky, one CTA.
2. Hero — the offer + one primary CTA + an honest proof strip (location, hours, insurance accepted — no numbers).
3. Services — 6 services, no outcome claims.
4. Team — 3 fictional dentists, `Demo` labels, specialty + years (no photo claims).
5. Booking / prices — booking form + a short price list marked Demo.
6. FAQ — 5 questions (appointment, insurance, children, emergency, payment).
7. Contact + footer — address/hours placeholders, map placeholder.

## Three directions (structurally different, not just color)
| | A — "عيادة زرقاء" | B — "ليل أزرق" | C — "رمل + أخضر مزرق" |
|---|---|---|---|
| Palette | blue clinic: cool off-white, **blue** primary, teal accent | midnight: near-black navy, **sky blue** primary, amber accent | warm sand background, **deep teal** primary, rose accent |
| Type | Cairo + Inter | IBM Plex Sans Arabic + Space Grotesk | Tajawal + DM Sans |
| Hero | H2 centered statement | H3 editorial (oversized, offset media) | H1 split (text + media block) |
| Services | S2 alternating rows | S3 bento grid (6-col) | S4 sticky title + divided list |
| Team | W1 card grid | W3 featured + compact list | W1 card grid (portrait blocks) |
| Booking | split: form + price list | price table (K2) + form band | form first, prices as add-on cards |
| FAQ | details list (default) | details list, two columns | details list with side note |
| Feel | calm clinical trust | premium, confident | warm, family, neighbourhood |

**Colour rule for P3:** no green. P1's palette is `#0B6B57` green; repeating it in a
second portfolio piece reads as a template, so every P3 hue is different and the
contrast ratios are recomputed with `design/check-contrast.js` (all 33 pairs pass).

## Assumptions (stated, not asked)
- No photography available → labelled placeholder blocks (per web-design rules), never stock-icon clutter.
- Prices are demo numbers, clearly marked.
- No WhatsApp number yet → placeholder link, same pattern as P1.
- Booking automation (n8n Telegram + Sheet + auto-reply) is Phase 2 of P3, after the site exists.
