<?php
/**
 * harden-uploads.php — write a deny-scripts .htaccess into wp-content/uploads.
 * Run: wp eval-file /var/www/html/wp-content/plugins/nilad-core/harden-uploads.php
 * (wired from scripts/seed.sh; idempotent, safe to re-run)
 *
 * Why (docs/AUDIT/security.md #5, GATE-2026-10-06): Apache runs mod_php with
 * AllowOverride All, and uploads/ shipped without any .htaccess — one dropped
 * .php in a dated folder would execute. This denies script handlers at the
 * directory level. Complements exposure-hardening.php (PHP half is this file).
 *
 * @package Nilad
 */

$dir = WP_CONTENT_DIR . '/uploads';
if ( ! is_dir( $dir ) ) {
	wp_mkdir_p( $dir );
}

$rules = <<<'HTACCESS'
# Nilad — deny script execution in uploads (audit security #5, GATE-2026-10-06).
# Apache: mod_php + AllowOverride All; never let an upload run as code.
<FilesMatch "\.(php[0-9]?|phtml|phar|py|pl|cgi|sh)$">
	Require all denied
</FilesMatch>
<FilesMatch "^\.ht">
	Require all denied
</FilesMatch>
php_flag engine off
HTACCESS;

$target = $dir . '/.htaccess';
$wrote  = ( ! file_exists( $target ) ) || file_get_contents( $target ) !== $rules;
if ( $wrote ) {
	file_put_contents( $target, $rules . "\n" );
}
printf( "CHECK uploads-htaccess: %s (%s)\n", $wrote ? 'written' : 'already-present', $target );
