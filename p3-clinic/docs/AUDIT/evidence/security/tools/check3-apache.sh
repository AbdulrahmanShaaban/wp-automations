#!/bin/bash
# check3-apache.sh — READ-ONLY: how Apache/PHP are configured in this container.
# Determines whether a .php file inside wp-content/uploads could execute.

echo '=== Apache version / loaded modules ==='
apache2ctl -v
echo '--- modules of interest ---'
apache2ctl -M 2>/dev/null | grep -Ei 'rewrite|headers|php|authz|filter|mime|dir|autoindex|setenvif|env'

echo ''
echo '=== authz / php handler directives in /etc/apache2 ==='
grep -rn -E 'AllowOverride|Options|ServerTokens|ServerSignature|SetHandler|FilesMatch|Require all (granted|denied)|php_flag|php_admin_(flag|value)|DirectoryIndex|DocumentRoot|Listen' /etc/apache2 2>/dev/null

echo ''
echo '=== enabled conf files ==='
ls -1 /etc/apache2/conf-enabled /etc/apache2/sites-enabled 2>/dev/null

echo ''
echo '=== docker php apache conf (full) ==='
for f in /etc/apache2/conf-enabled/docker-php.conf /etc/apache2/conf-enabled/docker-php-general.conf /etc/apache2/conf-enabled/docker-php-phar-dynamic.conf; do
  echo "--- $f"
  [ -f "$f" ] && cat "$f" || echo '(absent)'
done

echo ''
echo '=== sites-enabled default vhost (full) ==='
for f in /etc/apache2/sites-enabled/*; do echo "--- $f"; cat "$f"; done

echo ''
echo '=== php ini conf.d files (names + security-relevant settings only) ==='
ls -1 /usr/local/etc/php/conf.d/
echo '--- display_errors / expose_php / disable_functions across conf.d ---'
grep -rn -E '^[[:space:]]*(display_errors|expose_php|disable_functions|allow_url_include|open_basedir|error_reporting|log_errors)' /usr/local/etc/php 2>/dev/null

echo ''
echo '=== EFFECTIVE runtime ini under WordPress bootstrap (web code path) ==='
wp eval '
printf( "ini display_errors = %s\n", ini_get( "display_errors" ) );
printf( "ini expose_php = %s\n", ini_get( "expose_php" ) );
printf( "ini display_startup_errors = %s\n", ini_get( "display_startup_errors" ) );
printf( "error_reporting = %d\n", error_reporting() );
printf( "WP_DEBUG=%s WP_DEBUG_DISPLAY=%s WP_DEBUG_LOG=%s\n", var_export( WP_DEBUG, true ), var_export( WP_DEBUG_DISPLAY, true ), var_export( WP_DEBUG_LOG, true ) );
printf( "wp_debug_mode source check: is_admin=%s\n", var_export( is_admin(), true ) );
'
echo '--- wp_debug_mode() relevant lines from core (source, not executed) ---'
grep -n -E "display_errors|WP_DEBUG_DISPLAY|error_reporting" /var/www/html/wp-includes/load.php | head -20
sed -n '/function wp_debug_mode/,/^}/p' /var/www/html/wp-includes/load.php | head -40

echo ''
echo '=== effective uploads execution test WITHOUT writing anything ==='
echo '(no file is created; inference is from the handler config below)'
echo '--- is there a php SetHandler applying to the uploads dir? ---'
grep -rn -E 'SetHandler|AddHandler|AddType|php_value|FilesMatch' /etc/apache2 /var/www/html/wp-content/uploads/.htaccess 2>/dev/null || echo '(none beyond the docker-php.conf shown above)'

echo ''
echo '=== open_basedir / docroot separation ==='
php -r 'echo "open_basedir=", ini_get("open_basedir") === "" ? "(empty)" : ini_get("open_basedir"), PHP_EOL;'