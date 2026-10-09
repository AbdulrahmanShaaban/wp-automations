<?php
/**
 * Siraj Theme — presentation only.
 * All business logic (booking) lives in the siraj-core plugin (never in the theme).
 *
 * @package Siraj
 */

defined( 'ABSPATH' ) || exit;

add_action( 'after_setup_theme', static function () {
	add_theme_support( 'wp-block-styles' );
	add_theme_support( 'responsive-embeds' );
	add_theme_support( 'editor-styles' );
	add_editor_style( 'style.css' );
} );

/**
 * Styles.
 *
 * Fonts: self-hosted Alexandria (assets/css/fonts.css, produced once by
 * scripts/fetch-fonts.mjs) — no render-blocking third-party request. This is
 * the P1 perf-audit lesson applied at birth; the Google Fonts CDN is only a
 * fallback when the local files are missing.
 */
add_action( 'wp_enqueue_scripts', static function () {
	if ( file_exists( get_theme_file_path( 'assets/css/fonts.css' ) ) ) {
		wp_enqueue_style(
			'siraj-fonts',
			get_theme_file_uri( 'assets/css/fonts.css' ),
			array(),
			wp_get_theme()->get( 'Version' )
		);
	} else {
		wp_enqueue_style(
			'siraj-fonts',
			'https://fonts.googleapis.com/css2?family=Alexandria:wght@400;500;600;700;800&display=swap',
			array(),
			null
		);
	}

	// Block themes do not load style.css automatically — enqueue it explicitly.
	wp_enqueue_style(
		'siraj-style',
		get_stylesheet_uri(),
		array( 'siraj-fonts' ),
		wp_get_theme()->get( 'Version' )
	);

	// Brand mark URL: SVGs cannot be WP media attachments (no SVG upload in
	// core), so the header/footer logo is a CSS background fed from PHP.
	wp_add_inline_style(
		'siraj-style',
		':root{--siraj-logo:url("' . esc_url( get_theme_file_uri( 'assets/img/logo-mark.svg' ) ) . '")}'
	);
}, 20 );

/**
 * Motion: reveal-on-scroll for the content sections.
 *
 * No third-party library (the design preview used GSAP from a CDN; a clinic demo
 * should not ship a render-blocking third-party script — the same lesson the P1
 * audit produced for fonts). A scroll-driven CSS variant was tried first and
 * dropped: it can strand sections at opacity 0 when a browser parses the
 * @supports condition without driving the timeline (measured 24/24 hidden with
 * scripts off). So the reveal is script-only and fails safe — the script adds
 * `js-motion` to <html> itself, which is what enables the hidden state, so no
 * script means no hidden content.
 */
add_action( 'wp_footer', static function () {
	?>
	<script>
	(function(){
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) { return; }
		if (!('IntersectionObserver' in window)) { return; }
		var els = document.querySelectorAll('.reveal');
		if (!els.length) { return; }
		document.documentElement.classList.add('js-motion');
		var io = new IntersectionObserver(function(entries){
			entries.forEach(function(e){
				if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
			});
		},{ threshold:.12, rootMargin:'0px 0px -6% 0px' });
		els.forEach(function(el){ io.observe(el); });
	})();
	</script>
	<?php
} );

/**
 * Favicon — the generated mark, served straight from the theme.
 */
add_action( 'wp_head', static function () {
	printf(
		'<link rel="icon" href="%s" type="image/svg+xml">',
		esc_url( get_theme_file_uri( 'assets/img/favicon.svg' ) )
	);
}, 5 );
