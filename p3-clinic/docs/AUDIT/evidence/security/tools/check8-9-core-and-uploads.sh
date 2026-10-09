#!/bin/bash
# check8-9-core-and-uploads.sh — READ-ONLY: core defaults that decide cookie
# flags and cron reachability, plus the real content of wp-content/uploads.

echo '=== A. what is actually inside wp-content/uploads ==='
find /var/www/html/wp-content/uploads -type f | head -40
echo "file-count=$(find /var/www/html/wp-content/uploads -type f | wc -l)"
echo '--- any executable-ish extension anywhere in uploads ---'
find /var/www/html/wp-content/uploads -type f \( -name '*.php' -o -name '*.phtml' -o -name '*.phar' -o -name '*.cgi' -o -name '*.pl' \) | head
echo '(end)'

echo ''
echo '=== B. auth cookie flags as core sets them (source, not executed) ==='
grep -n -A6 'function wp_set_auth_cookie' /var/www/html/wp-includes/pluggable.php | head -40
echo '--- setcookie calls with their flags ---'
grep -n 'setcookie(' /var/www/html/wp-includes/pluggable.php | head -20
echo '--- SameSite handling ---'
grep -rn 'SameSite' /var/www/html/wp-includes/pluggable.php /var/www/html/wp-includes/functions.php | head -10
echo '--- wp_cookie_constants ---'
grep -n -A12 'function wp_cookie_constants' /var/www/html/wp-includes/pluggable.php | head -20

echo ''
echo '=== C. does core ship an uploads .htaccess? (WordPress never writes one) ==='
grep -rn "uploads" /var/www/html/wp-admin/includes/misc.php | grep -i 'htaccess' | head -5
echo '(grep done: WP has no built-in uploads .htaccess generator)'

echo ''
echo '=== D. cron reachability + hook inventory ==='
wp eval '
printf( "DISABLE_WP_CRON defined: %s\n", defined( "DISABLE_WP_CRON" ) ? var_export( DISABLE_WP_CRON, true ) : "no" );
printf( "ALTERNATE_WP_CRON: %s\n", defined( "ALTERNATE_WP_CRON" ) ? var_export( ALTERNATE_WP_CRON, true ) : "no" );
printf( "doing_cron: %s\n", defined( "DOING_CRON" ) ? "yes" : "no" );
'
echo '--- is wp-cron.php linked from any page? ---'
grep -o 'wp-cron[^"]*' /var/www/html/wp-includes/default-filters.php | head -3
grep -n 'wp_cron' /var/www/html/wp-includes/default-filters.php | head -5

echo ''
echo '=== E. does anything in project code send mail or make outbound requests? ==='
for f in /var/www/html/wp-content/plugins/siraj-core/*.php /var/www/html/wp-content/themes/siraj-theme/functions.php; do
  printf '%s: wp_mail=%s curl=%s file_get_contents-http=%s fsockopen=%s wp_remote=%s\n' \
    "$(basename "$f")" \
    "$(grep -c 'wp_mail' "$f")" \
    "$(grep -c 'curl_' "$f")" \
    "$(grep -cE 'file_get_contents\(.https?://' "$f")" \
    "$(grep -c 'fsockopen' "$f")" \
    "$(grep -cE 'wp_remote_(get|post|request)' "$f")"
done

echo ''
echo '=== F. plugin/theme version headers + text domain / i18n ==='
grep -rn 'load_plugin_textdomain\|load_theme_textdomain' /var/www/html/wp-content/plugins/siraj-core /var/www/html/wp-content/themes/siraj-theme 2>/dev/null | head
echo '(no textdomain loader = __() calls fall back to the msgid, i18n note only)'

echo ''
echo '=== G. file checksums of audited project files (reproducibility) ==='
md5sum /var/www/html/wp-content/plugins/siraj-core/*.php /var/www/html/wp-content/themes/siraj-theme/functions.php /var/www/html/wp-config.php 2>/dev/null

echo ''
echo '=== H. wp-config.php: which hardening constants exist (names only) ==='
grep -nE "define\(" /var/www/html/wp-config.php | sed -E "s/, *'[^']*'\s*\)\s*;/, <value withheld> );/"