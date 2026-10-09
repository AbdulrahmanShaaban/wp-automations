#!/usr/bin/env bash
# Booking rate-limit evidence (audit finding #7).
# Envelope allows 6 posts/IP-hash per 10 minutes; the 7th gets the same
# generic message as any envelope failure and stops before validation.
# Bodies stay in temp FILES (multi-line safety), counters verified via
# `wp transient get` because `wp option list` hides transient rows.
set -u
BASE=http://localhost:8889
pass=0; fail=0
ck(){ if [ "$2" = "$3" ]; then echo "PASS  $1 ($3)"; pass=$((pass+1)); else echo "FAIL  $1 expected=[$2] actual=[$3]"; fail=$((fail+1)); fi }

# Resolve the throttle key exactly like booking.php does: HMAC-SHA256 of
# REMOTE_ADDR keyed with NONCE_SALT (read from wp-config, env NOT_SET so the
# fallback literal applies), truncated to 16 hex chars.
SALT=$(docker exec wp-env-p3-clinic-4cb4a956-wordpress-1 sh -c 'grep NONCE_SALT /var/www/html/wp-config.php' | grep -oE '[0-9a-f]{40}' | tail -1)
TKEY=$(node -e "const c=require('crypto');console.log('siraj_bk_t_'+c.createHmac('sha256',process.argv[1]).update('172.21.0.1').digest('hex').slice(0,16))" "$SALT")

echo "=== 0. reset throttle keys + booking count ==="
echo "info  throttle key = $TKEY"
npx @wordpress/env run cli wp transient delete "$TKEY" >/dev/null 2>&1 || true
echo "info  stale counter cleared (delete is a no-op when absent)"
BEFORE=$(npx @wordpress/env run cli wp post list --post_type=siraj_booking --format=ids 2>/dev/null | tail -1)
BEFORE=$(echo "$BEFORE" | wc -w | tr -d ' ')
echo "info  siraj_booking posts before = $BEFORE"

echo "=== 1. fetch a fresh nonce ==="
PAGE=$(mktemp)
curl.exe -s --max-time 60 "$BASE/book/" -o "$PAGE"
NONCE=$(grep -o 'name="siraj_booking_submit" value="[^"]*"' "$PAGE" | head -1 | sed 's/.*value="//;s/"//')
if [ -n "$NONCE" ]; then echo "PASS  nonce extracted"; pass=$((pass+1)); else echo "FAIL  nonce missing"; fail=$((fail+1)); fi
rm -f "$PAGE"

BF=$(mktemp)
post(){ # post <phone> - body into $BF
  curl.exe -s -o "$BF" --max-time 60 \
    --data-urlencode "siraj_booking_form=1" \
    --data-urlencode "siraj_booking_submit=$NONCE" \
    --data-urlencode "siraj_name=اختبار" \
    --data-urlencode "siraj_phone=$1" \
    --data-urlencode "siraj_service=filling" \
    --data-urlencode "siraj_consent=1" \
    --data-urlencode "siraj_website=" \
    "$BASE/book/"
}

GENERIC='تعذّر إرسال الطلب، من فضلك أعد المحاولة.'
PHONE_ERR='رقم الموبايل غير صحيح'

echo "=== 2. attempts 1..6 pass the envelope (phone error) ==="
for i in 1 2 3 4 5 6; do
  post "123"
  if grep -q "$PHONE_ERR" "$BF"; then
    echo "info  attempt $i -> validation error (envelope counted)"
    pass=$((pass+1))
  elif grep -q "$GENERIC" "$BF"; then
    echo "FAIL  attempt $i -> generic (throttled earlier than expected)"
    fail=$((fail+1))
  else
    echo "FAIL  attempt $i -> neither marker"
    fail=$((fail+1))
  fi
done

echo "=== 3. attempt 7 blocked by throttle ==="
post "123"
if grep -q "$GENERIC" "$BF"; then echo "PASS  7th attempt generic envelope message"; pass=$((pass+1)); else echo "FAIL  7th attempt missing generic message"; fail=$((fail+1)); fi
if grep -q "$PHONE_ERR" "$BF"; then echo "FAIL  7th attempt leaked validation (not throttled)"; fail=$((fail+1)); else echo "PASS  7th attempt did not reach validation"; pass=$((pass+1)); fi

echo "=== 4. stored counter = 6, no bookings created ==="
CVAL=$(npx @wordpress/env run cli wp transient get "$TKEY" 2>/dev/null | tail -1 | tr -d '\r')
ck "throttle counter" "6" "$CVAL"
AFTER=$(npx @wordpress/env run cli wp post list --post_type=siraj_booking --format=ids 2>/dev/null | tail -1)
AFTER=$(echo "$AFTER" | wc -w | tr -d ' ')
ck "booking posts unchanged" "$BEFORE" "$AFTER"

echo ""
echo "SUMMARY: PASS=$pass FAIL=$fail"
rm -f "$BF"
[ "$fail" -eq 0 ]
