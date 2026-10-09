#!/usr/bin/env bash
# Post-fix security + SEO probe (remediation evidence).
# Run: bash docs/AUDIT/evidence/remediation/probe.sh > docs/AUDIT/evidence/remediation/probe.txt 2>&1
set -u
BASE=http://localhost:8889
pass=0; fail=0
ck(){ # ck <label> <expected> <actual>
  if [ "$2" = "$3" ]; then echo "PASS  $1 ($3)"; pass=$((pass+1));
  else echo "FAIL  $1 expected=[$2] actual=[$3]"; fail=$((fail+1)); fi
}
ckg(){ # ckg <label> <grep-pattern> <file>
  if grep -q "$2" "$3"; then echo "PASS  $1"; pass=$((pass+1));
  else echo "FAIL  $1 pattern=[$2] missing in $3"; fail=$((fail+1)); fi
}
ckn(){ # ckn <label> <grep-pattern> <file>  (must NOT match)
  if grep -q "$2" "$3"; then echo "FAIL  $1 unexpected match=[$2]"; fail=$((fail+1));
  else echo "PASS  $1"; pass=$((pass+1)); fi
}

echo "=== 1. security headers on 5 pages + login ==="
for p in / /services/ /team/ /contact/ /book/ /wp-login.php; do
  f=$(mktemp)
  curl.exe -s -D "$f" -o /dev/null --max-time 60 "$BASE$p"
  echo "--- $p"
  for h in "x-content-type-options: nosniff" "x-frame-options: SAMEORIGIN" "referrer-policy: strict-origin-when-cross-origin" "permissions-policy: geolocation=(), microphone=(), camera=()" "content-security-policy: frame-ancestors 'self'"; do
    if grep -qi "$h" "$f"; then echo "  ok   $h"; pass=$((pass+1)); else echo "  MISS $h"; fail=$((fail+1)); fi
  done
  if grep -qi "x-powered-by" "$f"; then echo "  FAIL x-powered-by still present"; fail=$((fail+1)); else echo "  ok   x-powered-by absent"; pass=$((pass+1)); fi
  rm -f "$f"
done

echo "=== 2. generator tag removed (home) ==="
HOME_HTML=$(mktemp); curl.exe -s --max-time 60 "$BASE/" -o "$HOME_HTML"
ckn "no wp_generator meta" 'name="generator"' "$HOME_HTML"
ckg "og:image present" 'property="og:image"' "$HOME_HTML"
ckg "twitter:card present" 'name="twitter:card"' "$HOME_HTML"
ckg "meta description present" 'name="description"' "$HOME_HTML"
ckg "JSON-LD Dentist present" '"@type":"Dentist"' "$HOME_HTML"
ckg "JSON-LD FAQPage present" '"@type":"FAQPage"' "$HOME_HTML"
TITLE_TXT=$(grep -o '<title>[^<]*</title>' "$HOME_HTML" | head -1 | sed 's/<[^>]*>//g')
TITLE_LEN=$(node -e "console.log([...process.argv[1]].length)" "$TITLE_TXT")
echo "info  home title chars = $TITLE_LEN  [$TITLE_TXT]"
if [ "$TITLE_LEN" -le 63 ]; then echo "PASS  home title <=60 chars"; pass=$((pass+1)); else echo "FAIL  home title too long ($TITLE_LEN)"; fail=$((fail+1)); fi

echo "=== 3. author enumeration -> 404 ==="
A=$(curl.exe -s -o /dev/null -w '%{http_code}' --max-time 60 "$BASE/?author=1")
ck "author=1 status" "404" "$A"
A2=$(curl.exe -s -o /dev/null -w '%{http_code}' --max-time 60 -L "$BASE/author/admin/")
ck "author/admin status" "404" "$A2"

echo "=== 4. xmlrpc blocked ==="
X=$(curl.exe -s -o /dev/null -w '%{http_code}' --max-time 60 -X POST -H "Content-Type: text/xml" -d '<?xml version="1.0"?><methodCall><methodName>system.listMethods</methodName></methodCall>' "$BASE/xmlrpc.php")
ck "xmlrpc POST status" "403" "$X"

echo "=== 5. REST users routes removed for anonymous ==="
U=$(curl.exe -s -o /dev/null -w '%{http_code}' --max-time 60 "$BASE/wp-json/wp/v2/users")
ck "users route status" "404" "$U"
U2=$(curl.exe -s -o /dev/null -w '%{http_code}' --max-time 60 "$BASE/wp-json/wp/v2/users/1")
ck "users/1 route status" "404" "$U2"

echo "=== 6. REST CORS pinned (evil origin not reflected) ==="
C=$(curl.exe -s -D - -o /dev/null --max-time 60 -H "Origin: http://evil.example" "$BASE/wp-json/" | grep -ci "access-control-allow-origin: http://evil.example" || true)
ck "evil origin reflected" "0" "$C"
C2=$(curl.exe -s -D - -o /dev/null --max-time 60 -H "Origin: $BASE" "$BASE/wp-json/" | grep -ci "access-control-allow-origin: $BASE" || true)
ck "own origin allowed" "1" "$C2"
RH=$(mktemp)
curl.exe -s -D "$RH" -o /dev/null --max-time 60 "$BASE/wp-json/"
if grep -qi "x-powered-by" "$RH"; then echo "  FAIL x-powered-by still present on REST"; fail=$((fail+1)); else echo "  PASS x-powered-by absent on REST"; pass=$((pass+1)); fi
rm -f "$RH"

echo "=== 7. case-variant 301 ==="
R=$(curl.exe -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 60 "$BASE/BOOK/")
echo "info  /BOOK/ -> $R"
case "$R" in "301 "*"/book/"*) echo "PASS  /BOOK/ 301 -> /book/"; pass=$((pass+1));; *) echo "FAIL  /BOOK/ got [$R]"; fail=$((fail+1));; esac

echo "=== 8. uploads/.htaccess guard written ==="
HT=$(docker exec wp-env-p3-clinic-4cb4a956-wordpress-1 sh -c 'test -f /var/www/html/wp-content/uploads/.htaccess && cat /var/www/html/wp-content/uploads/.htaccess' 2>/dev/null || true)
if [ -n "$HT" ]; then echo "PASS  uploads/.htaccess exists"; echo "$HT" | sed 's/^/      /'; pass=$((pass+1)); else echo "FAIL  uploads/.htaccess missing"; fail=$((fail+1)); fi

echo "=== 9. WP_DEBUG_DISPLAY off ==="
WDD=$(docker exec wp-env-p3-clinic-4cb4a956-wordpress-1 sh -c 'php -r "require \"/var/www/html/wp-load.php\"; var_export(defined(\"WP_DEBUG_DISPLAY\") ? WP_DEBUG_DISPLAY : null);"' 2>/dev/null | tail -1)
ck "WP_DEBUG_DISPLAY false" "false" "$WDD"

echo "=== 10. per-page meta description + breadcrumb JSON-LD ==="
for p in services team contact book; do
  H=$(mktemp); curl.exe -s --max-time 60 "$BASE/$p/" -o "$H"
  ckg "/$p/ meta description" 'name="description"' "$H"
  ckg "/$p/ BreadcrumbList" '"@type":"BreadcrumbList"' "$H"
  ckg "/$p/ og:url" 'property="og:url"' "$H"
  rm -f "$H"
done

echo "=== 11. no .jpg references left in template ==="
J=$(grep -c 'photo-.*\.jpg' wp-content/themes/siraj-theme/templates/front-page.html || true)
ck "jpg refs in template" "0" "$J"
W=$(grep -c 'photo-.*\.webp' wp-content/themes/siraj-theme/templates/front-page.html || true)
echo "info  webp refs = $W"

echo "=== 12. header CTA points to /book/ ==="
H2=$(mktemp); curl.exe -s --max-time 60 "$BASE/" -o "$H2"
NAVCTA=$(grep -o 'wp-block-button__link[^>]*href="[^"]*"' "$H2" | head -1 | grep -o 'href="[^"]*"')
echo "info  nav CTA = $NAVCTA"
case "$NAVCTA" in *"/book/"*) echo "PASS  nav CTA -> /book/"; pass=$((pass+1));; *) echo "FAIL  nav CTA = $NAVCTA"; fail=$((fail+1));; esac
LANGEN=$(grep -o 'demo-badge" lang="en"' "$H2" | wc -l)
echo "info  header demo-badge lang=en count = $LANGEN"

echo ""
echo "SUMMARY: PASS=$pass FAIL=$fail"
[ "$fail" -eq 0 ]
