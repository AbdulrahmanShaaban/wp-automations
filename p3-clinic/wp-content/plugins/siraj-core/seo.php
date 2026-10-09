<?php
/**
 * seo.php — meta description, Open Graph/Twitter tags, and JSON-LD.
 *
 * The kit's P3 SEO audit found zero metadata on every page (no SEO plugin is
 * installed and WP core emits none), so the plugin owns it: descriptions are
 * per-page Arabic copy, and JSON-LD carries only facts that appear verbatim on
 * the pages (address/hours/phone from the contact band, FAQ from the
 * front-page template — the FAQPage block itself lives next to the <details>
 * elements in templates/front-page.html so the two cannot drift apart).
 *
 * @package Siraj
 */

defined( 'ABSPATH' ) || exit;

/**
 * Arabic meta description per page slug (fallback for anything unmapped).
 *
 * @return string Description text, ~110–140 characters.
 */
function siraj_seo_description() {
	$descriptions = array(
		''          => 'عيادة سِراج للأسنان في وسط البلد، القاهرة — فحص وتجميل وتقويم وزراعة أسنان، حجز أونلاين وتأكيد خلال يوم. نموذج تجريبي.',
		'services'  => 'خدمات أسنان بأسعار ومدد واضحة: فحص وتشخيص، تنظيف وتلميع، حشو وعلاج عصب، تقويم، وزراعة سن — مع تسعير مكتوب قبل البدء. عيادة سِراج (Demo).',
		'team'      => 'تعرّف على تخصصات فريق عيادة سِراج — طب التقويم والزراعة والتجميل والاستقبال، بدور واضح لكل تخصص. نموذج تجريبي بدون أسماء حقيقية.',
		'contact'   => 'تواصل مع عيادة سِراج في وسط البلد، القاهرة — الهاتف، والمواعيد يوميًا من 10 صباحًا حتى 9 مساءً، والتأمين. نموذج تجريبي.',
		'book'      => 'احجز زيارة لعيادة سِراج في أقل من دقيقة — املأ النموذج وبيتم التأكيد على واتساب أو الاتصال. بياناتك مش بتتخزن عند أي طرف تالت.',
	);

	$slug = '';

	if ( is_singular() ) {
		$slug = (string) get_post_field( 'post_name', get_queried_object_id() );
	}

	return $descriptions[ $slug ] ?? $descriptions[''];
}

/**
 * The page's canonical URL (lowercase, no trailing noise).
 *
 * @return string Absolute URL.
 */
function siraj_seo_url() {
	if ( is_singular() ) {
		$url = wp_get_canonical_url();

		if ( $url ) {
			return $url;
		}
	}

	return home_url( '/' );
}

/**
 * The page title used for og:title (already deduped by WP for the <title>).
 *
 * @return string Title text.
 */
function siraj_seo_title() {
	if ( is_singular() ) {
		$title = wp_get_document_title();

		if ( $title ) {
			return $title;
		}
	}

	return get_bloginfo( 'name', 'display' );
}

/**
 * Print meta description + OG/Twitter tags. One shot, priority 1 so the
 * description lands before theme markup.
 */
function siraj_seo_print_tags() {
	$description = siraj_seo_description();
	$title       = siraj_seo_title();
	$url         = siraj_seo_url();
	$image       = get_theme_file_uri( 'assets/img/share-1200x630.png' );
	$name        = get_bloginfo( 'name', 'display' );
	$alt         = $name . ' — نموذج تجريبي';

	printf( '<meta name="description" content="%s">' . "\n", esc_attr( $description ) );

	printf( '<meta property="og:site_name" content="%s">' . "\n", esc_attr( $name ) );
	printf( '<meta property="og:locale" content="ar_AR">' . "\n" );
	printf( '<meta property="og:type" content="website">' . "\n" );
	printf( '<meta property="og:title" content="%s">' . "\n", esc_attr( $title ) );
	printf( '<meta property="og:description" content="%s">' . "\n", esc_attr( $description ) );
	printf( '<meta property="og:url" content="%s">' . "\n", esc_url( $url ) );
	printf( '<meta property="og:image" content="%s">' . "\n", esc_url( $image ) );
	printf( '<meta property="og:image:width" content="1200">' . "\n" );
	printf( '<meta property="og:image:height" content="630">' . "\n" );
	printf( '<meta property="og:image:alt" content="%s">' . "\n", esc_attr( $alt ) );

	printf( '<meta name="twitter:card" content="summary_large_image">' . "\n" );
	printf( '<meta name="twitter:title" content="%s">' . "\n", esc_attr( $title ) );
	printf( '<meta name="twitter:description" content="%s">' . "\n", esc_attr( $description ) );
	printf( '<meta name="twitter:image" content="%s">' . "\n", esc_url( $image ) );
	printf( '<meta name="twitter:image:alt" content="%s">' . "\n", esc_attr( $alt ) );
}
add_action( 'wp_head', 'siraj_seo_print_tags', 1 );

/**
 * JSON-LD: Dentist on every page + BreadcrumbList on inner pages.
 *
 * Every property below is copy the visitor can read on the page itself —
 * name, telephone and hours come from the contact band, address from the
 * contact page lead. No invented geo coordinates, no review stars, no price
 * claims beyond what the services page prints.
 */
function siraj_seo_print_json_ld() {
	$home  = home_url( '/' );
	$name  = get_bloginfo( 'name', 'display' );
	$image = get_theme_file_uri( 'assets/img/share-1200x630.png' );

	$clinic = array(
		'@type'       => 'Dentist',
		'@id'         => $home . '#clinic',
		'url'         => $home,
		'name'        => $name,
		'image'       => $image,
		'telephone'   => '+201000000000',
		'priceRange'  => 'EGP',
		'address'     => array(
			'@type'           => 'PostalAddress',
			'streetAddress'   => 'وسط البلد',
			'addressLocality' => 'القاهرة',
			'addressCountry'  => 'EG',
		),
		'openingHoursSpecification' => array(
			'@type'     => 'OpeningHoursSpecification',
			'dayOfWeek' => array( 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday' ),
			'opens'     => '10:00',
			'closes'    => '21:00',
		),
	);

	$graph = array( $clinic );

	if ( is_singular() ) {
		$crumbs = array(
			array(
				'@type'    => 'ListItem',
				'position' => 1,
				'name'     => 'الرئيسية',
				'item'     => $home,
			),
		);

		if ( ! is_front_page() ) {
			$crumbs[] = array(
				'@type'    => 'ListItem',
				'position' => 2,
				'name'     => wp_get_document_title(),
				'item'     => siraj_seo_url(),
			);
		}

		$graph[] = array(
			'@type'        => 'BreadcrumbList',
			'itemListElement' => $crumbs,
		);
	}

	$payload = array( '@context' => 'https://schema.org', '@graph' => $graph );

	printf(
		'<script type="application/ld+json">%s</script>' . "\n",
		wp_json_encode( $payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES )
	);
}
add_action( 'wp_head', 'siraj_seo_print_json_ld', 3 );
