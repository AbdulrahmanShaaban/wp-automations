<?php
/**
 * Exposure hardening — loaded from nilad-core.php.
 *
 * Closes the cheap doors from docs/AUDIT/security.md (GATE-2026-10-06 B7):
 *   security #3 — user enumeration: unauthenticated /wp-json/wp/v2/users and
 *                 author archives (?author=N → /author/admin/)
 *   security #4 — brute-force surface: xmlrpc.php left live for credential
 *                 stuffing, and wp-login.php accepted attempts unthrottled
 *   security #5 — uploads script execution is denied by
 *                 wp-content/uploads/.htaccess (written by harden-uploads.php
 *                 from scripts/seed.sh, this file is the PHP half)
 *
 * All behaviour changes are local-demo appropriate: no REST client uses the
 * public users endpoint in this build, XML-RPC has no legitimate consumer
 * here (WooCommerce REST + n8n use plain HTTPS), and the throttle is
 * per-IP transient based (behind a reverse proxy, REMOTE_ADDR is the proxy —
 * move the key to X-Forwarded-For handling at the proxy layer when deploying).
 *
 * @package Nilad
 */

defined( 'ABSPATH' ) || exit;

/* -------------------------------------------------------------------------
 * 1. User enumeration (security #3)
 * ---------------------------------------------------------------------- */

// 1a. Unauthenticated REST user listing: hide the collection + single-user
// routes entirely (slug, Gravatar hash and is_super_admin were exposed).
add_filter( 'rest_endpoints', static function ( array $endpoints ): array {
	if ( is_user_logged_in() ) {
		return $endpoints;
	}
	unset( $endpoints['/wp/v2/users'] );
	unset( $endpoints['/wp/v2/users/(?P<id>[\d]+)'] );
	return $endpoints;
} );

// 1b. Author archives: /?author=1 used to 301 → /author/admin/ (username
// oracle). Authors are not a browsable surface on this store — send everyone
// home with a permanent redirect.
add_action( 'template_redirect', static function () {
	if ( is_author() ) {
		wp_safe_redirect( home_url( '/' ), 301 );
		exit;
	}
} );

/* -------------------------------------------------------------------------
 * 2. XML-RPC off (security #4a)
 * ---------------------------------------------------------------------- */

// Filter half: anything going through wp_xmlrpc_server gets a clean refusal.
add_filter( 'xmlrpc_enabled', '__return_false' );

// Edge half: xmlrpc.php defines XMLRPC_REQUEST before WP boots, so refuse the
// whole request at plugins_loaded — system.listMethods no longer answers and
// the endpoint stops advertising wp.getUsersBlogs for credential stuffing.
// (WooCommerce/n8n traffic never comes through xmlrpc.php.)
add_action( 'plugins_loaded', static function () {
	if ( defined( 'XMLRPC_REQUEST' ) ) {
		status_header( 403 );
		header( 'Content-Type: text/plain; charset=utf-8' );
		echo 'XML-RPC is disabled.';
		exit;
	}
} );

// Drop the discovery links from the front end.
remove_action( 'wp_head', 'rsd_link' );
remove_action( 'wp_head', 'wlwmanifest_link' );

/* -------------------------------------------------------------------------
 * 3. Login throttle (security #4b)
 * ---------------------------------------------------------------------- */

const NILAD_LOGIN_MAX_FAILS   = 5;
const NILAD_LOGIN_FAIL_WINDOW = 15 * MINUTE_IN_SECONDS;

/**
 * Transient key for a client IP (empty IP → no throttle state).
 */
function nilad_login_fail_key(): string {
	$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? (string) $_SERVER['REMOTE_ADDR'] : '';
	return 'nilad_login_fail_' . md5( $ip );
}

// Gate every wp_login.php attempt: after 5 failures inside the window the
// request is refused before the password is even checked.
add_filter( 'authenticate', static function ( $user ) {
	if ( '' === ( isset( $_SERVER['REMOTE_ADDR'] ) ? (string) $_SERVER['REMOTE_ADDR'] : '' ) ) {
		return $user;
	}
	$fails = (int) get_transient( nilad_login_fail_key() );
	if ( $fails >= NILAD_LOGIN_MAX_FAILS ) {
		return new WP_Error(
			'nilad_login_throttled',
			'محاولات دخول كثيرة. انتظر 15 دقيقة ثم حاول مجددًا.'
		);
	}
	return $user;
}, 30 );

// Count failures (any wrong credentials, missing user, etc.).
add_action( 'wp_login_failed', static function () {
	$fails = (int) get_transient( nilad_login_fail_key() );
	set_transient( nilad_login_fail_key(), $fails + 1, NILAD_LOGIN_FAIL_WINDOW );
} );

// A successful login clears the counter for that IP.
add_action( 'wp_login', static function () {
	delete_transient( nilad_login_fail_key() );
} );
