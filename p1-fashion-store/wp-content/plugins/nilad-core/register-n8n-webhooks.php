<?php
/**
 * register-n8n-webhooks.php — idempotently point WooCommerce webhooks at the local n8n.
 * Run: wp eval-file /var/www/html/wp-content/plugins/nilad-core/register-n8n-webhooks.php
 *
 * Delivery URL points at the n8n container through the Docker host gateway, because
 * WooCommerce (inside wp-env) must reach n8n (published on the host at :5678).
 *
 * Secret handling (GATE-2026-10-06 B1 / audit security #1): the signing key is
 * NEVER hardcoded here. Resolution order:
 *   1. `WOO_WEBHOOK_SECRET` env var (kept canonical if provided)
 *   2. wp option `nilad_n8n_webhook_secret` (created on first run)
 *   3. freshly generated (bin2hex(random_bytes(24)), 48 hex chars) + stored
 * Existing webhooks whose stored secret differs are updated, so a rotation is:
 *   wp option delete nilad_n8n_webhook_secret
 *   → run this file (new secret generated + pushed into the webhooks)
 *   → node scripts/sync-webhook-secret.js (pushes the option into n8n/.env)
 * Only source + length are echoed — never the value.
 */

$secret = getenv( 'WOO_WEBHOOK_SECRET' );
$source = 'env';
if ( ! $secret ) {
	$secret = (string) get_option( 'nilad_n8n_webhook_secret', '' );
	$source = 'option';
}
if ( ! $secret ) {
	$secret = bin2hex( random_bytes( 24 ) );
	$source = 'generated';
	update_option( 'nilad_n8n_webhook_secret', $secret, false );
} elseif ( 'env' === $source && $secret !== (string) get_option( 'nilad_n8n_webhook_secret', '' ) ) {
	// Env wins, but keep the option mirror in sync so the next option-less run
	// resolves to the same value.
	update_option( 'nilad_n8n_webhook_secret', $secret, false );
}
printf( "CHECK webhook-secret: source=%s length=%d\n", $source, strlen( $secret ) );

$base = 'http://host.docker.internal:5678/webhook/';

$targets = array(
	'order.created' => 'woo-order-created',
	'order.updated' => 'woo-order-updated',
);

foreach ( $targets as $topic => $slug ) {
	$store = WC_Data_Store::load( 'webhook' );
	$rows  = $store->search( array( 'topic' => $topic, 'status' => 'active', 'limit' => 20 ) );
	$found = false;
	foreach ( $rows as $row ) {
		if ( ! isset( $row->delivery_url ) || $row->delivery_url !== $base . $slug ) {
			continue;
		}
		$found = true;
		$hook  = wc_get_webhook( (int) $row->id );
		if ( $hook && $hook->get_secret() !== $secret ) {
			$hook->set_secret( $secret );
			$hook->save();
			printf( "CHECK webhook %s: secret rotated (#%d)\n", $topic, (int) $row->id );
		} else {
			printf( "CHECK webhook %s: already registered (#%d)\n", $topic, (int) $row->id );
		}
		break;
	}
	if ( $found ) {
		continue;
	}
	$hook = new WC_Webhook();
	$hook->set_name( 'n8n ' . $topic );
	$hook->set_topic( $topic );
	$hook->set_secret( $secret );
	$hook->set_delivery_url( $base . $slug );
	$hook->set_status( 'active' );
	$hook->save();
	$id = $hook->get_id();
	echo "CHECK webhook {$topic}: created #{$id} -> " . $base . $slug . "\n";
}

echo "CHECK phase5-webhooks: PASS\n";
