<?php
/**
 * booking.php — appointment-request form for the Siraj demo clinic.
 *
 * The `[siraj_booking]` shortcode renders the form; a POST handler on `init`
 * re-validates every field on the server and stores each accepted request as a
 * private `siraj_booking` post. That post type list in wp-admin is how the
 * clinic owner "receives" bookings in this demo — there is no email or SMTP
 * here by design (see `docs/DECISIONS.md#booking-custom-plugin`).
 *
 * Security: nonce + honeypot, service whitelist, every input sanitized, every
 * output escaped, and the raw IP is never stored (a keyed hash goes in instead).
 *
 * Accessibility: `aria-invalid` + an adjacent `.siraj-error` linked with
 * `aria-describedby` on each invalid field, a `role="alert"` summary of all
 * errors, and a `role="status"` confirmation on success.
 *
 * @package Siraj
 */

defined( 'ABSPATH' ) || exit;

/**
 * Post type the accepted bookings are stored in.
 */
define( 'SIRAJ_BOOKING_CPT', 'siraj_booking' );

/**
 * Nonce action for the booking form. Doubles as the nonce field's name, so it
 * must stay distinct from the `siraj_booking_form` marker field that tells the
 * handler "this POST is mine".
 */
define( 'SIRAJ_BOOKING_NONCE', 'siraj_booking_submit' );

/**
 * Longest accepted note length, mirrored by the textarea's `maxlength`.
 */
define( 'SIRAJ_BOOKING_NOTES_MAX', 500 );

// Registration runs first: the POST handler saves into this post type.
add_action( 'init', 'siraj_booking_register_post_type', 10 );
add_action( 'init', 'siraj_booking_handle_post', 20 );

add_shortcode( 'siraj_booking', 'siraj_booking_shortcode' );

add_filter( 'manage_' . SIRAJ_BOOKING_CPT . '_posts_columns', 'siraj_booking_columns' );
add_action( 'manage_' . SIRAJ_BOOKING_CPT . '_posts_custom_column', 'siraj_booking_column_content', 10, 2 );
add_filter( 'manage_edit-' . SIRAJ_BOOKING_CPT . '_sortable_columns', 'siraj_booking_sortable_columns' );
add_action( 'pre_get_posts', 'siraj_booking_apply_sort' );

/* -------------------------------------------------------------------------
 * Allowed values
 * ---------------------------------------------------------------------- */

/**
 * Field labels, used as the `<label>` text and as the prefix in the alert summary.
 *
 * @return array<string,string> Map of field key to Arabic label.
 */
function siraj_booking_field_labels() {
	return array(
		'name'    => __( 'الاسم بالكامل', 'siraj' ),
		'phone'   => __( 'رقم الموبايل', 'siraj' ),
		'service' => __( 'الخدمة المطلوبة', 'siraj' ),
		'date'    => __( 'التاريخ المفضّل', 'siraj' ),
		'notes'   => __( 'ملاحظات', 'siraj' ),
		'consent' => __( 'الموافقة على التواصل', 'siraj' ),
	);
}

/**
 * Fields the visitor must fill in.
 *
 * Kept separate from the labels so the required marker and `aria-required` match
 * the server-side rules in siraj_booking_validate(): `date` and `notes` are
 * optional and must never be announced as required.
 *
 * @return string[] Field keys.
 */
function siraj_booking_required_fields() {
	return array( 'name', 'phone', 'service', 'consent' );
}

/**
 * Optional helper copy shown under a field, keyed by field.
 *
 * @return array<string,string> Map of field key to Arabic hint.
 */
function siraj_booking_field_hints() {
	return array(
		'phone' => __( 'اكتب رقم الموبايل، مثال: 01012345678', 'siraj' ),
		'date'  => __( 'اختياري، من فضلك اختر تاريخًا اليوم أو بعده.', 'siraj' ),
		'notes' => __( 'اختياري، الحد الأقصى 500 حرف.', 'siraj' ),
	);
}

/**
 * The only services a submission may request — the whitelist the server validates against.
 *
 * Keys are stable slugs (the value stored in `siraj_service` meta and rendered in the
 * admin column); labels are Arabic and may change without invalidating old rows.
 *
 * @return array<string,string> Map of service slug to Arabic label.
 */
function siraj_booking_services() {
	return array(
		'cleaning'   => __( 'تنظيف وتلميع', 'siraj' ),
		'root-canal' => __( 'علاج عصب', 'siraj' ),
		'filling'    => __( 'حشو تجميلي', 'siraj' ),
		'ortho'      => __( 'تقويم', 'siraj' ),
		'implant'    => __( 'زراعة', 'siraj' ),
		'checkup'    => __( 'فحص وتشخيص', 'siraj' ),
	);
}

/* -------------------------------------------------------------------------
 * Post type + admin list
 * ---------------------------------------------------------------------- */

/**
 * Register the private post type that backs the booking inbox.
 *
 * `public => false` keeps submissions out of the front end and the REST API;
 * `show_ui => true` with `capability_type => 'post'` exposes the list to anyone
 * who can edit posts (Editor and above), which is the demo's "inbox".
 *
 * @return void
 */
function siraj_booking_register_post_type() {
	register_post_type(
		SIRAJ_BOOKING_CPT,
		array(
			'labels'              => array(
				'name'          => __( 'طلبات الحجز', 'siraj' ),
				'singular_name' => __( 'طلب حجز', 'siraj' ),
				'menu_name'     => __( 'الحجوزات', 'siraj' ),
				'all_items'     => __( 'كل الطلبات', 'siraj' ),
				'search_items'  => __( 'بحث في الطلبات', 'siraj' ),
				'not_found'     => __( 'لا توجد طلبات حجز بعد.', 'siraj' ),
			),
			'public'              => false,
			'publicly_queryable'  => false,
			'exclude_from_search' => true,
			'show_ui'             => true,
			'show_in_menu'        => true,
			'show_in_admin_bar'   => false,
			'show_in_nav_menus'   => false,
			'show_in_rest'        => false,
			'has_archive'         => false,
			'rewrite'             => false,
			'query_var'           => false,
			'can_export'          => false,
			'hierarchical'        => false,
			'menu_icon'           => 'dashicons-calendar-alt',
			'menu_position'       => 26,
			'capability_type'     => 'post',
			'map_meta_cap'        => true,
			'supports'            => array( 'title' ),
		)
	);
}

/**
 * Build the admin list columns: name, phone, service, requested date, sent date.
 *
 * @param array<string,string> $columns Default columns.
 * @return array<string,string> Reordered columns.
 */
function siraj_booking_columns( $columns ) {
	return array(
		'cb'            => isset( $columns['cb'] ) ? $columns['cb'] : '',
		'title'         => isset( $columns['title'] ) ? $columns['title'] : __( 'الاسم', 'siraj' ),
		'siraj_phone'   => __( 'رقم الموبايل', 'siraj' ),
		'siraj_service' => __( 'الخدمة', 'siraj' ),
		'siraj_date'    => __( 'التاريخ المفضّل', 'siraj' ),
		'date'          => isset( $columns['date'] ) ? $columns['date'] : __( 'تاريخ الإرسال', 'siraj' ),
	);
}

/**
 * Print one booking meta value for an admin list column.
 *
 * `siraj_service` stores a slug, so it is translated back to its Arabic label
 * here; an unknown slug (a service removed since the row was written) falls
 * through and is printed as-is.
 *
 * @param string $column  Column key.
 * @param int    $post_id Booking post ID.
 * @return void
 */
function siraj_booking_column_content( $column, $post_id ) {
	$value = get_post_meta( (int) $post_id, $column, true );

	if ( ! is_string( $value ) || '' === $value ) {
		echo '&mdash;';
		return;
	}

	if ( 'siraj_service' === $column ) {
		$services = siraj_booking_services();
		$value    = isset( $services[ $value ] ) ? $services[ $value ] : $value;
	}

	echo esc_html( $value );
}

/**
 * Declare the meta-backed columns as sortable in the admin list table.
 *
 * @param array<string,string> $columns Sortable column map.
 * @return array<string,string> Filtered map.
 */
function siraj_booking_sortable_columns( $columns ) {
	$columns['siraj_phone']   = 'siraj_phone';
	$columns['siraj_service'] = 'siraj_service';
	$columns['siraj_date']    = 'siraj_date';

	return $columns;
}

/**
 * Order the booking list by one of the meta-backed columns.
 *
 * Stored values compare correctly as plain strings (`Y-m-d` dates sort
 * chronologically), so a plain `meta_value` order is enough.
 *
 * @param WP_Query $query The query being prepared.
 * @return void
 */
function siraj_booking_apply_sort( $query ) {
	if ( ! is_admin() || ! $query->is_main_query() ) {
		return;
	}

	if ( ! in_array( SIRAJ_BOOKING_CPT, (array) $query->get( 'post_type' ), true ) ) {
		return;
	}

	$orderby = $query->get( 'orderby' );

	if ( ! is_string( $orderby ) ) {
		return;
	}

	if ( in_array( $orderby, array( 'siraj_phone', 'siraj_service', 'siraj_date' ), true ) ) {
		$query->set( 'meta_key', $orderby );
		$query->set( 'orderby', 'meta_value' );
	}
}

/* -------------------------------------------------------------------------
 * Request handling
 * ---------------------------------------------------------------------- */

/**
 * Whether the current request is a booking form submission.
 *
 * The `siraj_booking_form` marker keeps unrelated POSTs (admin forms, comments)
 * from being claimed by this handler, so a stale nonce still produces a
 * recoverable message instead of a silently empty form.
 *
 * @return bool True when this POST belongs to the booking form.
 */
function siraj_booking_is_submission() {
	if ( is_admin() ) {
		return false;
	}

	$method = isset( $_SERVER['REQUEST_METHOD'] ) ? strtoupper( (string) $_SERVER['REQUEST_METHOD'] ) : '';

	if ( 'POST' !== $method ) {
		return false;
	}

	return '1' === siraj_booking_post_value( 'siraj_booking_form' );
}

/**
 * Read one scalar field out of $_POST, unslashed and array-safe.
 *
 * A crafted request can post `siraj_name[]=x`, so casting blindly would emit an
 * "Array to string conversion" warning; non-scalars collapse to '' and then fail
 * validation exactly like a missing value.
 *
 * @param string $key Field name inside $_POST.
 * @return string Raw value, or '' when absent or not scalar.
 */
function siraj_booking_post_value( $key ) {
	if ( ! isset( $_POST[ $key ] ) ) {
		return '';
	}

	$value = wp_unslash( $_POST[ $key ] );

	return is_scalar( $value ) ? (string) $value : '';
}

/**
 * Collect every submitted booking field, still raw.
 *
 * @return array<string,string> Raw, unslashed values keyed by short field name.
 */
function siraj_booking_raw_input() {
	return array(
		'nonce'   => siraj_booking_post_value( SIRAJ_BOOKING_NONCE ),
		'website' => siraj_booking_post_value( 'siraj_website' ),
		'name'    => siraj_booking_post_value( 'siraj_name' ),
		'phone'   => siraj_booking_post_value( 'siraj_phone' ),
		'service' => siraj_booking_post_value( 'siraj_service' ),
		'date'    => siraj_booking_post_value( 'siraj_date' ),
		'notes'   => siraj_booking_post_value( 'siraj_notes' ),
		'consent' => siraj_booking_post_value( 'siraj_consent' ),
	);
}

/**
 * Sanitize a submission into the values we validate, store, and re-render.
 *
 * The phone is kept as typed here; normalization happens at save time so the
 * user still sees their own input when the form comes back with errors.
 *
 * @param array<string,string> $raw Raw values from siraj_booking_raw_input().
 * @return array<string,mixed> Sanitized values keyed by short field name.
 */
function siraj_booking_clean_values( array $raw ) {
	$services = siraj_booking_services();
	$service  = sanitize_text_field( $raw['service'] );

	return array(
		'name'    => sanitize_text_field( $raw['name'] ),
		'phone'   => sanitize_text_field( $raw['phone'] ),
		'service' => isset( $services[ $service ] ) ? $service : '',
		'date'    => sanitize_text_field( $raw['date'] ),
		'notes'   => sanitize_textarea_field( $raw['notes'] ),
		'consent' => in_array( $raw['consent'], array( '1', 'on', 'true' ), true ),
	);
}

/**
 * Normalize an Egyptian mobile number to +20XXXXXXXXX.
 *
 * Accepts `01xxxxxxxxx`, `+20xxxxxxxxx` and `0020xxxxxxxxx`; spacing, dashes and
 * brackets are ignored, so `(+20) 010 1234 5678` still passes. Anything else —
 * including a bare `20…` with no country prefix, landlines, and wrong-length
 * numbers — returns an empty string, which fails validation.
 *
 * @param string $raw Phone as typed.
 * @return string Phone as +20XXXXXXXXX, or '' when it is not an Egyptian mobile.
 */
function siraj_normalize_phone( $raw ) {
	$digits = preg_replace( '/[^0-9+]/', '', (string) $raw );

	if ( 0 === strpos( $digits, '0020' ) ) {
		$national = substr( $digits, 4 );
	} elseif ( 0 === strpos( $digits, '+20' ) ) {
		$national = substr( $digits, 3 );
	} elseif ( 0 === strpos( $digits, '20' ) ) {
		return ''; // A country code with no + or 00 prefix is not an accepted shape.
	} elseif ( '' !== $digits && '0' === $digits[0] ) {
		$national = substr( $digits, 1 );
	} else {
		return '';
	}

	// Egyptian mobile prefixes are 010, 011, 012 and 015.
	if ( ! preg_match( '/^(10|11|12|15)[0-9]{8}$/', $national ) ) {
		return '';
	}

	return '+20' . $national;
}

/**
 * Validate a preferred date against the current site date.
 *
 * @param string $raw_date Date as typed.
 * @return string Error message, or '' when the date is empty, real, and not in the past.
 */
function siraj_booking_validate_date( $raw_date ) {
	$date    = sanitize_text_field( $raw_date );
	$invalid = __( 'من فضلك اختر تاريخًا صحيحًا من قائمة التاريخ.', 'siraj' );

	if ( '' === $date ) {
		return ''; // Optional field.
	}

	if ( ! preg_match( '/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/', $date ) ) {
		return $invalid;
	}

	list( $year, $month, $day ) = array_map( 'intval', explode( '-', $date ) );

	if ( ! checkdate( $month, $day, $year ) ) {
		return $invalid;
	}

	// Y-m-d compares chronologically as a string, and current_time() is site-local.
	if ( $date < current_time( 'Y-m-d' ) ) {
		return __( 'من فضلك اختر تاريخًا اليوم أو بعده.', 'siraj' );
	}

	return '';
}

/**
 * Validate every submitted field.
 *
 * Runs on already-sanitized values from siraj_booking_clean_values(); the client
 * is never trusted, so the same rules apply whether or not HTML5 attributes
 * such as `maxlength` were honoured by the browser.
 *
 * @param array<string,mixed> $values Sanitized values keyed by short field name.
 * @return array<string,string> Errors keyed by field, empty when the submission is valid.
 */
function siraj_booking_validate( array $values ) {
	$errors = array();

	if ( mb_strlen( $values['name'] ) < 3 ) {
		$errors['name'] = __( 'من فضلك اكتب الاسم بالكامل، 3 أحرف على الأقل.', 'siraj' );
	}

	if ( '' === siraj_normalize_phone( $values['phone'] ) ) {
		$errors['phone'] = __( 'رقم الموبايل غير صحيح. مثال: 01012345678', 'siraj' );
	}

	$services = siraj_booking_services();

	if ( '' === $values['service'] || ! isset( $services[ $values['service'] ] ) ) {
		$errors['service'] = __( 'من فضلك اختر الخدمة المطلوبة من القائمة.', 'siraj' );
	}

	$date_error = siraj_booking_validate_date( $values['date'] );

	if ( '' !== $date_error ) {
		$errors['date'] = $date_error;
	}

	if ( mb_strlen( $values['notes'] ) > SIRAJ_BOOKING_NOTES_MAX ) {
		$errors['notes'] = __( 'الملاحظات طويلة جدًا، الحد الأقصى 500 حرف.', 'siraj' );
	}

	if ( empty( $values['consent'] ) ) {
		$errors['consent'] = __( 'من فضلك أوافق على تواصل العيادة معك لتأكيد الموعد.', 'siraj' );
	}

	return $errors;
}

/**
 * Check the anti-spam envelope around a submission.
 *
 * A bad nonce and a filled honeypot both answer with the same generic message,
 * so an automated client learns nothing about which check tripped it, while a
 * person whose tab sat open long enough for the nonce to expire still gets a
 * message and a form instead of a silently empty page.
 *
 * @param array<string,string> $raw Raw values from siraj_booking_raw_input().
 * @return string|false Error message, or false when the envelope is clean.
 */
function siraj_booking_check_envelope( array $raw ) {
	$generic = __( 'تعذّر إرسال الطلب، من فضلك أعد المحاولة.', 'siraj' );

	if ( 1 !== wp_verify_nonce( $raw['nonce'], SIRAJ_BOOKING_NONCE ) ) {
		return $generic;
	}

	if ( '' !== trim( $raw['website'] ) ) {
		return $generic;
	}

	// Rate limit: 6 attempts per IP-hash per 10 minutes. The key reuses the
	// stored (already hashed) IP, so throttling adds nothing readable to the
	// database, and a throttled caller gets the same generic message as a bad
	// nonce — an automated client learns nothing from the difference.
	$hash = siraj_booking_ip_hash();
	if ( '' !== $hash ) {
		$throttle_key = 'siraj_bk_t_' . substr( $hash, 0, 16 );
		$hits         = (int) get_transient( $throttle_key );

		if ( $hits >= 6 ) {
			return $generic;
		}

		set_transient( $throttle_key, $hits + 1, 10 * MINUTE_IN_SECONDS );
	}

	return false;
}

/**
 * Hash the submitting IP instead of storing it.
 *
 * A keyed digest is enough to spot repeated submissions from one address while
 * leaving no address to read back out of the database.
 *
 * @return string Hex digest, or '' when the server exposed no remote address.
 */
function siraj_booking_ip_hash() {
	if ( ! isset( $_SERVER['REMOTE_ADDR'] ) ) {
		return '';
	}

	$ip = sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) );

	if ( '' === $ip ) {
		return '';
	}

	$salt = defined( 'NONCE_SALT' ) && NONCE_SALT ? NONCE_SALT : wp_salt( 'nonce' );

	return hash_hmac( 'sha256', $ip, $salt );
}

/**
 * Store a validated submission as a booking post with its meta.
 *
 * @param array<string,mixed> $values Validated values from siraj_booking_clean_values().
 * @return int|WP_Error New post ID, or WP_Error when the insert failed.
 */
function siraj_booking_save( array $values ) {
	$post_id = wp_insert_post(
		array(
			'post_type'   => SIRAJ_BOOKING_CPT,
			'post_status' => 'publish',
			'post_title'  => $values['name'],
		),
		true
	);

	if ( is_wp_error( $post_id ) ) {
		return $post_id;
	}

	$meta = array(
		'siraj_phone'   => siraj_normalize_phone( $values['phone'] ),
		'siraj_service' => $values['service'],
		'siraj_date'    => $values['date'],
		'siraj_notes'   => $values['notes'],
		'siraj_ip_hash' => siraj_booking_ip_hash(),
	);

	foreach ( $meta as $meta_key => $meta_value ) {
		if ( '' === $meta_value ) {
			continue; // Optional field: leave the meta table free of empty rows.
		}

		update_post_meta( (int) $post_id, $meta_key, $meta_value );
	}

	/**
	 * Fires once a booking and ALL of its meta are fully stored.
	 *
	 * save_post would fire inside wp_insert_post() — before the meta loop above —
	 * so integrations that need the complete booking (notifier.php) listen here.
	 *
	 * @param int $post_id New booking post id.
	 */
	do_action( 'siraj_booking_created', (int) $post_id );

	return (int) $post_id;
}

/**
 * State carried from the POST handler to the shortcode within the same request.
 *
 * Returned by reference so the handler can assign it; read it through
 * siraj_booking_state() instead of touching the static.
 *
 * @return array<string,mixed> Request state.
 */
function &siraj_booking_state() {
	static $state = array(
		'status'     => 'idle',
		'errors'     => array(),
		'values'     => array(),
		'booking_id' => 0,
	);

	return $state;
}

/**
 * Validate and store a booking submission, then stash the outcome for rendering.
 *
 * Runs on `init` at priority 20, after the post type is registered because
 * saving needs it.
 *
 * @return void
 */
function siraj_booking_handle_post() {
	if ( ! siraj_booking_is_submission() ) {
		return;
	}

	$raw    = siraj_booking_raw_input();
	$values = siraj_booking_clean_values( $raw );

	$envelope = siraj_booking_check_envelope( $raw );
	$errors   = ( false === $envelope ) ? siraj_booking_validate( $values ) : array( 'form' => $envelope );

	$booking_id = 0;

	if ( ! $errors ) {
		$saved = siraj_booking_save( $values );

		if ( is_wp_error( $saved ) ) {
			$errors = array( 'form' => __( 'تعذّر حفظ الطلب، من فضلك أعد المحاولة.', 'siraj' ) );
		} else {
			$booking_id = (int) $saved;
			$values     = array(); // Nothing is echoed back after a success.
		}
	}

	$state = &siraj_booking_state();

	$state = array(
		'status'     => $errors ? 'errors' : 'success',
		'errors'     => $errors,
		'values'     => $values,
		'booking_id' => $booking_id,
	);
}

/* -------------------------------------------------------------------------
 * Rendering
 * ---------------------------------------------------------------------- */

/**
 * Render the `[siraj_booking]` form, the error summary, or the confirmation.
 *
 * @param array<string,mixed> $atts Shortcode attributes (none are supported yet).
 * @return string Form markup, returned rather than echoed so the shortcode stays re-entrant.
 */
function siraj_booking_shortcode( $atts = array() ) {
	// No attributes today; this drops anything a content author invents.
	shortcode_atts( array(), (array) $atts, 'siraj_booking' );

	$state = siraj_booking_state();
	$html  = '<div class="siraj-booking">';

	if ( 'success' === $state['status'] ) {
		return $html . siraj_booking_render_success() . '</div>';
	}

	$html .= siraj_booking_render_alert( $state['errors'] );
	$html .= siraj_booking_render_form( $state['values'], $state['errors'] );

	return $html . '</div>';
}

/**
 * Number each rendered form so two shortcodes on one page get distinct ids.
 *
 * Without this the second form's `aria-describedby` would point at the first
 * form's error elements, which breaks the error announcement for that field.
 *
 * @return int Monotonic instance number.
 */
function siraj_booking_next_instance() {
	static $instance = 0;

	++$instance;

	return $instance;
}

/**
 * Build the DOM id for one field's control, hint, or error element.
 *
 * @param string $key      Short field name.
 * @param int    $instance Form instance number.
 * @return string Element id.
 */
function siraj_booking_field_id( $key, $instance ) {
	return 'siraj-' . $key . '-' . (int) $instance;
}

/**
 * Escape an attribute map into markup, skipping empty values.
 *
 * `true` renders a bare boolean attribute (`checked`), which keeps the honeypot
 * and the consent checkbox free of duplicated attribute logic.
 *
 * @param array<string,string|bool|null> $attributes Attribute name => value.
 * @return string Leading-space-prefixed attribute markup, or '' when nothing is left.
 */
function siraj_booking_render_attributes( array $attributes ) {
	$out = '';

	foreach ( $attributes as $name => $value ) {
		if ( null === $value || false === $value || '' === $value ) {
			continue;
		}

		if ( true === $value ) {
			$out .= ' ' . esc_attr( (string) $name );
			continue;
		}

		$out .= sprintf( ' %s="%s"', esc_attr( (string) $name ), esc_attr( (string) $value ) );
	}

	return $out;
}

/**
 * Build the `aria-describedby` token list for a field.
 *
 * @param string $key       Short field name.
 * @param int    $instance  Form instance number.
 * @param bool   $has_error Whether the field currently has an error.
 * @return string|null Space-separated ids, or null when there is nothing to describe.
 */
function siraj_booking_describedby( $key, $instance, $has_error = false ) {
	$hints  = siraj_booking_field_hints();
	$tokens = array();

	if ( isset( $hints[ $key ] ) ) {
		$tokens[] = siraj_booking_field_id( $key, $instance ) . '-hint';
	}

	if ( $has_error ) {
		$tokens[] = siraj_booking_field_id( $key, $instance ) . '-error';
	}

	return $tokens ? implode( ' ', $tokens ) : null;
}

/**
 * Render a field label, marking required ones.
 *
 * The asterisk is hidden from assistive tech because `aria-required="true"` on
 * the control already conveys it.
 *
 * @param string $key    Short field name.
 * @param string $for_id Id of the control this label names.
 * @return string Label markup.
 */
function siraj_booking_render_label( $key, $for_id ) {
	$labels = siraj_booking_field_labels();
	$label  = isset( $labels[ $key ] ) ? $labels[ $key ] : '';
	// Static markup, no interpolated user data.
	$marker = in_array( $key, siraj_booking_required_fields(), true ) ? ' <span aria-hidden="true">*</span>' : '';

	return sprintf(
		'<label class="siraj-label" for="%s">%s%s</label>',
		esc_attr( $for_id ),
		esc_html( $label ),
		$marker
	);
}

/**
 * Render a field's hint paragraph, if it has one.
 *
 * @param string $key      Short field name.
 * @param int    $instance Form instance number.
 * @return string Hint markup, or '' when the field has no hint.
 */
function siraj_booking_render_hint( $key, $instance ) {
	$hints = siraj_booking_field_hints();

	if ( ! isset( $hints[ $key ] ) ) {
		return '';
	}

	return sprintf(
		'<p class="siraj-hint" id="%s">%s</p>',
		esc_attr( siraj_booking_field_id( $key, $instance ) . '-hint' ),
		esc_html( $hints[ $key ] )
	);
}

/**
 * Render a field's error message, if the field has one.
 *
 * @param string               $key      Short field name.
 * @param int                  $instance Form instance number.
 * @param array<string,string> $errors   Validation errors keyed by field.
 * @return string Error markup, or '' when the field is valid.
 */
function siraj_booking_render_error( $key, $instance, array $errors ) {
	if ( ! isset( $errors[ $key ] ) ) {
		return '';
	}

	return sprintf(
		'<p class="siraj-error" id="%s">%s</p>',
		esc_attr( siraj_booking_field_id( $key, $instance ) . '-error' ),
		esc_html( $errors[ $key ] )
	);
}

/**
 * Render one labelled text-like input with its hint and error message.
 *
 * `aria-required` is used instead of the HTML `required` attribute on purpose:
 * the browser's native bubbles would pre-empt the server-side messages this
 * form is built around, and the server validates regardless.
 *
 * @param string               $key        Short field name.
 * @param array<string,string> $attributes Extra attributes for the input.
 * @param int                  $instance   Form instance number.
 * @param array<string,mixed>  $values     Previously submitted values.
 * @param array<string,string> $errors     Validation errors keyed by field.
 * @return string Field markup.
 */
function siraj_booking_render_input_field( $key, array $attributes, $instance, array $values, array $errors ) {
	$field_id  = siraj_booking_field_id( $key, $instance );
	$has_error = isset( $errors[ $key ] );

	// Fixed attributes last: a caller cannot accidentally orphan the label.
	$input = array_merge(
		$attributes,
		array(
			'class'            => 'siraj-input',
			'id'               => $field_id,
			'name'             => 'siraj_' . $key,
			'value'            => isset( $values[ $key ] ) ? (string) $values[ $key ] : '',
			'aria-required'    => in_array( $key, siraj_booking_required_fields(), true ) ? 'true' : null,
			'aria-invalid'     => $has_error ? 'true' : null,
			'aria-describedby' => siraj_booking_describedby( $key, $instance, $has_error ),
		)
	);

	$out  = '<div class="siraj-field">';
	$out .= siraj_booking_render_label( $key, $field_id );
	$out .= '<input' . siraj_booking_render_attributes( $input ) . ' />';
	$out .= siraj_booking_render_hint( $key, $instance );
	$out .= siraj_booking_render_error( $key, $instance, $errors );
	$out .= '</div>';

	return $out;
}

/**
 * Render the service select, always listing the whitelist as its options.
 *
 * @param int                  $instance Form instance number.
 * @param array<string,mixed>  $values   Previously submitted values.
 * @param array<string,string> $errors   Validation errors keyed by field.
 * @return string Field markup.
 */
function siraj_booking_render_select_field( $instance, array $values, array $errors ) {
	$key       = 'service';
	$field_id  = siraj_booking_field_id( $key, $instance );
	$has_error = isset( $errors[ $key ] );
	$selected  = isset( $values[ $key ] ) ? (string) $values[ $key ] : '';

	$options = sprintf(
		'<option value="">%s</option>',
		esc_html__( 'من فضلك اختر الخدمة', 'siraj' )
	);

	foreach ( siraj_booking_services() as $service_key => $service_label ) {
		$options .= sprintf(
			'<option value="%s"%s>%s</option>',
			esc_attr( $service_key ),
			selected( $service_key, $selected, false ),
			esc_html( $service_label )
		);
	}

	$attributes = siraj_booking_render_attributes(
		array(
			'class'            => 'siraj-select',
			'id'               => $field_id,
			'name'             => 'siraj_service',
			'aria-required'    => 'true',
			'aria-invalid'     => $has_error ? 'true' : null,
			'aria-describedby' => siraj_booking_describedby( $key, $instance, $has_error ),
		)
	);

	$out  = '<div class="siraj-field">';
	$out .= siraj_booking_render_label( $key, $field_id );
	$out .= '<select' . $attributes . '>' . $options . '</select>';
	$out .= siraj_booking_render_hint( $key, $instance );
	$out .= siraj_booking_render_error( $key, $instance, $errors );
	$out .= '</div>';

	return $out;
}

/**
 * Render the optional notes textarea.
 *
 * @param int                  $instance Form instance number.
 * @param array<string,mixed>  $values   Previously submitted values.
 * @param array<string,string> $errors   Validation errors keyed by field.
 * @return string Field markup.
 */
function siraj_booking_render_textarea_field( $instance, array $values, array $errors ) {
	$key       = 'notes';
	$field_id  = siraj_booking_field_id( $key, $instance );
	$has_error = isset( $errors[ $key ] );

	$attributes = siraj_booking_render_attributes(
		array(
			'class'            => 'siraj-textarea',
			'id'               => $field_id,
			'name'             => 'siraj_notes',
			'rows'             => '4',
			'maxlength'        => (string) SIRAJ_BOOKING_NOTES_MAX,
			'aria-required'    => in_array( $key, siraj_booking_required_fields(), true ) ? 'true' : null,
			'aria-invalid'     => $has_error ? 'true' : null,
			'aria-describedby' => siraj_booking_describedby( $key, $instance, $has_error ),
		)
	);

	$out  = '<div class="siraj-field">';
	$out .= siraj_booking_render_label( $key, $field_id );
	$out .= '<textarea' . $attributes . '>' . esc_textarea( (string) ( $values[ $key ] ?? '' ) ) . '</textarea>';
	$out .= siraj_booking_render_hint( $key, $instance );
	$out .= siraj_booking_render_error( $key, $instance, $errors );
	$out .= '</div>';

	return $out;
}

/**
 * Render the consent checkbox and its label.
 *
 * This field builds its own label because the checkbox needs the full consent
 * sentence, not the short field label used in the error summary.
 *
 * @param int                  $instance Form instance number.
 * @param array<string,mixed>  $values   Previously submitted values.
 * @param array<string,string> $errors   Validation errors keyed by field.
 * @return string Field markup.
 */
function siraj_booking_render_consent_field( $instance, array $values, array $errors ) {
	$key       = 'consent';
	$field_id  = siraj_booking_field_id( $key, $instance );
	$has_error = isset( $errors[ $key ] );

	$checkbox = siraj_booking_render_attributes(
		array(
			'class'            => 'siraj-input',
			'type'             => 'checkbox',
			'id'               => $field_id,
			'name'             => 'siraj_consent',
			'value'            => '1',
			'checked'          => ! empty( $values[ $key ] ),
			'aria-required'    => 'true',
			'aria-invalid'     => $has_error ? 'true' : null,
			'aria-describedby' => siraj_booking_describedby( $key, $instance, $has_error ),
		)
	);

	$out  = '<div class="siraj-field"><div class="siraj-consent">';
	$out .= '<input' . $checkbox . ' />';
	$out .= sprintf(
		'<label class="siraj-label" for="%s">%s</label>',
		esc_attr( $field_id ),
		esc_html__( 'أوافق إن العيادة تتواصل معا لتأكيد الموعد', 'siraj' )
	);
	$out .= '</div>';
	$out .= siraj_booking_render_error( $key, $instance, $errors );
	$out .= '</div>';

	return $out;
}

/**
 * Render the honeypot field.
 *
 * `.siraj-hp` hides the wrapper visually in the theme stylesheet while leaving
 * it announced, so the input is never an unlabelled mystery box. `tabindex="-1"`
 * keeps it out of the tab order and `autocomplete="off"` lowers the chance a
 * password manager fills it and trips the check on an honest submission.
 *
 * @param int $instance Form instance number.
 * @return string Honeypot markup.
 */
function siraj_booking_render_honeypot( $instance ) {
	return sprintf(
		'<div class="siraj-hp">'
		. '<label for="%1$s">%2$s</label>'
		. '<input%3$s />'
		. '</div>',
		esc_attr( siraj_booking_field_id( 'website', $instance ) ),
		esc_html__( 'اترك هذا الحقل فارغًا', 'siraj' ),
		siraj_booking_render_attributes(
			array(
				'type'         => 'text',
				'id'           => siraj_booking_field_id( 'website', $instance ),
				'name'         => 'siraj_website',
				'autocomplete' => 'off',
				'tabindex'     => '-1',
			)
		)
	);
}

/**
 * Render the whole form, nonce fields included.
 *
 * @param array<string,mixed>  $values Previously submitted values.
 * @param array<string,string> $errors Validation errors keyed by field.
 * @return string Form markup.
 */
function siraj_booking_render_form( array $values, array $errors ) {
	$instance = siraj_booking_next_instance();

	$out  = '<form method="post">';
	$out .= siraj_booking_render_honeypot( $instance );
	$out .= '<div class="siraj-grid">';
	$out .= siraj_booking_render_input_field(
		'name',
		array(
			'type'         => 'text',
			'autocomplete' => 'name',
			'maxlength'    => '120',
		),
		$instance,
		$values,
		$errors
	);
	$out .= siraj_booking_render_input_field(
		'phone',
		array(
			// dir="ltr": a phone number reads left to right even on an RTL page.
			'dir'          => 'ltr',
			'type'         => 'tel',
			'inputmode'    => 'tel',
			'autocomplete' => 'tel',
		),
		$instance,
		$values,
		$errors
	);
	$out .= siraj_booking_render_select_field( $instance, $values, $errors );
	$out .= siraj_booking_render_input_field(
		'date',
		array(
			'type' => 'date',
			'min'  => current_time( 'Y-m-d' ),
		),
		$instance,
		$values,
		$errors
	);
	$out .= siraj_booking_render_textarea_field( $instance, $values, $errors );
	$out .= siraj_booking_render_consent_field( $instance, $values, $errors );
	$out .= '<div class="siraj-actions">'
		. sprintf(
			'<button class="siraj-submit btn btn-primary" type="submit">%s</button>',
			esc_html__( 'إرسال الطلب', 'siraj' )
		)
		. '</div>';
	$out .= '</div>';
	$out .= wp_nonce_field( SIRAJ_BOOKING_NONCE, SIRAJ_BOOKING_NONCE, true, false );
	$out .= '<input type="hidden" name="siraj_booking_form" value="1" />';
	$out .= '</form>';

	return $out;
}

/**
 * Render the summary of every error, announced as soon as the page loads.
 *
 * Form-level problems (nonce, honeypot, save failure) are keyed `form`, which is
 * not in the field labels, so they get no field-name prefix.
 *
 * @param array<string,string> $errors Validation errors keyed by field.
 * @return string Alert markup, or '' when there is nothing wrong.
 */
function siraj_booking_render_alert( array $errors ) {
	if ( ! $errors ) {
		return '';
	}

	$labels = siraj_booking_field_labels();
	$items  = '';

	foreach ( $errors as $key => $message ) {
		$prefix = isset( $labels[ $key ] ) ? $labels[ $key ] . ': ' : '';
		$items .= '<li>' . esc_html( $prefix . $message ) . '</li>';
	}

	return '<div class="siraj-alert" role="alert">'
		. '<p>' . esc_html__( 'من فضلك راجع الحقول التالية:', 'siraj' ) . '</p>'
		. '<ul>' . $items . '</ul>'
		. '</div>';
}

/**
 * Render the confirmation shown instead of the form after an accepted request.
 *
 * `tabindex="-1"` keeps the block focusable so assistive tech can move focus to
 * it, without adding a tab stop.
 *
 * @return string Confirmation markup.
 */
function siraj_booking_render_success() {
	return '<div class="siraj-success" role="status" tabindex="-1">'
		. '<p>' . esc_html__( 'تم استلام طلبك بنجاح، هيتم التواصل معك لتأكيد الموعد.', 'siraj' ) . '</p>'
		. '<p class="siraj-hint">' . esc_html__( 'الرد بيكون على واتساب أو اتصال خلال ساعات العمل.', 'siraj' ) . '</p>'
		. '</div>'
		// A role="status" block that exists from page load is not announced by
		// screen readers, and focus would stay on <body> (a11y audit F6) — move
		// focus to the confirmation explicitly. The tab order is unchanged:
		// tabindex="-1" keeps it out of the tab sequence.
		. '<script>document.querySelector(\'.siraj-success\')?.focus();</script>';
}