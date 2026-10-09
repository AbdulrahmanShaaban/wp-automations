<?php
/**
 * check-phase4.php — CLI evidence for Phase 4 (order + mail log + phone).
 * Run: wp eval-file /var/www/html/wp-content/plugins/nilad-core/check-phase4.php
 * ASCII-only: prints JSON-ish lines so no encoding surprises in the bridge.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$orders = wc_get_orders( array( 'limit' => 10, 'orderby' => 'date', 'order' => 'DESC' ) );
if ( ! $orders ) {
	// Fresh seed (reset.sh → seed → verify): no orders yet — browser suite
	// scripts/phase4-test.js creates them. Standalone asserts still run below.
	echo "SKIP cod-order checks (no orders yet — run scripts/phase4-test.js)\n";
	echo "SKIP mail-log checks (order emails only exist after an order)\n";
} else {
	$cod = null;
	foreach ( $orders as $o ) {
		if ( 'cod' === $o->get_payment_method() ) {
			$cod = $o;
			break;
		}
	}
	if ( ! $cod ) {
		echo "CHECK cod-order: FAIL (orders exist but none paid by COD)\n";
		exit( 1 );
	}

	$phone_ok = ( '01012345678' === $cod->get_billing_phone() );
	$status   = $cod->get_status();
	$lines    = 0;
	$items    = '';
	foreach ( $cod->get_items() as $item ) {
		$lines++;
		$items .= $item->get_name() . ' x' . $item->get_quantity() . ';';
	}
	$total = $cod->get_total();
	$ship  = $cod->get_shipping_total();
	$state = $cod->get_shipping_state();
	$city  = $cod->get_shipping_city();
	$zip   = $cod->get_shipping_postcode();

	echo 'CHECK cod-order-id: ' . $cod->get_id() . "\n";
	echo 'CHECK cod-order-status: ' . $status . "\n";
	echo 'CHECK cod-order-phone: ' . $cod->get_billing_phone() . ( $phone_ok ? ' (canonical OK)' : ' (NOT canonical)' ) . "\n";
	echo 'CHECK cod-order-state: ' . $state . "\n";
	echo 'CHECK cod-order-city: ' . $city . "\n";
	echo 'CHECK cod-order-zip: ' . $zip . "\n";
	echo 'CHECK cod-order-total: ' . $total . "\n";
	echo 'CHECK cod-order-shipping: ' . $ship . "\n";
	echo 'CHECK cod-order-lines: ' . $lines . ' [' . $items . "]\n";

	$log = get_option( 'nilad_mail_log', array() );
	echo 'CHECK mail-log-count: ' . ( is_array( $log ) ? count( $log ) : 0 ) . "\n";
	if ( is_array( $log ) && $log ) {
		$last = end( $log );
		foreach ( array( 'to', 'subject', 'from' ) as $k ) {
			$v = isset( $last[ $k ] ) ? (string) $last[ $k ] : '';
			echo 'CHECK mail-log-last-' . $k . ': ' . $v . "\n";
		}
	}
}

/* Standalone asserts (run even on a fresh seed). */
$fail = array();
if ( $orders ) {
	$log = get_option( 'nilad_mail_log', array() );
	if ( ! isset( $phone_ok ) || ! $phone_ok ) {
		$fail[] = 'phone';
	}
	if ( ! isset( $status ) || ! in_array( $status, array( 'processing', 'on-hold' ), true ) ) {
		$fail[] = 'status=' . ( $status ?? '?' );
	}
	if ( ! is_array( $log ) || count( $log ) < 1 ) {
		$fail[] = 'mail-log-empty';
	}
	if ( isset( $lines ) && $lines < 1 ) {
		$fail[] = 'no-line-items';
	}
	if ( is_array( $log ) && $log ) {
		$last = end( $log );
		$from = isset( $last['from'] ) ? (string) $last['from'] : '';
		if ( false === stripos( $from, 'orders@nilad.example.com' ) ) {
			$fail[] = 'mail-log-from-not-branded=' . $from;
		}
	}
}

if ( $fail ) {
	echo 'CHECK phase4: FAIL (' . implode( ',', $fail ) . ")\n";
	exit( 1 );
}
echo "CHECK phase4: PASS\n";
exit( 0 );
