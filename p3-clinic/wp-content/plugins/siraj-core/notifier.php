<?php
/**
 * notifier.php — fires a signed webhook to the owner's n8n when a booking is created.
 *
 * Signature scheme (mirrored by n8n Code node + scripts/n8n-sink.js):
 *   X-Siraj-Timestamp: unix seconds
 *   X-Siraj-Signature: v1=<hex( HMAC-SHA256( "<timestamp>." + rawBody, secret ) )>
 *
 * Options (empty url OR empty secret = notifier disabled):
 *   siraj_n8n_webhook_url  — full webhook URL, e.g. https://n8n.example.com/webhook/siraj-booking
 *   siraj_n8n_secret       — shared secret (hex), same value as SIRAJ_N8N_SECRET in n8n
 *
 * Failure policy: the booking never depends on n8n — 3s timeout, errors go to
 * error_log only.
 *
 * @package Siraj
 */

defined( 'ABSPATH' ) || exit;

add_action( 'siraj_booking_created', 'siraj_n8n_notify_booking' );

/**
 * Send booking.created to n8n for freshly published bookings.
 *
 * Listens to siraj_booking_created (fired by siraj_booking_save() AFTER the
 * meta loop) — save_post would run too early, before meta exists.
 *
 * @param int $post_id Post id.
 */
function siraj_n8n_notify_booking( $post_id ) {
	$post = get_post( $post_id );
	if ( ! $post || 'publish' !== get_post_status( $post_id ) ) {
		return;
	}

	$url    = (string) get_option( 'siraj_n8n_webhook_url', '' );
	$secret = (string) get_option( 'siraj_n8n_secret', '' );
	if ( '' === $url || '' === $secret ) {
		return;
	}

	$services = function_exists( 'siraj_booking_services' ) ? siraj_booking_services() : array();
	$service  = (string) get_post_meta( $post_id, 'siraj_service', true );
	// The booking name lives in post_title (siraj_booking_save) — meta is a fallback.
	$name     = '' !== (string) $post->post_title ? (string) $post->post_title : (string) get_post_meta( $post_id, 'siraj_name', true );

	$payload = array(
		'event'   => 'booking.created',
		'site'    => 'siraj-clinic-demo',
		'booking' => array(
			'id'            => $post_id,
			'name'          => $name,
			'phone'         => (string) get_post_meta( $post_id, 'siraj_phone', true ),
			'service'       => $service,
			'service_label' => isset( $services[ $service ] ) ? $services[ $service ] : $service,
			'date'          => (string) get_post_meta( $post_id, 'siraj_date', true ),
			'notes'         => (string) get_post_meta( $post_id, 'siraj_notes', true ),
			'created_at'    => mysql_to_rfc3339( (string) $post->post_date_gmt ),
		),
	);

	$body = wp_json_encode( $payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
	if ( false === $body ) {
		error_log( 'siraj n8n notify: json encode failed for booking ' . $post_id );
		return;
	}

	$timestamp = (string) time();
	$signature = 'v1=' . hash_hmac( 'sha256', $timestamp . '.' . $body, $secret );

	try {
		$response = wp_remote_post(
			$url,
			array(
				'timeout'     => 3,
				'redirection' => 0,
				'headers'     => array(
					'Content-Type'       => 'application/json',
					'X-Siraj-Timestamp'  => $timestamp,
					'X-Siraj-Signature'  => $signature,
				),
				'body'        => $body,
			)
		);
	} catch ( \Throwable $e ) {
		error_log( 'siraj n8n notify threw for booking ' . $post_id . ': ' . $e->getMessage() );
		return;
	}

	if ( is_wp_error( $response ) ) {
		error_log( 'siraj n8n notify failed for booking ' . $post_id . ': ' . $response->get_error_message() );
		return;
	}

	$code = (int) wp_remote_retrieve_response_code( $response );
	if ( $code < 200 || $code >= 300 ) {
		error_log( 'siraj n8n notify got HTTP ' . $code . ' for booking ' . $post_id );
	}
}
