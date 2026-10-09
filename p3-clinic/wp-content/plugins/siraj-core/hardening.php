<?php
/**
 * hardening.php — security headers and exposure hardening for the demo.
 *
 * Why in a plugin, not Apache: wp-env's container does not compile
 * mod_headers, so a .htaccess cannot send response headers here (measured in
 * docs/AUDIT/security.md finding #2), and .htaccess rules would not travel
 * with the handoff source anyway. Everything below is PHP that ships with the
 * source and re-applies itself on every boot.
 *
 * What this file does NOT do (deployment items, documented in README.md):
 * shuffle the wp-config salts, rename the admin user, rate-limit at the edge,
 * send Cache-Control on static files, HSTS/CSP for a real hostname.
 *
 * @package Siraj
 */

defined( 'ABSPATH' ) || exit;

/* -------------------------------------------------------------------------
 * 1. Front-end security headers (audit finding #2).
 *
 * wp-login.php never runs the main query, so `send_headers` alone leaves it
 * bare — the same helper also runs on `login_init`.
 * ---------------------------------------------------------------------- */
function siraj_send_security_headers() {
	if ( headers_sent() ) {
		return;
	}

	header_remove( 'X-Powered-By' );
	header( 'X-Content-Type-Options: nosniff' );
	header( 'X-Frame-Options: SAMEORIGIN' );
	header( 'Referrer-Policy: strict-origin-when-cross-origin' );
	header( 'Permissions-Policy: geolocation=(), microphone=(), camera=()' );
	header( "Content-Security-Policy: frame-ancestors 'self'; object-src 'none'" );
}
add_action( 'send_headers', 'siraj_send_security_headers' );
add_action( 'login_init', 'siraj_send_security_headers' );
// REST requests exit during parse_request (before send_headers) and never
// fire login_init — cover them on init, which every bootstrap path runs.
add_action( 'init', 'siraj_send_security_headers', 0 );

/* -------------------------------------------------------------------------
 * 2. Stop the head from advertising versions (audit finding #9).
 * ---------------------------------------------------------------------- */
remove_action( 'wp_head', 'wp_generator' );
remove_action( 'wp_head', 'rsd_link' );

/* -------------------------------------------------------------------------
 * 3. Kill XML-RPC at HTTP level (audit finding #5).
 *
 * XMLRPC_REQUEST is defined by xmlrpc.php itself before WP boots, so an
 * early `init` hook turns every xmlrpc.php request into a 403 before a single
 * method is dispatched — the same effect as an Apache <Files> deny, but it
 * travels with the source instead of living in a container config.
 * ---------------------------------------------------------------------- */
add_action( 'init', static function () {
	if ( defined( 'XMLRPC_REQUEST' ) && XMLRPC_REQUEST ) {
		status_header( 403 );
		header( 'Content-Type: text/plain; charset=utf-8' );
		echo 'XML-RPC is disabled on this site.';
		exit;
	}
}, 0 );

add_filter( 'xmlrpc_enabled', '__return_false' );

/* -------------------------------------------------------------------------
 * 4. Author archives answer 404 (audit finding #4).
 *
 * /?author=1 used to render a 200 page whose title embedded the admin login.
 * The REST user routes already leak nothing ([] / 401), so the archive is the
 * only surviving enumeration channel.
 * ---------------------------------------------------------------------- */
add_action( 'template_redirect', static function () {
	if ( is_author() ) {
		global $wp_query;
		$wp_query->set_404();
		status_header( 404 );
		nocache_headers();
	}
} );

/* -------------------------------------------------------------------------
 * 5. Remove the REST user routes for anonymous callers (audit finding #4).
 *
 * Logged-in sessions (wp-admin, app passwords) keep every route; anonymous
 * requests lose /wp/v2/users* entirely instead of getting [] / 401.
 * ---------------------------------------------------------------------- */
add_filter( 'rest_endpoints', static function ( $endpoints ) {
	if ( is_user_logged_in() ) {
		return $endpoints;
	}

	foreach ( array_keys( $endpoints ) as $route ) {
		if ( 0 === strpos( $route, '/wp/v2/users' ) ) {
			unset( $endpoints[ $route ] );
		}
	}

	return $endpoints;
} );

/* -------------------------------------------------------------------------
 * 6. Pin REST CORS to this site's own origins (audit finding #11).
 *
 * Core's rest_send_cors_headers() (WP 7.1) reflects ANY Origin back with
 * Allow-Credentials: true — measured with Origin: http://evil.example. It is
 * registered inside rest_api_default_filters() on rest_api_init (priority 10),
 * i.e. AFTER plugins load, so removing it at plugin-load time is a no-op:
 * the removal must itself run later on rest_api_init (priority 99).
 * Our own allowlisted emitter sits on rest_pre_serve_request (priority 10).
 * ---------------------------------------------------------------------- */
add_action( 'rest_api_init', static function () {
	remove_filter( 'rest_pre_serve_request', 'rest_send_cors_headers' );
}, 99 );

add_filter( 'rest_pre_serve_request', static function ( $value ) {
	$origin = get_http_origin();

	if ( $origin ) {
		header( 'Vary: Origin' );

		// is_allowed_http_origin() alone is not enough here: core's
		// get_allowed_http_origins() strips the port (returns
		// http://localhost, not http://localhost:8889), so a non-standard
		// dev port would never match. Compare against home_url()/site_url()
		// directly, slash-normalized, and keep core's allowlist as an OR.
		$allowed = array_map(
			'untrailingslashit',
			array_merge( array( home_url(), site_url() ), get_allowed_http_origins() )
		);

		if ( in_array( untrailingslashit( $origin ), $allowed, true ) ) {
			header( 'Access-Control-Allow-Origin: ' . esc_url_raw( $origin ) );
			header( 'Access-Control-Allow-Credentials: true' );
		}
	}

	return $value;
}, 10 );

/* -------------------------------------------------------------------------
 * 7. Brute-force control on wp-login.php (audit finding #6).
 *
 * Five failed attempts per IP in 15 minutes answers 429 + Retry-After for the
 * rest of the window; a successful login clears the counter.
 * ---------------------------------------------------------------------- */
/**
 * Transient key for the login-failure counter of the current remote address.
 *
 * @return string Key, or '' when the server exposed no address.
 */
function siraj_login_fail_key() {
	if ( ! isset( $_SERVER['REMOTE_ADDR'] ) ) {
		return '';
	}

	$ip = sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) );

	return '' === $ip ? '' : 'siraj_login_fails_' . md5( $ip );
}

add_action( 'wp_login_failed', static function () {
	$key = siraj_login_fail_key();

	if ( '' === $key ) {
		return;
	}

	$hits = (int) get_transient( $key );
	set_transient( $key, $hits + 1, 15 * MINUTE_IN_SECONDS );
} );

add_action( 'login_init', static function () {
	if ( ! isset( $_POST['log'] ) ) {
		return;
	}

	$key = siraj_login_fail_key();

	if ( '' === $key ) {
		return;
	}

	if ( (int) get_transient( $key ) >= 5 ) {
		status_header( 429 );
		header( 'Retry-After: 900' );
		wp_die(
			'كثيرة محاولات الدخول من عنوانك — أعد المحاولة بعد 15 دقيقة.',
			'مهلة مؤقتة',
			array( 'response' => 429 )
		);
	}
} );

add_action( 'wp_login', static function () {
	$key = siraj_login_fail_key();

	if ( '' !== $key ) {
		delete_transient( $key );
	}
} );

/* -------------------------------------------------------------------------
 * 8. Script-execution guard for wp-content/uploads (audit finding #13).
 *
 * The media library is empty and no form has a file input today; this is the
 * guard for the day one exists. Apache serves the directory directly, so PHP
 * has to write the rule once.
 * ---------------------------------------------------------------------- */
add_action( 'init', static function () {
	$dir = wp_upload_dir();

	if ( ! empty( $dir['error'] ) ) {
		return;
	}

	$file = trailingslashit( $dir['basedir'] ) . '.htaccess';

	if ( file_exists( $file ) ) {
		return;
	}

	$rule = "<FilesMatch \"\\.(php|phtml|phar|cgi|pl|py)$\">\n  Require all denied\n</FilesMatch>\n";

	// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
	@file_put_contents( $file, $rule );
} );

/* -------------------------------------------------------------------------
 * 9. Close comments on anything new (audit finding #16).
 * ---------------------------------------------------------------------- */
add_action( 'init', static function () {
	if ( 'closed' !== get_option( 'default_comment_status' ) ) {
		update_option( 'default_comment_status', 'closed' );
	}
} );

/* -------------------------------------------------------------------------
 * 10. 301 the case-variant URLs to lowercase (perf-seo finding L1).
 *
 * /BOOK/ used to answer 200 (duplicate render); now every request whose path
 * differs from its lowercase form redirects to the canonical case.
 * ---------------------------------------------------------------------- */
add_action( 'template_redirect', static function () {
	$uri = isset( $_SERVER['REQUEST_URI'] ) ? wp_unslash( $_SERVER['REQUEST_URI'] ) : '/';

	$path = wp_parse_url( $uri, PHP_URL_PATH );

	if ( ! is_string( $path ) || '' === $path || $path === strtolower( $path ) ) {
		return;
	}

	$query = isset( $_SERVER['QUERY_STRING'] ) && '' !== $_SERVER['QUERY_STRING']
		? '?' . sanitize_text_field( wp_unslash( $_SERVER['QUERY_STRING'] ) )
		: '';

	wp_safe_redirect( home_url( strtolower( $path ) . $query ), 301 );
	exit;
} );
