<?php
/**
 * Plugin Name: Nilad Core
 * Description: Store logic for Nilad (نيلاد) — forms, integrations, WooCommerce glue. No presentation lives here.
 * Version: 0.1.0
 * Requires PHP: 8.2
 * Text Domain: nilad
 *
 * @package Nilad
 */

defined( 'ABSPATH' ) || exit;

/* --------------------------------------------------------------------------
 * Phase 6 QA hardening (security headers, SEO meta/JSON-LD, single h1).
 * Separate file to keep this one readable; loaded early so the filters are in
 * place before wp_head runs.
 * ------------------------------------------------------------------------ */
require_once __DIR__ . '/qa-hardening.php';

/* --------------------------------------------------------------------------
 * Exposure hardening (user enumeration, xmlrpc, login throttle) — closes the
 * GATE-2026-10-06 B7 findings from docs/AUDIT/security.md.
 * ------------------------------------------------------------------------ */
require_once __DIR__ . '/exposure-hardening.php';

/* --------------------------------------------------------------------------
 * WooCommerce compatibility declarations (HPOS + block checkout).
 * ------------------------------------------------------------------------ */
add_action( 'before_woocommerce_init', static function () {
	if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
		\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__, true );
		\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'cart_checkout_blocks', __FILE__, true );
	}
} );

/* --------------------------------------------------------------------------
 * Store settings live here (not in the theme), so a theme switch never
 * breaks the store. Shipping zones/fees + gateways are seeded by
 * seed-catalog.php; Paymob ships as the official WP.org plugin (decision:
 * official-paymob-plugin) — configured with the owner's test keys.
 * ------------------------------------------------------------------------ */

/**
 * Egyptian pound symbol: WooCommerce only ships ISO codes (EGP) and keeps no
 * setting for the symbol — it comes from this filter. Design copy uses ج.م.
 */
add_filter( 'woocommerce_currency_symbols', static function ( $symbols ) {
	$symbols['EGP'] = 'ج.م';
	return $symbols;
} );

/**
 * Demo notice: label the site as a demo in the admin bar for logged-in admins.
 * Keeps the demo-labeling rule (docs/DECISIONS.md demo-labeling) honest.
 */
add_action( 'admin_bar_menu', static function ( $bar ) {
	if ( ! is_admin() || ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$bar->add_node(
		array(
			'id'    => 'nilad-demo',
			'title' => esc_html__( 'نيلاد — متجر تجريبي (Demo)', 'nilad' ),
			'href'  => '#',
		)
	);
}, 100 );

/* --------------------------------------------------------------------------
 * Frontend performance: defer WooCommerce's eager block-type registration.
 *
 * On this project every stat()/file read over the Docker Desktop bind mount
 * costs ~8-10ms, and WooCommerce eagerly instantiates ~100 block classes on
 * init for every request (measured 3.5-5s of a frontend page load — the single
 * biggest cost in the request; see docs/PROBLEMS.md). Plain storefront pages
 * (home, about, legal pages) render no WooCommerce blocks, so we turn the
 * eager pass off for non-admin, non-REST HTML views and register the full set
 * lazily the first time a woocommerce/* block actually renders (mirrors WC's
 * own on-demand path for short descriptions; editor/admin/REST keep WC's
 * default eager behaviour via $should).
 * ------------------------------------------------------------------------ */
add_filter( 'woocommerce_should_register_blocks', static function ( $should ) {
	if ( is_admin() || wp_doing_ajax() || wp_doing_cron() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
		return $should;
	}
	return false;
} );

add_filter( 'pre_render_block', static function ( $pre, $block ) {
	$name = $block['blockName'] ?? '';
	if ( is_string( $name ) && 0 === strpos( $name, 'woocommerce/' ) && function_exists( 'wc_get_container' ) ) {
		$controller = wc_get_container()->get( \Automattic\WooCommerce\Blocks\BlockTypesController::class );
		if ( ! $controller->register_blocks_has_run() ) {
			$controller->register_blocks();
		}
	}
	return $pre;
}, 10, 2 );

// Woo's blockified single-product template hardcodes the untranslated English
// prefix 'Category: ' on the product category terms (block-template attributes
// are static HTML — gettext never sees them). Swap it at render time.
// NOTE: in render_block_data the parsed block still carries raw `attrs`
// (parse_blocks format); `attributes` is only derived later by WP_Block.
add_filter( 'render_block_data', static function ( $parsed_block ) {
	if ( 'core/post-terms' !== ( $parsed_block['blockName'] ?? '' ) ) {
		return $parsed_block;
	}
	$prefix = $parsed_block['attrs']['prefix'] ?? $parsed_block['attributes']['prefix'] ?? null;
	if ( is_string( $prefix ) && 0 === strpos( $prefix, 'Category' ) ) {
		$ar = 'التصنيف: ';
		if ( isset( $parsed_block['attrs'] ) ) {
			$parsed_block['attrs']['prefix'] = $ar;
		}
		if ( isset( $parsed_block['attributes'] ) ) {
			$parsed_block['attributes']['prefix'] = $ar;
		}
	}
	return $parsed_block;
} );

/* --------------------------------------------------------------------------
 * Phase 4 — checkout phone validation (Egypt mobiles).
 *
 * Normalize + validate on the Store API path (the demo checkout is the block
 * checkout): `woocommerce_store_api_checkout_update_customer_from_request`
 * fires after billing/shipping fields land on the customer but BEFORE the
 * order is created or payment runs, so throwing a RouteException here aborts
 * the request with a clean 400 the checkout block renders as an error notice.
 * Classic checkout has no page in this build — intentionally not wired
 * (untested code paths do not ship; see docs/DECISIONS.md).
 * ------------------------------------------------------------------------ */

/**
 * Normalize an Egyptian mobile number to 01XXXXXXXXX, or false if invalid.
 * Accepts +20 / 0020 / 20 prefixes, spaces, dashes and parentheses.
 */
function nilad_normalize_eg_mobile( $phone ) {
	$phone = preg_replace( '/[\s\-().]/', '', (string) $phone );
	if ( '' === $phone ) {
		return '';
	}
	if ( preg_match( '/^(?:\+|00)?20(1[0125]\d{8})$/', $phone, $m ) ) {
		$phone = '0' . $m[1];
	}
	return preg_match( '/^01[0125]\d{8}$/', $phone ) ? $phone : false;
}

add_action( 'woocommerce_store_api_checkout_update_customer_from_request', static function ( $customer ) {
	foreach ( array( 'billing', 'shipping' ) as $type ) {
		$getter = "get_{$type}_phone";
		$setter = "set_{$type}_phone";
		if ( ! method_exists( $customer, $getter ) || ! method_exists( $customer, $setter ) ) {
			continue;
		}
		$raw = (string) $customer->{$getter}();
		if ( '' === $raw ) {
			continue; // required-ness stays WooCommerce's job.
		}
		$norm = nilad_normalize_eg_mobile( $raw );
		if ( false === $norm ) {
			throw new \Automattic\WooCommerce\StoreApi\Exceptions\RouteException(
				'nilad_invalid_phone',
				__( 'رقم الموبايل غير صحيح. مثال: 01012345678', 'nilad' ),
				400
			);
		}
		$customer->{$setter}( $norm ); // store the normalized form for couriers.
	}
}, 10, 1 );

/* --------------------------------------------------------------------------
 * Phase 4 — free-shipping threshold notice on the cart page.
 *
 * The cart is the block cart (`wp:woocommerce/cart`): server-rendered classic
 * hooks never run inside it, and a static notice would go stale the moment the
 * shopper edits a quantity. So we inject a small status element above the
 * block and drive it from the Store API cart (GET /wc/store/v1/cart),
 * re-fetching on DOM mutations inside the cart block (quantity edits, coupon
 * apply/remove — the block re-renders totals for all of them). No script
 * dependencies: inline in wp_footer, only on the cart page.
 * ------------------------------------------------------------------------ */
add_action( 'wp_footer', static function () {
	if ( ! function_exists( 'is_cart' ) || ! is_cart() ) {
		return;
	}

	// Smallest enabled free-shipping threshold across zones (they are seeded
	// identical: 1,500 EGP). No threshold → no notice.
	$threshold = 0.0;
	foreach ( WC_Shipping_Zones::get_zones() as $z ) {
		$zone = new WC_Shipping_Zone( $z['zone_id'] );
		foreach ( $zone->get_shipping_methods() as $m ) {
			if ( 'free_shipping' !== $m->id || ! $m->is_enabled() ) {
				continue;
			}
			$s   = get_option( "woocommerce_free_shipping_{$m->instance_id}_settings", array() );
			$min = (float) ( $s['min_amount'] ?? 0 );
			if ( $min > 0 && ( 0.0 === $threshold || $min < $threshold ) ) {
				$threshold = $min;
			}
		}
	}
	if ( $threshold <= 0 ) {
		return;
	}
	?>
<style>
.nilad-fs{margin:0 0 1.25rem;padding:.9rem 1.1rem;border:1px solid #E6E1D8;border-radius:16px;background:#fff;font-weight:600;color:#1B1A17}
.nilad-fs p{margin:0}
.nilad-fs.is-done{background:#E4F1EC;border-color:#0B6B57;color:#0B6B57}
.nilad-fs .bar{display:block;height:8px;margin-top:.55rem;border-radius:999px;background:#E4F1EC;overflow:hidden}
.nilad-fs .bar i{display:block;height:100%;border-radius:999px;background:#0B6B57;transition:width .3s ease}
</style>
<script>
(function () {
	var THRESHOLD = <?php echo wp_json_encode( $threshold ); ?>;
	var root = document.querySelector('.wp-block-woocommerce-cart');
	if (!root || !root.parentNode) { return; }
	var el = document.createElement('div');
	el.className = 'nilad-fs';
	el.setAttribute('role', 'status');
	el.hidden = true;
	root.parentNode.insertBefore(el, root);

	function fmt(n) { return Math.round(n).toLocaleString('en-US'); }

	var lastHtml = '';
	function render(subtotal, minor) {
		var missing = THRESHOLD - subtotal;
		var html, cls;
		if (missing > 0.009) {
			cls = 'is-progress';
			var pct = Math.max(0, Math.min(100, (subtotal / THRESHOLD) * 100));
			html = '<p>متبقي <strong>' + fmt(missing) + ' ج.م</strong> للحصول على شحن مجاني</p>' +
				'<span class="bar" aria-hidden="true"><i style="width:' + pct.toFixed(1) + '%"></i></span>';
		} else {
			cls = 'is-done';
			html = '<p>طلبك مؤهل على <strong>الشحن المجاني</strong></p>';
		}
		if (html === lastHtml) { return; }
		lastHtml = html;
		el.className = 'nilad-fs ' + cls;
		el.innerHTML = html;
		el.hidden = false;
	}

	var busy = false;
	function refresh() {
		if (busy) { return; }
		busy = true;
		fetch((window.wcSettings && wcSettings.storeApiUrl || '/wp-json/wc/store/v1') + '/cart', {
			credentials: 'same-origin',
			headers: { 'Nonce': (window.wcSettings && wcSettings.storeApiNonce) || '' }
		}).then(function (r) { return r.ok ? r.json() : null; }).then(function (cart) {
			busy = false;
			if (!cart || !cart.totals) { return; }
			// Empty cart: no progress bar to show (avoids "متبقي 1,500" on visit).
			if (!cart.items_count) { el.hidden = true; return; }
			// WC 11's Store API totals ship no `items_subtotal` key: parseFloat(undefined)
			// is NaN, and NaN > 0.009 is false — that silently rendered the
			// "qualified" branch for every cart. Use total_items (always present).
			var minor = parseInt(cart.totals.currency_minor_unit, 10) || 0;
			var subtotal = parseFloat(cart.totals.total_items);
			if (isNaN(subtotal)) { return; }
			render(subtotal / Math.pow(10, minor), minor);
		}).catch(function () { busy = false; });
	}

	refresh();
	// The block re-renders totals for quantity edits and coupon changes alike —
	// debounce a refetch off any cart DOM mutation (our element sits outside
	// the observed subtree, so this cannot loop).
	var t = null;
	new MutationObserver(function () {
		clearTimeout(t);
		t = setTimeout(refresh, 400);
	}).observe(root, { subtree: true, childList: true, characterData: true });
})();
</script>
	<?php
}, 20 );

/* --------------------------------------------------------------------------
 * Phase 4 — email sender + local-only mail capture (demo evidence).
 *
 * Orders@nilad.example.com (reserved TLD — guaranteed non-routable) brands the
 * From header instead of exposing the WP admin address. On local/localhost
 * installs every wp_mail() is ALSO recorded in the `nilad_mail_log` option so
 * Arabic order emails can be verified without an SMTP provider (no MTA runs in
 * wp-env). Production installs never write the log.
 * ------------------------------------------------------------------------ */
add_filter( 'woocommerce_email_from_address', static function () {
	return 'orders@nilad.example.com';
} );

function nilad_is_local_site() {
	if ( 'local' === wp_get_environment_type() ) {
		return true;
	}
	$host = wp_parse_url( home_url(), PHP_URL_HOST );
	return in_array( $host, array( 'localhost', '127.0.0.1' ), true );
}

add_filter( 'wp_mail', static function ( $args ) {
	if ( ! nilad_is_local_site() ) {
		return $args;
	}
	$log = get_option( 'nilad_mail_log', array() );
	if ( ! is_array( $log ) ) {
		$log = array();
	}
	$headers = isset( $args['headers'] ) ? $args['headers'] : array();
	if ( is_array( $headers ) ) {
		$headers = implode( "\r\n", $headers );
	}
	$from = '';
	foreach ( preg_split( '/\r\n|\n|\r/', (string) $headers ) as $line ) {
		if ( 0 === stripos( $line, 'From:' ) ) {
			$from = trim( substr( $line, 5 ) );
			break;
		}
	}
	if ( '' === $from ) {
		// WC registers wp_mail_from(_name) while its emails send
		// (class-wc-email.php ~1230) — resolve the effective sender here.
		$from_name = (string) apply_filters( 'wp_mail_from_name', get_bloginfo( 'name' ) );
		$from_addr = (string) apply_filters( 'wp_mail_from', get_bloginfo( 'admin_email' ) );
		$from      = $from_name . ' <' . $from_addr . '>';
	}
	$log[] = array(
		'ts'      => current_time( 'mysql' ),
		'to'      => $args['to'],
		'subject' => (string) $args['subject'],
		'from'    => $from,
		'message' => substr( wp_strip_all_tags( (string) $args['message'] ), 0, 8000 ),
	);
	update_option( 'nilad_mail_log', array_slice( $log, -20 ), false );
	return $args;
}, 10, 1 );
