#!/bin/bash
# check8-cookie-samesite.sh — READ-ONLY: does WordPress 7.1.3 set an explicit
# SameSite attribute on its authentication cookies?

echo '=== A. every SameSite mention in wp-includes ==='
grep -rn 'SameSite\|samesite' /var/www/html/wp-includes --include='*.php' | head -30
echo "(end of SameSite grep)"

echo ''
echo '=== B. the setcookie() calls that issue the auth cookies (context) ==='
sed -n '1185,1200p' /var/www/html/wp-includes/pluggable.php

echo ''
echo '=== C. does wp_set_auth_cookie compute $secure from the request scheme? ==='
sed -n '1150,1195p' /var/www/html/wp-includes/pluggable.php | grep -n -E 'secure|is_ssl|force_ssl_admin' 

echo ''
echo '=== D. what the browser actually received (captured earlier) ==='
echo 'Set-Cookie: wordpress_test_cookie=WP%20Cookie%20check; path=/; HttpOnly'
echo '-> attributes present: Path, HttpOnly'
echo '-> attributes ABSENT: Secure, SameSite'

echo ''
echo '=== E. cookie path/httponly constants ==='
grep -n "define( 'COOKIEPATH'\|define( 'PLUGINS_COOKIE_PATH'\|define( 'ADMIN_COOKIE_PATH'\|define( 'COOKIEHASH'\|define( 'USER_COOKIE'" /var/www/html/wp-includes/default-constants.php