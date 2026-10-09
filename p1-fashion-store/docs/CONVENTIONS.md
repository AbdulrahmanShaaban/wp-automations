# Conventions (project-specific only; general rules live in the global skills)

- **Doc languages:** `docs/` code/plan files in English; `docs/OWNER-BRIEF/*`, `docs/CLIENT-QA.md`, `docs/GLOSSARY.md` in Egyptian Arabic with English technical terms (Brief Part 1.1).
- **Slug prefix:** everything generated for this project uses `nilad` (theme `nilad-theme`, plugin `nilad-core`, text domain `nilad`, PHP prefix `nilad_`) — brand decided in DECISIONS.md `brand-name`.
- **Seed scripts must be idempotent** — safe to run twice (Brief Part 2.2).
- **Screenshots:** `design/shots/<page>-<width>.png` (e.g. `home-1440.png`, `checkout-390.png`), re-taken after every visual fix. Take them with `scripts/screenshot.js` (`node screenshot.js <file-url> <w> <h> <out> [full]`, needs `npm i puppeteer-core` once) — **never** `chrome --headless --window-size=390` (Chrome clamps to 500px and crops RTL pages; see PROBLEMS.md 2026-10-01). If the Read tool serves a stale image, verify with pixel probes instead.
- **Plugin count:** keep ≤ 15 active plugins for the store (Brief Part 2.3).
- **Never** paste secrets into chat, git, or docs — `.env` only (`.env.example` has names only).
- **Images:** WebP, ≤ ~200 KB each, fixed aspect ratio via `object-fit: cover`; license logged in ASSETS_TODO.
- **Honesty:** every claim in docs needs evidence (command output, screenshot, test result). Unverified items keep their **[VERIFY]** tag.
