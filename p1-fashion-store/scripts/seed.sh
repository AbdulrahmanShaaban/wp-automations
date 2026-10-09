#!/usr/bin/env bash
# seed.sh — create site content/config from zero. IDEMPOTENT: safe to run twice.
#
# Implementation: ONE WordPress boot for all content/settings/catalog
# (seed-wp.php in the mounted plugin dir — each CLI `wp` call pays a full WP
# boot, so the old per-step bash loop made seed runs take 40+ minutes on a
# loaded host). Language installs and Paymob stay here (CLI/network needs).
#
# Phase 2 scope: language, site identity, pages, base WooCommerce settings.
# Phase 3+: products, categories, menus, shipping zones → extend seed-wp.php
# and seed-catalog.php, NOT this wrapper.
set -euo pipefail
cd "$(dirname "$0")/.."

# Git Bash (MSYS) rewrites POSIX-looking args (/var/www/html/...) into Windows
# paths — breaks container paths passed to sh -c. Disable the conversion.
export MSYS2_ARG_CONV_EXCL='*'
export MSYS_NO_PATHCONV=1

wp() { npx @wordpress/env run cli wp "$@"; }

echo "==> Seed: language files (container file check — no WP boot when present)"
# Sentinel is L<digit> chosen so the wp-env wrapper lines (which echo this
# command string back) cannot false-match: the command contains "L$x", never L0/L1/L2.
LANG_COUNT="$(npx @wordpress/env run wordpress sh -c 'x=0; test -f /var/www/html/wp-content/languages/ar.mo && x=$((x+1)); test -f /var/www/html/wp-content/languages/plugins/woocommerce-ar.mo && x=$((x+1)); echo L$x' 2>/dev/null | tr -d '\r' | grep -oE 'L[0-9]+' | tail -n1 || true)"
if [ "${LANG_COUNT:-L0}" != "L2" ]; then
  echo "    installing missing translations (${LANG_COUNT:-L0}/2 present)"
  wp language core install ar >/dev/null 2>&1 || true
  wp language plugin install woocommerce ar >/dev/null 2>&1 || true
fi

echo "==> Seed: WP + WooCommerce (single boot: identity, pages, settings, catalog, shipping)"
wp eval-file /var/www/html/wp-content/plugins/nilad-core/seed-wp.php

echo "==> Seed: uploads hardening (deny script execution — audit security #5)"
wp eval-file /var/www/html/wp-content/plugins/nilad-core/harden-uploads.php

echo "==> Seed: payment gateway — Paymob (official plugin, test mode)"
# Third-party plugin from WordPress.org (decision: official-paymob-plugin).
# Needs network; tolerate offline runs — gateway stays inactive until keys.
if wp plugin is-active paymob-for-woocommerce >/dev/null 2>&1; then
  echo "    paymob-for-woocommerce active"
else
  wp plugin install paymob-for-woocommerce --activate >/dev/null 2>&1 \
    && echo "    paymob-for-woocommerce installed+activated" \
    || echo "    (paymob install failed — network? gateway inactive until it succeeds)"
fi

echo "==> Seed done (idempotent — run again = no duplicates)."
