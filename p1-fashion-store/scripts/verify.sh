#!/usr/bin/env bash
# verify.sh — checks (Brief 2.4). Exits non-zero on any failure.
set -euo pipefail
cd "$(dirname "$0")/.."

# Git Bash (MSYS) rewrites POSIX-looking args (/var/www/...) into Windows paths,
# which breaks `wp-env run ... php -l <path>`. Disable the conversion.
export MSYS2_ARG_CONV_EXCL='*'
export MSYS_NO_PATHCONV=1

FAIL=0
wp() { npx @wordpress/env run cli wp "$@"; }
ok()   { echo "  PASS: $1"; }
bad()  { echo "  FAIL: $1"; FAIL=1; }

echo "==> verify.sh"

# 1. Core + PHP versions
CORE="$(wp core version || echo MISSING)"
case "$CORE" in
  MISSING) bad "wp core version" ;;
  *) ok "WordPress $CORE" ;;
esac

# 2. Active plugins contain woocommerce + nilad-core
PLUGINS="$(wp plugin list --status=active --field=name || true)"
echo "$PLUGINS" | grep -qx 'woocommerce'   && ok "woocommerce active"     || bad "woocommerce active"
echo "$PLUGINS" | grep -qx 'nilad-core'    && ok "nilad-core active"      || bad "nilad-core active"

# 3. Theme active
THEME="$(wp theme list --status=active --field=name || true)"
echo "$THEME" | grep -qx 'nilad-theme' && ok "nilad-theme active" || bad "nilad-theme active"

# 4. Seeded pages exist (5) and front page set
PAGES="$(wp post list --post_type=page --post_status=publish --field=post_name | sort | tr '\n' ' ')"
for p in home about contact shipping-returns privacy; do
  case "$PAGES" in
    *"$p"*) ok "page exists: $p" ;;
    *)      bad "page exists: $p" ;;
  esac
done
FRONT="$(wp option get page_on_front || true)"
[ -n "$FRONT" ] && [ "$FRONT" != "0" ] && ok "front page set (#$FRONT)" || bad "front page set"

case "$PAGES" in
  *sample-page*) bad "sample-page removed" ;;
  *) ok "sample-page removed" ;;
esac

# 5. Currency setting
CUR="$(wp option get woocommerce_currency 2>/dev/null || echo '')"
[ "$CUR" = "EGP" ] && ok "currency EGP" || bad "currency EGP (got: ${CUR:-none})"

# 6. Homepage renders with brand + theme stylesheet (server-side smoke test).
#    Retries until the body actually contains both: the very first request after
#    a cold start occasionally returns a body without them under container load
#    (false FAIL observed once — PROBLEMS 2026-10-03).
HOME_HTML=""
for i in 1 2 3; do
  HOME_HTML="$(curl -fsS http://localhost:8888/ 2>/dev/null || echo '')"
  case "$HOME_HTML" in
    *نيلاد*"themes/nilad-theme/style.css"*) break ;;
  esac
  sleep 3
done
if [ -z "$HOME_HTML" ]; then
  bad "homepage HTTP 200"
else
  ok "homepage HTTP 200"
  case "$HOME_HTML" in
    *نيلاد*) ok "brand نيلاد rendered" ;;
    *)        bad "brand نيلاد rendered" ;;
  esac
  case "$HOME_HTML" in
    *wp-content/themes/nilad-theme/style.css*) ok "theme stylesheet loaded" ;;
    *) bad "theme stylesheet loaded" ;;
  esac
fi

# 7. PHP lint of custom plugin + seed/check files (inside container)
for f in nilad-core/nilad-core.php nilad-core/seed-wp.php nilad-core/seed-catalog.php nilad-core/check-phase4.php nilad-core/trigger-order-email.php nilad-core/register-n8n-webhooks.php nilad-core/qa-hardening.php nilad-core/exposure-hardening.php nilad-core/harden-uploads.php; do
  if npx @wordpress/env run cli php -l "/var/www/html/wp-content/plugins/$f" >/dev/null 2>&1; then
    ok "php -l ${f##*/}"
  else
    bad "php -l ${f##*/}"
  fi
done
if npx @wordpress/env run cli php -l /var/www/html/wp-content/themes/nilad-theme/functions.php >/dev/null 2>&1; then
  ok "php -l functions.php"
else
  bad "php -l functions.php"
fi

# 8. Phase 4 commerce assertions (orders/mail skip cleanly on a fresh seed;
#    phone/gateway/zone-independent checks always run)
if PH4_OUT="$(wp eval-file /var/www/html/wp-content/plugins/nilad-core/check-phase4.php 2>&1)"; then
  echo "$PH4_OUT" | sed 's/^/    /'
  ok "phase 4 commerce checks"
else
  echo "$PH4_OUT" | sed 's/^/    /'
  bad "phase 4 commerce checks"
fi

# 9. Phase 5 automation — n8n workflow logic tests (no n8n instance needed;
#    tests the jsCode embedded in the shipped workflow JSONs; import validation
#    lives in n8n/tests/import-evidence.txt)
if N8N_OUT="$(node n8n/tests/run-tests.js 2>&1)"; then
  echo "$N8N_OUT" | tail -n 3 | sed 's/^/    /'
  ok "n8n flow logic tests"
else
  echo "$N8N_OUT" | sed 's/^/    /'
  bad "n8n flow logic tests"
fi

if [ "$FAIL" -ne 0 ]; then
  echo "==> verify.sh: FAILURES ABOVE"
  exit 1
fi
echo "==> verify.sh: ALL PASS"
