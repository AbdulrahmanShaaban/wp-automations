#!/usr/bin/env bash
# Login brute-force throttle evidence (audit finding #6).
# 5 failures allowed, 6th POST must answer 429 + Retry-After: 900.
# Body/header are passed via temp FILES - never through command substitution,
# which mangles multi-line bodies on this shell.
set -u
BASE=http://localhost:8889
pass=0; fail=0
ck(){ if [ "$2" = "$3" ]; then echo "PASS  $1 ($3)"; pass=$((pass+1)); else echo "FAIL  $1 expected=[$2] actual=[$3]"; fail=$((fail+1)); fi }

echo "=== 0. reset failure counters ==="
# Web requests arrive from the Docker gateway 172.21.0.1 (see apache logs).
LKEY="siraj_login_fails_$(printf '172.21.0.1' | md5sum | cut -d' ' -f1)"
echo "info  key = $LKEY"
npx @wordpress/env run cli wp transient delete "$LKEY" >/dev/null 2>&1 || true
echo "info  stale counter cleared (delete is a no-op when absent)"

JAR=$(mktemp); HDR=$(mktemp); BF=$(mktemp)
curl.exe -s -c "$JAR" -o /dev/null --max-time 60 "$BASE/wp-login.php"

post_login(){ # post_login <password> -> "CODE|RETRY"
  curl.exe -s -D "$HDR" -o "$BF" -b "$JAR" -c "$JAR" --max-time 60 \
    --data-urlencode "log=admin" \
    --data-urlencode "pwd=$1" \
    --data-urlencode "wp-submit=Log In" \
    --data-urlencode "redirect_to=" \
    --data-urlencode "testcookie=1" \
    "$BASE/wp-login.php"
  C=$(awk 'NR==1{print $2}' "$HDR" | tr -d '\r')
  R=$(grep -i '^Retry-After:' "$HDR" | tr -d '\r\n' | awk '{print $2}')
  echo "${C:-000}|${R:-none}"
}

echo "=== 1. five failed logins stay below the limit ==="
for i in 1 2 3 4 5; do
  OUT=$(post_login "WrongPass$i!")
  CODE=${OUT%%|*}
  echo "info  attempt $i -> HTTP $CODE"
  case "$CODE" in 200|302) pass=$((pass+1));; *) echo "FAIL  attempt $i unexpected status [$CODE]"; fail=$((fail+1));; esac
done

echo "=== 2. sixth attempt throttled ==="
OUT=$(post_login "WrongPass6!")
CODE=${OUT%%|*}; RETRY=${OUT##*|}
echo "info  attempt 6 -> HTTP $CODE Retry-After=$RETRY"
ck "6th attempt status" "429" "$CODE"
ck "Retry-After header" "900" "$RETRY"
if grep -q "كثيرة محاولات الدخول" "$BF"; then echo "PASS  Arabic throttle message present"; pass=$((pass+1)); else echo "FAIL  Arabic throttle message missing"; fail=$((fail+1)); fi

echo "=== 3. stored counter = 5 ==="
CVAL=$(npx @wordpress/env run cli wp transient get "$LKEY" 2>/dev/null | tail -1 | tr -d '\r')
ck "failure counter" "5" "$CVAL"

echo ""
echo "SUMMARY: PASS=$pass FAIL=$fail"
rm -f "$JAR" "$HDR" "$BF"
[ "$fail" -eq 0 ]
