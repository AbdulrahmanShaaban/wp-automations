# Design direction: P3 — عيادة سِراج للأسنان (clinic demo)

Per `design-direction` §3. Three candidate concepts, because this build shows the owner
**three directions to choose from** — so each differs in concept, palette, type, hero,
radius family and signature moment (not colour only).

## Shared

- **Audience:** Arabic-speaking Egyptian patients on mobile. **Primary action (one per screen):** احجز زيارة.
- **Constraints:** fictional clinic, no medical claims, no before/after photos, no invented
  statistics or testimonials, everything marked **Demo**.
- **Not repeated from P1** (nيلاد store): palette, type pairing, hero structure, radius family,
  section rhythm — all four differ, per the ban list.

---

## A — «الروشتة» / the prescription pad

- **Concept:** a doctor's notepad on a clinic desk — thin ruled lines, margin numbering, ink-blue
  stamps. Precise rather than friendly: this is the "your dentist writes everything down" clinic.
- **Mood words:** precise, clinical, daylight.
- **Palette:** adapted from **I — Electric Indigo Light** (`#F7F7FB` / `#3B2FE0`) with two
  deliberate changes: primary shifted indigo→**clinical blue `#2F4BD8`**, accent pink→**oxblood
  `#A3231B`** (the ink colour on a prescription). Neutrals stay cool. Contrast re-verified.
- **Type:** pairing **2 — Alexandria** (Arabic + Latin geometric, ships its own Latin). Body 400,
  display 700–800. Arabic display goes large; no letter-spacing anywhere.
- **Layout:** 12-col feel, section numbers in the margin, text block on cols 1–7 with a narrow
  ruled "notes" column at cols 9–12. One oversized element: the hero headline set at 8–10vw.
  **Radius family: soft (14px)**, borders + one very soft shadow — no pills.
- **Signature moment:** the ruled line that the hero headline sits on **draws itself on load**
  (scaleX 0→1), like ink being drawn; it becomes the section divider system on every page.
- **Motion personality:** clinical calm — 200–320ms, ease-out, only this one moment + hovers.
- **Ban-list exceptions:** none.

## B — «العيادة الخاصة» / the private practice

- **Concept:** a premium private clinic — after-hours lighting, deep ink-blue room, quiet
  confidence. The clinic as a design brand, not a health poster.
- **Mood words:** premium, quiet, composed.
- **Palette:** adapted from **E — Midnight Cinema** (`#0B0C10` / cream primary) with two changes:
  primary cream→**warm bone `#E8DCC3`**, accent periwinkle→**muted gold `#D9B26A`**; added a
  grain overlay (opacity .05) because grain is what makes dark surfaces read as material.
- **Type:** pairing **1 — Markazi Text** (Arabic display, serif) + **IBM Plex Sans Arabic** (body).
  Nothing in P1 comes close: Arabic *serif* headlines are the strongest differentiator available.
- **Layout:** editorial. Hero type is the image — Arabic display up to `clamp(3rem, 7vw, 6.5rem)`,
  line-height 1.15, with an offset media card breaking the grid on purpose (once). Section padding
  128px desktop. **Radius family: sharp (4px)**, borders only, zero shadows.
- **Signature moment:** the headline reveals **line by line with a mask** (each Arabic line wipes up
  from behind a fixed edge) — the one moment visitors remember; everything else stays still.
- **Motion personality:** cinematic — 600–900ms for the signature, 150ms hovers, nothing else.
- **Ban-list exceptions:** none.

## C — «دفتر الوصفات» / the paper prescription book

- **Concept:** warm sand paper, blue ballpoint ink, a stack of numbered cards. The neighbourhood
  clinic you trust — human, unhurried, familiar. **This is the structure the owner already liked**
  (sticky service list with the title holding while you scroll).
- **Mood words:** warm, familiar, unhurried.
- **Palette:** adapted from **C — Warm Local** (sand `#FFF7EE`) with two changes: primary
  terracotta→**deep ocean blue `#0E4A6B`** (ink on paper), accent teal→**rose `#BE123C`**.
  The owner asked for blue; blue on warm sand is the classic paper-and-ink pairing.
- **Type:** pairing **5 — El Messiri** (Arabic display, calligraphic warmth) + **Tajawal** (body).
- **Layout:** asymmetric: sticky narrow title column + wide divided list; the booking form is the
  hero of the booking section; price rows read like a receipt. **Radius family: pill** (pill buttons,
  20px cards) — friendly by design, and never mixed with the other two.
- **Signature moment:** the **dotted rail** beside the service list fills as you scroll — a
  progress line drawn like a paper punch-hole track, and it doubles as the list's scroll hint.
- **Motion personality:** warm editorial calm — 250–400ms; the rail is the only motion.
- **Ban-list exceptions:** none.

---

## What the three have in common (so switching direction later costs nothing)

Tokens, the booking form, header/footer parts, FAQ, contact card, and the "Demo" labelling are
identical. Only palette, type, radius family, hero composition and the signature moment change —
which is the point of the gate: pick the personality, keep the engineering.

## Generic Test (design-direction §8) — run on the 1440 and 390 screenshots

| Question | A | B | C |
|---|---|---|---|
| Without the logo, could this be any website? | no — ruled prescription pad, margin numbers, RX stamp | no — giant Arabic serif on near-black, grain | no — sand paper + receipt rows + dotted rail |
| Palette **and** fonts identical to P1? | no / no | no / no | no / no |
| Hero = centred headline + two buttons? | no — asymmetric + notes card | no — offset card, line-mask | no — split + pill note |
| 3+ consecutive sections identical? | no (rows → cards → split) | no (bento → feature → table) | no (list → cards → form/receipt) |
| Oversized element + hierarchy when squinting? | 84px hero | 104px hero, 128px rhythm | 68px hero + numbered sections |
| Only motion = fade-up? | no — the drawn rule | no — line-mask | no — the filling rail |
| Ignores the concept above? | no | no | no |

## Measured, not eyeballed

- `node design/check-contrast.js` → **36/36 PASS** (12 pairs × 3 palettes).
- `scrollWidth - clientWidth` = **0** on all three at **390px and 1440px** (DevTools).
- Header is one line at 390px: keeping the Demo badge inside the brand needed 356px inside a
  342px row and pushed the page 14px wide → badge hidden below 560px, brand/CTA nowrap.
- Arabic rules: no `letter-spacing` anywhere (grep-verified); h1 `letter-spacing: normal`;
  body line-height 1.7; Arabic numerals left Western; Markazi capped at weight 700 so the
  browser cannot fake-bold an Arabic serif.
- Radius family per direction is single-valued and never mixed: A `14px`, B `4px`, C `pill`.
- Console: no errors or warnings on any preview or on the components sheet.
- Cascade trap worth remembering: per-preview `<style>` blocks load **after** tokens.css, so a
  one-class rule there beats a one-class rule in tokens. Direction-level surfaces must be
  declared in tokens or with higher specificity (this is why C's pink placeholder gradient
  survived the first pass).