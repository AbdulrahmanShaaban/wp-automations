#!/usr/bin/env bash
# verify.sh — foundation checks for the Siraj demo. Exits non-zero on any failure.
set -euo pipefail
cd "$(dirname "$0")/.."

# Git Bash (MSYS) rewrites POSIX-looking args (/var/www/...) into Windows paths,
# which breaks `wp-env run ... php -l <path>`. Scope the conversion OFF to the
# container commands ONLY — exporting it globally also stops bash from rewriting
# `-o /dev/null` for the native mingw curl (curl then exits 23 after printing
# the code, producing "200000").
wp()      { MSYS2_ARG_CONV_EXCL='*' MSYS_NO_PATHCONV=1 npx @wordpress/env run cli wp "$@"; }
php_lint(){ MSYS2_ARG_CONV_EXCL='*' MSYS_NO_PATHCONV=1 npx @wordpress/env run cli php -l "$1" >/dev/null 2>&1; }

FAIL=0
ok()  { echo "  PASS: $1"; }
bad() { echo "  FAIL: $1"; FAIL=1; }

echo "==> verify.sh"

# 1. Core + PHP versions
CORE="$(wp core version || echo MISSING)"
case "$CORE" in
  MISSING) bad "wp core version" ;;
  *) ok "WordPress $CORE" ;;
esac

# 2. Active plugin = siraj-core; active theme = siraj-theme; NO woocommerce.
PLUGINS="$(wp plugin list --status=active --field=name || true)"
echo "$PLUGINS" | grep -qx 'siraj-core' && ok "siraj-core active" || bad "siraj-core active"
case "$PLUGINS" in
  *woocommerce*) bad "woocommerce NOT active (P3 is a booking demo, no store)" ;;
  *) ok "woocommerce absent" ;;
esac
THEME="$(wp theme list --status=active --field=name || true)"
echo "$THEME" | grep -qx 'siraj-theme' && ok "siraj-theme active" || bad "siraj-theme active"

# 3. Seeded pages (4) + front page + no sample-page / hello-world.
PAGES="$(wp post list --post_type=page --post_status=publish --field=post_name | sort | tr '\n' ' ')"
for p in home services team contact; do
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
POSTS="$(wp post list --post_type=post --post_status=any --field=post_name || true)"
case "$POSTS" in
  *hello-world*) bad "hello-world removed" ;;
  *) ok "hello-world removed" ;;
esac

# 4. Locale + permalinks
LOCALE="$(wp option get WPLANG || true)"
[ "$LOCALE" = "ar" ] && ok "WPLANG=ar" || bad "WPLANG=ar (got: ${LOCALE:-empty})"
PERMA="$(wp option get permalink_structure || true)"
[ "$PERMA" = "/%postname%/" ] && ok "permalinks /%postname%/" || bad "permalinks (got: ${PERMA:-empty})"

# 4b. php-tune active: opcache must NOT revalidate (bind-mount perf fix —
#     conf.d/zz-siraj-perf.ini written by scripts/php-tune.js via afterStart).
VTS="$(wp eval 'echo ini_get("opcache.validate_timestamps");' 2>/dev/null | tr -d '\r' | grep -E '^[0-9]+$' | tail -n1 || true)"
[ "$VTS" = "0" ] && ok "php-tune active (opcache.validate_timestamps=0)" || bad "php-tune active (got: ${VTS:-empty})"

# 5. Homepage renders: brand + hero marker RX—001 + theme stylesheet (retry —
#    the first request right after a cold start can return a partial body).
HOME_HTML=""
for i in 1 2 3; do
  HOME_HTML="$(curl -fsS http://localhost:8889/ 2>/dev/null || echo '')"
  case "$HOME_HTML" in
    *"عيادة سِراج"*"RX—001"*) break ;;
  esac
  sleep 3
done
if [ -z "$HOME_HTML" ]; then
  bad "homepage HTTP 200"
else
  ok "homepage HTTP 200"
  case "$HOME_HTML" in
    *"عيادة سِراج"*) ok "brand rendered" ;;
    *) bad "brand rendered" ;;
  esac
  case "$HOME_HTML" in
    *RX—001*) ok "hero RX—001 rendered (front-page template)" ;;
    *)        bad "hero RX—001 rendered (front-page template)" ;;
  esac
  case "$HOME_HTML" in
    *wp-content/themes/siraj-theme/style.css*) ok "theme stylesheet loaded" ;;
    *) bad "theme stylesheet loaded" ;;
  esac
  # WP 7.1 prints <html dir="rtl" lang="ar"> (dir first) — assert both halves.
  # NOTE: do NOT use `printf | grep -q` here. With `set -o pipefail` and a page
  # body bigger than the pipe buffer (~64 KB), grep -q exits at the first match,
  # printf dies on SIGPIPE and the pipeline reports failure — a false negative
  # that only appeared once the front page grew past 64 KB.
  RTL_OK=0; LANG_OK=0
  case "$HOME_HTML" in *'dir="rtl"'*) RTL_OK=1 ;; esac
  case "$HOME_HTML" in *'lang="ar"'*) LANG_OK=1 ;; esac
  if [ "$RTL_OK" = "1" ] && [ "$LANG_OK" = "1" ]; then
    ok "html dir=rtl lang=ar"
  else
    bad "html dir=rtl lang=ar (dir=$RTL_OK lang=$LANG_OK)"
  fi
fi

# 6. Subpages + booking page return 200
for p in services team contact book; do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:8889/$p/" || echo 000)"
  [ "$CODE" = "200" ] && ok "GET /$p/ -> 200" || bad "GET /$p/ -> 200 (got $CODE)"
done

# Encoding gate: a PowerShell Get-Content/Set-Content round-trip on this file
  # double-encoded the Arabic once (mojibake shipped to the browser). Assert real
  # Arabic section copy is still served, and that no mojibake signature is.
  ENC_OK=0
  case "$HOME_HTML" in *'مسار العمل'*) ENC_OK=1 ;; esac
  if [ "$ENC_OK" = "1" ]; then
    ok "front page serves Arabic copy (مسار العمل)"
  else
    bad "front page Arabic copy missing (double-encoded template?)"
  fi
  case "$HOME_HTML" in
    *'Ã'*|*'Ø'*|*'Ù'*|*'�'*)
      bad "mojibake signature in front page (UTF-8 got re-encoded)" ;;
    *)
      ok "no mojibake signature in front page" ;;
  esac

# 6b. Content build (2026-10-07): booking form renders, sections exist, and every
#     theme image referenced by the front page actually resolves.
BOOK_HTML="$(curl -fsS http://localhost:8889/book/ 2>/dev/null || echo '')"
case "$BOOK_HTML" in
  *siraj-booking*) ok "booking form rendered on /book/" ;;
  *) bad "booking form rendered on /book/" ;;
esac
case "$BOOK_HTML" in
  *siraj_booking_submit*) ok "booking nonce field present" ;;
  *) bad "booking nonce field present" ;;
esac
case "$BOOK_HTML" in
  *siraj_website*) ok "booking honeypot present" ;;
  *) bad "booking honeypot present" ;;
esac
case "$BOOK_HTML" in
  *"[siraj_booking]"*) bad "shortcode rendered raw (do_shortcode not applied)" ;;
  *) ok "shortcode rendered (no raw [siraj_booking] on the page)" ;;
esac

case "$HOME_HTML" in
  *'id="services"'*'id="team"'*'id="faq"'*) ok "home sections: services/team/faq" ;;
  *) bad "home sections: services/team/faq" ;;
esac
case "$HOME_HTML" in
  *'href="/book/"'*) ok "booking CTA links to /book/" ;;
  *) bad "booking CTA links to /book/" ;;
esac

# Every <img src="/wp-content/themes/siraj-theme/..."> in the front page must 200,
# and the demo must ship no photo of a person (design/content rule).
IMG_LIST="$(printf '%s' "$HOME_HTML" \
  | grep -oE 'src="/wp-content/themes/siraj-theme/assets/img/[^"]+"' \
  | sed -E 's/^src="//; s/"$//' | sort -u || true)"
IMG_COUNT="$(printf '%s\n' "$IMG_LIST" | grep -c . || true)"
if [ "${IMG_COUNT:-0}" -ge 4 ]; then
  ok "home page references $IMG_COUNT theme images"
else
  bad "home page references theme images (found ${IMG_COUNT:-0}, expected >= 4)"
fi
for src in $IMG_LIST; do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:8889$src" || echo 000)"
  [ "$CODE" = "200" ] && ok "image 200: ${src##*/}" || bad "image 200: ${src##*/} (got $CODE)"
done
if printf '%s' "$HOME_HTML" | grep -qE 'photo-(ortho|exam)\.jpg'; then
  bad "gate: no people photos on the page (found team-ortho/band-exam)"
else
  ok "gate: no people photos referenced (team-ortho / band-exam banned)"
fi
THEME_IMGS="$(ls "wp-content/themes/siraj-theme/assets/img" 2>/dev/null | grep -E 'ortho|exam' || true)"
[ -z "$THEME_IMGS" ] && ok "gate: banned photos absent from theme assets" \
  || bad "gate: banned photos in theme assets: $THEME_IMGS"

# 7. PHP lint of plugin + seed + theme functions (inside container)
for f in \
  /var/www/html/wp-content/plugins/siraj-core/siraj-core.php \
  /var/www/html/wp-content/plugins/siraj-core/booking.php \
  /var/www/html/wp-content/plugins/siraj-core/hardening.php \
  /var/www/html/wp-content/plugins/siraj-core/seo.php \
  /var/www/html/wp-content/plugins/siraj-core/seed-wp.php \
  /var/www/html/wp-content/plugins/siraj-core/notifier.php \
  /var/www/html/wp-content/themes/siraj-theme/functions.php; do
  if php_lint "$f"; then
    ok "php -l ${f##*/}"
  else
    bad "php -l ${f##*/}"
  fi
done

# 8. Design gates (design/APPROVED.md): letter-spacing only ever 0 (the
#    "0 only" reset — nonzero tracking is banned), no Cairo/Inter fonts
#    (the stamp may SAY the city "Cairo" — only font declarations count),
#    self-hosted fonts present.
THEME_DIR="wp-content/themes/siraj-theme"
LS_RAW="$(grep -rhoE --include='*.css' --include='*.php' --include='*.html' --include='*.json' 'letter-spacing[[:space:]]*:[^;}]*' "$THEME_DIR" 2>/dev/null || true)"
LS_BAD="$(printf '%s\n' "$LS_RAW" | grep -vE ':[[:space:]]*0[[:space:]]*$' | grep -vE '^[[:space:]]*$' || true)"
if [ -n "$LS_BAD" ]; then
  printf '%s\n' "$LS_BAD" | sed 's/^/    /'
  bad "gate: letter-spacing value must be 0 (design ban)"
else
  ok "gate: letter-spacing only 0/absent in theme"
fi
if grep -rniE --include='*.css' --include='*.php' --include='*.html' --include='*.json' 'font-family[^;}]*\b(Cairo|Inter)\b|family=(Cairo|Inter)\b' "$THEME_DIR" >/dev/null 2>&1; then
  grep -rniE --include='*.css' --include='*.php' --include='*.html' --include='*.json' 'font-family[^;}]*\b(Cairo|Inter)\b|family=(Cairo|Inter)\b' "$THEME_DIR" | sed 's/^/    /'
  bad "gate: no Cairo/Inter font in theme"
else
  ok "gate: no Cairo/Inter font in theme"
fi
[ -f "$THEME_DIR/assets/css/fonts.css" ] && ok "gate: self-hosted fonts.css" || bad "gate: self-hosted fonts.css"
[ -f "$THEME_DIR/assets/fonts/alexandria-arabic.woff2" ] && ok "gate: alexandria-arabic.woff2" || bad "gate: alexandria-arabic.woff2"
[ -f "$THEME_DIR/assets/fonts/alexandria-latin.woff2" ] && ok "gate: alexandria-latin.woff2" || bad "gate: alexandria-latin.woff2"

if [ "$FAIL" -ne 0 ]; then
  echo "==> verify.sh: FAILURES ABOVE"
  exit 1
fi
echo "==> verify.sh: ALL PASS"
