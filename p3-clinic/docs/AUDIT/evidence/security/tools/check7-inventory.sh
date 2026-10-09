#!/bin/bash
# check7-inventory.sh — READ-ONLY attack-surface inventory for the P3 security audit.
# Runs inside the wp-env cli container. Writes nothing; prints only.
# Secret rule: salt/DB constants are reported as DEFINED/UNDEFINED + length only.

echo '=== A. WordPress / plugin / theme inventory ==='
wp core version
wp core is-installed && echo 'core installed: yes'
echo '--- plugins ---'
wp plugin list
echo '--- themes ---'
wp theme list
echo '--- users (login + roles only, no email/hash) ---'
wp user list --fields=ID,user_login,roles,display_name
echo '--- options ---'
for o in blogname users_can_register default_comment_status default_ping_status blog_public permalink_structure WPLANG template stylesheet timezone_string gmt_offset; do
  printf '%s=' "$o"
  wp option get "$o" 2>/dev/null || echo 'UNSET'
done

echo ''
echo '=== B. wp-config constant NAMES (values withheld) ==='
wp config list --fields=name

echo ''
echo '=== C. security-relevant constants (non-secret values only) ==='
wp eval '
foreach ( array(
  "WP_DEBUG", "WP_DEBUG_DISPLAY", "WP_DEBUG_LOG", "SCRIPT_DEBUG",
  "DISALLOW_FILE_EDIT", "DISALLOW_FILE_MODS", "AUTOMATIC_UPDATER_DISABLED",
  "DISABLE_WP_CRON", "WP_AUTO_UPDATE_CORE", "WP_HTTP_BLOCK_EXTERNAL",
  "FORCE_SSL_ADMIN", "WP_ENVIRONMENT_TYPE", "FS_METHOD", "WP_MEMORY_LIMIT",
  "WP_ALLOW_REPAIR", "EMPTY_TRASH_DAYS", "WP_POST_REVISIONS",
) as $c ) {
  printf( "%s=%s\n", $c, defined( $c ) ? var_export( constant( $c ), true ) : "UNDEFINED" );
}
'

echo ''
echo '=== D. secret constants: DEFINED/UNDEFINED + length only (never the value) ==='
wp eval '
foreach ( array(
  "AUTH_KEY", "SECURE_AUTH_KEY", "LOGGED_IN_KEY", "NONCE_KEY",
  "AUTH_SALT", "SECURE_AUTH_SALT", "LOGGED_IN_SALT", "NONCE_SALT",
  "DB_NAME", "DB_USER", "DB_PASSWORD", "DB_HOST",
) as $c ) {
  if ( defined( $c ) ) {
    printf( "%s: DEFINED length=%d (value withheld)\n", $c, strlen( (string) constant( $c ) ) );
  } else {
    printf( "%s: UNDEFINED\n", $c );
  }
}
$dupes = array();
foreach ( array( "AUTH_KEY","SECURE_AUTH_KEY","LOGGED_IN_KEY","NONCE_KEY","AUTH_SALT","SECURE_AUTH_SALT","LOGGED_IN_SALT","NONCE_SALT" ) as $c ) {
  $dupes[ (string) constant( $c ) ][] = $c;
}
$identical = 0;
foreach ( $dupes as $val => $names ) { if ( count( $names ) > 1 ) { $identical++; printf( "DUPLICATE secret constant group: %s\n", implode( ",", $names ) ); } }
printf( "distinct-secret-values=%d duplicate-groups=%d\n", count( $dupes ), $identical );
'

echo ''
echo '=== E. PHP ini security surface ==='
php -i | grep -E '^(display_errors|log_errors|error_reporting|expose_php|allow_url_fopen|allow_url_include|open_basedir|disable_functions|Loaded Configuration File|Scan this dir|variables_order) '
echo '--- php version ---'
php -v | head -2

echo ''
echo '=== F. uploads / docroot inventory ==='
echo '--- /var/www/html top level (dotfiles included) ---'
ls -la /var/www/html | head -40
echo '--- wp-content ---'
ls -la /var/www/html/wp-content
echo '--- wp-content/plugins ---'
ls -la /var/www/html/wp-content/plugins
echo '--- uploads tree (depth 2) ---'
find /var/www/html/wp-content/uploads -maxdepth 2 2>/dev/null | head -40
echo '--- .htaccess files anywhere under wp-content ---'
find /var/www/html/wp-content -name '.htaccess' -print 2>/dev/null
echo '--- docroot .htaccess ---'
if [ -f /var/www/html/.htaccess ]; then cat /var/www/html/.htaccess; else echo 'NO DOCROOT .htaccess'; fi
echo '--- any .php under uploads ---'
find /var/www/html/wp-content/uploads -name '*.php' -print 2>/dev/null | head -20
echo "(end php-under-uploads list)"

echo ''
echo '=== G. file permissions of docroot ---'
ls -ld /var/www/html /var/www/html/wp-content /var/www/html/wp-content/uploads 2>/dev/null

echo ''
echo '=== H. installed plugin/theme headers on disk ==='
for f in /var/www/html/wp-content/plugins/*/*.php; do
  echo "--- $f"
  head -20 "$f" | grep -E 'Plugin Name|Version|Requires' || true
done