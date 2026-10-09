<?php
/**
 * Phase 6 QA module — loaded from nilad-core.php.
 *
 * Fixes the measured findings in docs/QA-REPORT.md (axe-core + custom checks on
 * the local storefront):
 *   1. Missing security response headers (nosniff / frame-options / referrer-policy
 *      / permissions-policy) and the leaking `Server` + `X-Powered-By` headers.
 *   2. Missing meta description, Open Graph tags and JSON-LD structured data
 *      (Organization + WebSite on the storefront, Product on products).
 *   3. The site title renders as <h1> on the front page, colliding with the hero
 *      <h1> (two h1 elements). The brand is a logo, not a page heading, so it is
 *      demoted to <p> and each template keeps its own single h1.
 *
 * Kept in its own file so the perf-critical plugin stays readable, and because
 * these are all filters/one action — no template edits required.
 *
 * @package Nilad
 */

defined( 'ABSPATH' ) || exit;

/* -------------------------------------------------------------------------
 * 1. Security headers
 * ---------------------------------------------------------------------- */

// Local demo runs over plain http on localhost, so HSTS is intentionally NOT set
// here (it would be ignored for http and dangerous to ship misconfigured).
add_action( 'send_headers', static function () {
	if ( is_admin() || wp_doing_ajax() || wp_doing_cron() ) {
		return;
	}
	header( 'X-Content-Type-Options: nosniff' );
	header( 'X-Frame-Options: SAMEORIGIN' );
	header( 'Referrer-Policy: strict-origin-when-cross-origin' );
	header( 'Permissions-Policy: geolocation=(), microphone=(), camera=(), interest-cohort=()' );
	header( 'X-XSS-Protection: 0' ); // modern browsers: the legacy filter caused bugs.

	// Do not advertise the stack (Apache version / PHP version).
	header_remove( 'X-Powered-By' );
	header_remove( 'Server' );
}, 1 );

/* -------------------------------------------------------------------------
 * 2 + 3. SEO meta, JSON-LD, single h1
 * ---------------------------------------------------------------------- */

/**
 * Per-context description text. Kept in Arabic and short enough for the 50-160
 * character search-snippet window.
 */
function nilad_qa_meta_description() {
	if ( is_front_page() ) {
		return 'نيلاد — متجر أزياء وإكسسوارات مصري: هدوم مختارة بخامات مريحة، أسعار واضحة، شحن لكل المحافظات، ودفع كاش عند الاستلام. متجر تجريبي للعرض.';
	}
	if ( is_shop() ) {
		return 'تسوّق كل منتجات نيلاد: هدوم، حقائب، ساعات، نظارات وإكسسوارات — بأسعار واضحة وشحن لكل المحافظات ودفع عند الاستلام.';
	}
	if ( is_product() ) {
		global $product;
		if ( $product instanceof WC_Product ) {
			$short = trim( wp_strip_all_tags( $product->get_short_description() ) );
			$name  = $product->get_name();
			if ( '' === $short ) {
				$short = sprintf( 'قطعة من %s بخامة مريحة وسعر واضح', $name );
			}
			// Search snippets need 50-160 characters; WooCommerce short descriptions
			// are often 30, so pad with the storefront promise rather than shipping a
			// description that reads as empty in Google.
			$desc = sprintf(
				'%s — من نيلاد: توصيل لكل المحافظات، دفع كاش عند الاستلام، وإرجاع سهل خلال ١٤ يوم.',
				$short
			);
			return mb_substr( $desc, 0, 158 );
		}
	}
	if ( is_singular() ) {
		$excerpt = get_the_excerpt();
		if ( $excerpt ) {
			return mb_substr( trim( wp_strip_all_tags( $excerpt ) ), 0, 155 );
		}
	}
	return 'نيلاد — متجر أزياء وإكسسوارات مصري للنساء والرجال: هدوم وحقائب وساعات ونظارات، شحن لكل المحافظات ودفع كاش عند الاستلام.';
}

add_action( 'wp_head', static function () {
	if ( is_feed() || is_robots() ) {
		return;
	}

	$description = nilad_qa_meta_description();
	$title       = wp_get_document_title();
	$url         = home_url( add_query_arg( array() ) );
	$image       = '';

	// Social image priority: product image > the seeded brand card
	// (option nilad_og_image_id, also used as the site icon) > none. An empty
	// og:image is worse than none, so it is only printed when we have a real URL.
	$og_default = (int) get_option( 'nilad_og_image_id' );
	if ( $og_default ) {
		$image = (string) wp_get_attachment_image_url( $og_default, 'full' );
	}
	if ( is_product() ) {
		global $product;
		if ( $product instanceof WC_Product && $product->get_image_id() ) {
			$product_image = (string) wp_get_attachment_image_url( $product->get_image_id(), 'large' );
			if ( $product_image ) {
				$image = $product_image;
			}
		}
	}

	printf(
		'<meta name="description" content="%s" />' . "\n",
		esc_attr( $description )
	);

	// Canonical: WordPress prints rel=canonical on singular views, and does NOT
	// print it for the WooCommerce shop archive — which used to give every page
	// two identical canonical tags. Print ours only where core stays silent.
	if ( ! is_singular() ) {
		printf( '<link rel="canonical" href="%s" />' . "\n", esc_url( $url ) );
	}
	printf(
		'<meta property="og:locale" content="%s" />' . "\n",
		esc_attr( str_replace( '_', '-', get_bloginfo( 'language' ) ) )
	);
	printf( '<meta property="og:type" content="%s" />' . "\n", is_singular( 'post' ) ? 'article' : 'website' );
	printf( '<meta property="og:site_name" content="%s" />' . "\n", esc_attr( get_bloginfo( 'name' ) ) );
	printf( '<meta property="og:title" content="%s" />' . "\n", esc_attr( $title ) );
	printf( '<meta property="og:description" content="%s" />' . "\n", esc_attr( $description ) );
	printf( '<meta property="og:url" content="%s" />' . "\n", esc_url( $url ) );
	if ( $image ) {
		printf( '<meta property="og:image" content="%s" />' . "\n", esc_url( $image ) );
	}
	printf( '<meta name="twitter:card" content="%s" />' . "\n", $image ? 'summary_large_image' : 'summary' );

	// ---- JSON-LD: Organization (+ WebSite on the storefront). Product pages get
	// WooCommerce's own richer Product node — see below.
	$home  = home_url( '/' );
	$org   = array(
		'@type'       => 'Organization',
		'@id'         => $home . '#organization',
		'name'        => get_bloginfo( 'name' ),
		'url'         => $home,
		'description' => nilad_qa_meta_description(),
		'address'     => array(
			'@type'           => 'PostalAddress',
			'addressCountry' => 'EG',
			'addressLocality' => 'القاهرة',
		),
	);
	$graph = array( $org );

	if ( is_front_page() || is_shop() ) {
		$graph[] = array(
			'@type'           => 'WebSite',
			'@id'             => $home . '#website',
			'url'             => $home,
			'name'            => get_bloginfo( 'name' ),
			'description'     => nilad_qa_meta_description(),
			'inLanguage'      => get_bloginfo( 'language' ),
			'publisher'       => array( '@id' => $home . '#organization' ),
		);
	}

	// Product structured data is owned by WooCommerce (richer: offer array with
	// UnitPriceSpecification, validThrough, inventory). This module used to emit a
	// second Product node sharing Woo's @id — two entities for one product. The
	// graph below keeps Organization (+ WebSite on home/shop) only.

	printf(
		'<script type="application/ld+json">%s</script>' . "\n",
		wp_json_encode(
			array(
				'@context' => 'https://schema.org',
				'@graph'   => $graph,
			),
			JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
		)
	);
}, 2 );

/**
 * Block-checkout attribute fixes (audit a11y F4/F9).
 *
 * The Contact email field ships `autocomplete="section-contact contact email"` —
 * `contact` is not a valid WHATWG autofill token (axe `autocomplete-valid`,
 * serious, WCAG 1.3.5). The tel/email/postcode inputs also lack `inputmode` /
 * `dir="ltr"`, which breaks Latin entry inside the RTL layout. Both attributes
 * are rendered by React (Woo blocks), so patch them post-hydration.
 */
add_action( 'wp_footer', static function () {
	if ( ! function_exists( 'is_checkout' ) || ! is_checkout() ) {
		return;
	}
	?>
	<script>
	(function(){
		function patch(){
			var email=document.getElementById('email');
			if(email&&email.getAttribute('autocomplete')!=='email'){email.setAttribute('autocomplete','email');}
			var phone=document.getElementById('phone')||document.querySelector('input[type="tel"]');
			if(phone){
				if(!phone.getAttribute('inputmode')){phone.setAttribute('inputmode','tel');}
				if(!phone.getAttribute('dir')){phone.setAttribute('dir','ltr');}
			}
			var latins=document.querySelectorAll('input[type="email"],#postcode,input[autocomplete*="postcode"]');
			Array.prototype.forEach.call(latins,function(el){if(!el.getAttribute('dir')){el.setAttribute('dir','ltr');}});
		}
		if(document.readyState!=='loading'){patch();}else{document.addEventListener('DOMContentLoaded',patch);}
		setTimeout(patch,800);
	})();
	</script>
	<?php
} );

/**
 * Sitemap hygiene (audit perf #8).
 *
 * The core sitemap listed the `noindex` WooCommerce pages (cart / checkout /
 * my-account) and the author archive. noindex URLs must not be advertised for
 * indexing, and /author/admin/ 301s to the home page now, so both are removed
 * from the map rather than left to be discovered.
 */

// 1. Unregister the users provider → no /author/ URLs in the sitemap.
add_filter( 'wp_sitemaps_add_provider', static function ( $provider, $name ) {
	if ( 'users' === $name ) {
		return null;
	}
	return $provider;
}, 10, 2 );

// 2. Exclude the noindex pages from the page sitemap.
add_filter( 'wp_sitemaps_posts_query_args', static function ( array $args, $post_type ): array {
	if ( 'page' !== $post_type ) {
		return $args;
	}
	$exclude = array();
	foreach ( array( 'cart', 'checkout', 'my-account' ) as $slug ) {
		$page = get_page_by_path( $slug );
		if ( $page ) {
			$exclude[] = (int) $page->ID;
		}
	}
	if ( $exclude ) {
		$args['post__not_in'] = $exclude;
	}
	return $args;
}, 10, 2 );

/**
 * Demote the site title from <h1> to <p>.
 *
 * WordPress renders `core/site-title` as <h1> on the front page. The brand mark
 * in the header is a logo, not the page heading, so on the storefront it collided
 * with the hero headline (two h1 elements, axe "page-has-heading-one" noise and an
 * ambiguous document outline). Templates already emit their own single h1.
 */
add_filter( 'render_block', static function ( $html, $block ) {
	if ( ! is_string( $html ) || '' === $html ) {
		return $html;
	}
	$name = $block['blockName'] ?? '';

	if ( 'core/site-title' === $name ) {
		$html = preg_replace( '#<h1(\s[^>]*)?>#i', '<p$1>', $html );
		$html = preg_replace( '#</h1>#i', '</p>', $html );
		return $html;
	}

	// WooCommerce's shipped cart/checkout block templates wrap the header and
	// footer parts in <header>/<footer> elements of their own. Because our
	// parts/header.html and parts/footer.html already provide those landmarks,
	// the cart and checkout pages rendered *nested* banner/contentinfo landmarks
	// plus duplicates of each (axe: landmark-banner-is-top-level,
	// landmark-no-duplicate-banner, landmark-unique). The extra wrapper carries no
	// content of its own, so demote it to a plain div and keep our single pair.
	if ( 'core/template-part' === $name && isset( $block['attrs']['tagName'] ) &&
		in_array( $block['attrs']['tagName'], array( 'header', 'footer' ), true ) ) {
		$html = preg_replace( '#<(header|footer)(\s[^>]*)?>#i', '<div$2>', $html, 1 );
		$html = preg_replace( '#</(header|footer)>#i', '</div>', $html, 1 );
	}

	return $html;
}, 10, 2 );
