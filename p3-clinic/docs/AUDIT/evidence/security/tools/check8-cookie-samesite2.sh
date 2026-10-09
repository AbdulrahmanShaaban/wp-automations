#!/bin/bash
# check8-cookie-samesite2.sh — BusyBox grep has no --include; use find + grep.

echo '=== A. every SameSite mention under wp-includes ==='
find /var/www/html/wp-includes -name '*.php' -type f -exec grep -l 'SameSite' {} \; 2>/dev/null | head -20
echo '--- occurrences with context ---'
find /var/www/html/wp-includes -name '*.php' -type f -exec grep -n 'SameSite' {} \; 2>/dev/null | head -20
echo "(end)"

echo ''
echo '=== B. wp_set_auth_cookie: how $secure is derived ==='
awk '/^function wp_set_auth_cookie/,/^}/' /var/www/html/wp-includes/pluggable.php | grep -n -E 'secure|is_ssl|SECURE_AUTH|LOGGED_IN_COOKIE|AUTH_COOKIE' | head -25

echo ''
echo '=== C. any SameSite set by the theme or the plugin? ==='
find /var/www/html/wp-content/themes/siraj-theme /var/www/html/wp-content/plugins/siraj-core -type f -exec grep -n 'setcookie\|SameSite\|session_set_cookie_params' {} \; 2>/dev/null
echo '(no output above = neither project file touches cookies)'

echo ''
echo '=== D. session cookie params used by core for the LOGGED_IN cookie path ==='
find /var/www/html/wp-includes -name 'pluggable.php' -exec grep -n "COOKIEPATH\|COOKIE_DOMAIN" {} \; 2>/dev/null | head -6