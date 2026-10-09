#!/usr/bin/env bash
# seed.sh — create site content/config from zero. IDEMPOTENT: safe to run twice.
#
# Implementation: ONE WordPress boot for all content/settings (seed-wp.php in
# the mounted plugin dir — each CLI `wp` call pays a full WP boot; the P1
# project's old per-step bash loop took 40+ minutes on this host). Language
# install stays here (needs network / container file check).
#
# Scope: Arabic locale, site identity, 4 demo pages, static front page,
# pretty permalinks. Booking + services content arrive in later phases →
# extend seed-wp.php, NOT this wrapper.
set -euo pipefail
cd "$(dirname "$0")/.."

# Git Bash (MSYS) rewrites POSIX-looking args (/var/www/html/...) into Windows
# paths — breaks container paths passed to sh -c. Disable the conversion.
export MSYS2_ARG_CONV_EXCL='*'
export MSYS_NO_PATHCONV=1

wp() { npx @wordpress/env run cli wp "$@"; }

echo "==> Seed: language files (container file check — no WP boot when present)"
# Sentinel L<digit> so the wp-env wrapper echo cannot false-match (P1 pattern).
LANG_COUNT="$(npx @wordpress/env run wordpress sh -c 'x=0; test -f /var/www/html/wp-content/languages/ar.mo && x=$((x+1)); echo L$x' 2>/dev/null | tr -d '\r' | grep -oE 'L[0-9]+' | tail -n1 || true)"
if [ "${LANG_COUNT:-L0}" != "L1" ]; then
  echo "    installing Arabic core translation (${LANG_COUNT:-L0}/1 present)"
  wp language core install ar >/dev/null 2>&1 || true
fi

echo "==> Seed: theme + plugin active (no-op when already active)"
wp theme activate siraj-theme >/dev/null 2>&1 || true
wp plugin activate siraj-core  >/dev/null 2>&1 || true

echo "==> Seed: WP (single boot: identity, pages, front page, permalinks)"
wp eval-file /var/www/html/wp-content/plugins/siraj-core/seed-wp.php

echo "==> Seed done (idempotent — run again = no duplicates)."
