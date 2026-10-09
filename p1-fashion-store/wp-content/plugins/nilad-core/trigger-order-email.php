<?php
/**
 * trigger-order-email.php — re-fire the New Order email for local evidence
 * (the wp_mail capture now records the branded From header).
 * Run: wp eval-file /var/www/html/wp-content/plugins/nilad-core/trigger-order-email.php
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$order_id = 50;
$order    = wc_get_order( $order_id );
if ( ! $order ) {
	echo "TRIGGER: FAIL (order {$order_id} missing)\n";
	exit( 1 );
}

$mailer = WC()->mailer();
if ( ! isset( $mailer->emails['WC_Email_New_Order'] ) ) {
	echo "TRIGGER: FAIL (WC_Email_New_Order not registered)\n";
	exit( 1 );
}

$mailer->emails['WC_Email_New_Order']->trigger( $order_id, $order );
echo "TRIGGER: New Order email fired for #{$order_id}\n";
exit( 0 );
