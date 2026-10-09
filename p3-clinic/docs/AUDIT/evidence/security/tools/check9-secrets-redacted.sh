#!/bin/bash
# check9-secrets-redacted.sh — READ-ONLY. Prints wp-config define NAMES with every
# string literal REDACTED, and answers MATCH/DIFFER questions about the salts
# without ever printing a value.

echo '=== A. wp-config.php defines (NAMES only, every literal replaced) ==='
sed -E "s/'[^']*'/'<REDACTED>'/g" /var/www/html/wp-config.php | grep -nE "define\(" | head -60

echo ''
echo '=== B. are the AUTH/SALT constants the wp-env FALLBACK literals (public, known) ? ==='
echo '(method: compare the constant value against the literal fallback written in'
echo ' wp-config.php; only MATCH / DIFFER is reported, never a value)'
wp eval '
$src = file_get_contents( ABSPATH . "wp-config.php" );
$map = array(
  "AUTH_KEY"         => "WORDPRESS_AUTH_KEY",
  "SECURE_AUTH_KEY"  => "WORDPRESS_SECURE_AUTH_KEY",
  "LOGGED_IN_KEY"    => "WORDPRESS_LOGGED_IN_KEY",
  "NONCE_KEY"        => "WORDPRESS_NONCE_KEY",
  "AUTH_SALT"        => "WORDPRESS_AUTH_SALT",
  "SECURE_AUTH_SALT" => "WORDPRESS_SECURE_AUTH_SALT",
  "LOGGED_IN_SALT"   => "WORDPRESS_LOGGED_IN_SALT",
  "NONCE_SALT"       => "WORDPRESS_NONCE_SALT",
  "DB_PASSWORD"      => "WORDPRESS_DB_PASSWORD",
);
foreach ( $map as $const => $env ) {
  if ( ! preg_match( "/getenv_docker\(\s*\x27" . preg_quote( $env, "/" ) . "\x27\s*,\s*\x27([^\x27]*)\x27\s*\)/", $src, $m ) ) {
    printf( "%-18s fallback-literal: NOT FOUND in wp-config.php\n", $const );
    continue;
  }
  $fallback = $m[1];
  $live     = (string) constant( $const );
  $verdict  = ( $fallback === $live ) ? "MATCH (live value IS the hardcoded fallback)" : "DIFFER (live value came from the environment)";
  printf( "%-18s fallback-len=%-3d live-len=%-3d %s\n", $const, strlen( $fallback ), strlen( $live ), $verdict );
}
'

echo ''
echo '=== C. is the fallback identical to a value published in the wp-env image? ==='
echo '(no network; instead: how many of the 8 keys/salts share the SAME fallback)'
wp eval '
$src = file_get_contents( ABSPATH . "wp-config.php" );
preg_match_all( "/getenv_docker\(\s*\x27WORDPRESS_(?:AUTH|SECURE_AUTH|LOGGED_IN|NONCE)_(?:KEY|SALT)\x27\s*,\s*\x27([^\x27]*)\x27\s*\)/", $src, $m );
$uniq = array_unique( $m[1] );
printf( "fallback-literals-found=%d distinct=%d\n", count( $m[1] ), count( $uniq ) );
'

echo ''
echo '=== D. wp-config.php readable as a static file? ==='
ls -l /var/www/html/wp-config.php
echo '--- .htaccess protection of wp-config? ---'
grep -n -i 'wp-config' /var/www/html/.htaccess || echo '(no wp-config rule in the docroot .htaccess)'
echo '--- what Apache does with it: the httpd config has no <Files wp-config.php> deny,'
echo '    so the request is handled by mod_php (executed, no source returned)'

echo ''
echo '=== E. wp-cli.yml in the docroot ==='
cat /var/www/html/wp-cli.yml
ls -l /var/www/html/wp-cli.yml