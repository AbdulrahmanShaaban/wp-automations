<?php
/**
 * seed-wp.php — everything scripts/seed.sh needs inside ONE WordPress boot.
 * Loaded by scripts/seed.sh via:
 *   wp eval-file /var/www/html/wp-content/plugins/nilad-core/seed-wp.php
 *
 * Why one file: each `wp` CLI call pays a full WP boot (~20–260s on a loaded
 * host) — the old bash loop made ~45 boots per seed run (40+ minutes). Language
 * installs and the Paymob download stay in seed.sh (they need CLI/network);
 * everything else converges here. IDEMPOTENT: safe to run twice.
 *
 * Page HTML lives in assets/content/*.html (moved from scripts/content — the
 * container only mounts the plugin dir).
 */

if (!defined('ABSPATH')) {
    exit;
}

function nilad_seed_page_id($name, $title) {
    $found = get_posts(array(
        'post_type'   => 'page',
        'name'        => $name,
        'post_status' => 'any',
        'numberposts' => 1,
    ));
    if ($found) {
        $id = (int) $found[0]->ID;
        echo "    exists:      {$name} (#{$id})\n";
        return $id;
    }
    $id = wp_insert_post(array(
        'post_type'   => 'page',
        'post_status' => 'publish',
        'post_title'  => $title,
        'post_name'   => $name,
    ));
    echo "    created page: {$name} (#{$id})\n";
    return (int) $id;
}

function nilad_seed_import_image($slug) {
    $found = get_posts(array(
        'post_type'   => 'attachment',
        'name'        => $slug,
        'post_status' => 'inherit',
        'fields'      => 'ids',
        'numberposts' => 1,
    ));
    if ($found) {
        echo "    image exists:   {$slug}.jpg (#{$found[0]})\n";
        return (int) $found[0];
    }
    $src = __DIR__ . '/assets/product-placeholders/' . $slug . '.jpg';
    if (!file_exists($src)) {
        echo "    no file: {$slug}.jpg (skipped — regenerate with scripts/make-placeholders.ps1)\n";
        return 0;
    }
    $upload = wp_upload_bits($slug . '.jpg', null, file_get_contents($src));
    if (!empty($upload['error'])) {
        echo "    upload failed {$slug}: {$upload['error']}\n";
        return 0;
    }
    $att_id = wp_insert_attachment(array(
        'post_mime_type' => 'image/jpeg',
        'post_title'     => $slug,
        'post_status'    => 'inherit',
        'post_content'   => '',
    ), $upload['file']);
    if (is_wp_error($att_id) || !$att_id) {
        echo "    attach failed {$slug}\n";
        return 0;
    }
    require_once ABSPATH . 'wp-admin/includes/image.php';
    require_once ABSPATH . 'wp-admin/includes/file.php';
    require_once ABSPATH . 'wp-admin/includes/media.php';
    wp_update_attachment_metadata($att_id, wp_generate_attachment_metadata($att_id, $upload['file']));
    echo "    imported image: {$slug}.jpg (#{$att_id})\n";
    return (int) $att_id;
}

echo "==> Seed: site identity + Arabic\n";
update_option('blogname', 'نيلاد');
update_option('blogdescription', 'أزياء وإكسسوارات — متجر تجريبي (Demo)');
update_option('WPLANG', 'ar');

echo "==> Seed: pages (idempotent)\n";
nilad_seed_page_id('home', 'الرئيسية');
nilad_seed_page_id('about', 'عن نيلاد');
nilad_seed_page_id('contact', 'تواصل معنا');
nilad_seed_page_id('shipping-returns', 'الشحن والإرجاع');
nilad_seed_page_id('privacy', 'الخصوصية');

// WordPress ships a "Sample Page" nobody wants — remove it if present.
$sample = get_posts(array(
    'post_type'   => 'page',
    'name'        => 'sample-page',
    'post_status' => 'any',
    'numberposts' => 1,
));
if ($sample) {
    wp_delete_post($sample[0]->ID, true);
    echo "    deleted sample-page (#{$sample[0]->ID})\n";
}

// The default "Hello world!" post is sample content too — it was the only post
// in the sitemap and shipped with comments open (audit security #14 / perf #8).
$hello = get_posts(array(
    'post_type'   => 'post',
    'name'        => 'hello-world',
    'post_status' => 'any',
    'numberposts' => 1,
));
if ($hello) {
    wp_delete_post($hello[0]->ID, true);
    echo "    deleted hello-world (#{$hello[0]->ID})\n";
}
// Products keep reviews; everything else defaults to closed comments.
update_option('default_comment_status', 'closed');

echo "==> Seed: page content from assets/content/*.html (idempotent)\n";
foreach (array('about', 'contact', 'shipping-returns', 'privacy') as $slug) {
    $file = __DIR__ . '/assets/content/' . $slug . '.html';
    if (!file_exists($file)) {
        continue;
    }
    $found = get_posts(array(
        'post_type'   => 'page',
        'name'        => $slug,
        'post_status' => 'any',
        'numberposts' => 1,
    ));
    if (!$found) {
        continue;
    }
    wp_update_post(array(
        'ID'           => $found[0]->ID,
        'post_content' => file_get_contents($file),
    ));
    echo "    content set: {$slug} (#{$found[0]->ID})\n";
}

$home = get_posts(array(
    'post_type'   => 'page',
    'name'        => 'home',
    'post_status' => 'any',
    'numberposts' => 1,
));
if ($home) {
    update_option('show_on_front', 'page');
    update_option('page_on_front', (int) $home[0]->ID);
    echo "    front page -> home (#{$home[0]->ID})\n";
}

if (!class_exists('WooCommerce')) {
    echo "==> Seed: (woocommerce not active yet — settings/catalog skipped)\n";
    echo "==> Seed done (idempotent — run again = no duplicates).\n";
    return;
}

echo "==> Seed: WooCommerce base settings\n";
update_option('woocommerce_store_address', 'القاهرة');
// State code must be WC's actual EG code (EGC), not the city name — an invalid
// code leaves the governorate select blank and breaks state-zone matching.
update_option('woocommerce_default_country', 'EG:EGC');
update_option('woocommerce_currency', 'EGP');
// Demo ships to Egypt only (governorate zones, Phase 4).
update_option('woocommerce_ship_to_countries', 'EG');
// Order notes + guest checkout are WC defaults, but converge explicitly so a
// settings drift can't silently remove them.
update_option('woocommerce_enable_order_notes', 'yes');
update_option('woocommerce_enable_guest_checkout', 'yes');
update_option('woocommerce_currency_pos', 'right_space');
update_option('woocommerce_price_thousand_sep', ',');
update_option('woocommerce_price_decimal_sep', '.');
update_option('woocommerce_price_num_decimals', '0');
// Skip the setup wizard on a scripted site; it is click-together state.
update_option('woocommerce_task_list_hidden', 'yes');
update_option('woocommerce_onboarding_profile', array('completed' => true, 'skipped' => true));
// WooCommerce 9+ onboarding silently enables "coming soon" mode, which serves an
// empty wp-site-blocks page for shop/cart/product to anonymous visitors.
update_option('woocommerce_coming_soon', 'no');
update_option('woocommerce_coming_soon_store_pages_only', 'no');
// Demo store: no review forms (empty English review UI looked broken).
update_option('woocommerce_enable_reviews', 'no');
// COD available from day one (Egypt rule); shipping zones refined by seed-catalog.
update_option('woocommerce_cod_settings', array(
    'enabled'            => 'yes',
    'title'              => 'الدفع عند الاستلام',
    'description'        => 'ادفع كاش لما الشحنة توصلك',
    'instructions'       => 'جهّز المبلغ التقريبي لو ممكن',
    'enable_for_methods' => array(),
    'enable_for_virtual' => 'yes',
));
echo "    currency=EGP, decimals=0, COD=enabled\n";
// Arabic branded transactional emails (colors = approved design palette).
update_option('woocommerce_email_footer_text', 'نيلاد — متجر تجريبي (Demo) · القاهرة، مصر · هذا البريد يُرسل تلقائيًا.');
update_option('woocommerce_email_base_color', '#0B6B57');
update_option('woocommerce_email_heading_color', '#0B6B57');
update_option('woocommerce_email_body_background_color', '#FAF8F4');
update_option('woocommerce_email_text_color', '#1B1A17');
echo "    email branding applied (Arabic footer + design palette)\n";
// WooCommerce ships English page titles (slug stays WC's requirement).
$retitle = array(
    'shop'      => 'المتجر',
    'cart'      => 'السلة',
    'checkout'  => 'إتمام الطلب',
    'my-account' => 'حسابي',
);
foreach ($retitle as $slug => $title) {
    $found = get_posts(array(
        'post_type'   => 'page',
        'name'        => $slug,
        'post_status' => 'any',
        'numberposts' => 1,
    ));
    if ($found && $found[0]->post_title !== $title) {
        wp_update_post(array('ID' => $found[0]->ID, 'post_title' => $title));
    }
}
echo "    Woo pages retitled (Arabic)\n";

echo "==> Seed: catalog — import demo images, categories, products, shipping (idempotent)\n";
foreach (array('abaya', 'bag', 'watch', 'sunglasses', 'shirt', 'scarf', 'dress', 'tee') as $slug) {
    nilad_seed_import_image($slug);
}

// Social preview image (Open Graph / Twitter card). Stored as an option so
// nilad-core/qa-hardening.php can print og:image on every page, and used as the
// site icon so WordPress itself has a brand mark. Idempotent by attachment slug.
$og_id = nilad_seed_import_image('og-nilad');
if ($og_id) {
    update_option('nilad_og_image_id', (int) $og_id, false);
    if (!get_option('site_icon')) {
        update_option('site_icon', (int) $og_id);
    }
    echo "    og:image attachment #{$og_id}\n";
}
// Categories + 8 demo products + shipping zones + bank transfer + cart strings.
include __DIR__ . '/seed-catalog.php';

/* ---------- verification echo (single-run evidence for logs/docs) ---------- */
echo "== VERIFY: shipping zones ==\n";
global $wpdb;
$zones = $wpdb->get_results("SELECT zone_id, zone_name, zone_order FROM {$wpdb->prefix}woocommerce_shipping_zones ORDER BY zone_order ASC, zone_id ASC");
if (!$zones) {
    echo "  NO ZONES FOUND\n";
}
foreach ($zones as $z) {
    $locs = $wpdb->get_results($wpdb->prepare(
        "SELECT location_code, location_type FROM {$wpdb->prefix}woocommerce_shipping_zone_locations WHERE zone_id = %d AND location_type != 'geo'",
        $z->zone_id
    ));
    $codes = array();
    foreach ($locs as $l) {
        $codes[] = $l->location_type . ':' . $l->location_code;
    }
    $methods = $wpdb->get_results($wpdb->prepare(
        "SELECT instance_id, method_id FROM {$wpdb->prefix}woocommerce_shipping_zone_methods WHERE zone_id = %d",
        $z->zone_id
    ));
    $ms = array();
    foreach ($methods as $m) {
        $opt = get_option("woocommerce_{$m->method_id}_{$m->instance_id}_settings", array());
        $detail = ('flat_rate' === $m->method_id)
            ? 'cost=' . (isset($opt['cost']) ? $opt['cost'] : '?')
            : 'req=' . (isset($opt['requires']) ? $opt['requires'] : '?') . ',min=' . (isset($opt['min_amount']) ? $opt['min_amount'] : '?');
        $ms[] = "{$m->method_id}#{$m->instance_id}({$detail})";
    }
    echo "  zone #{$z->zone_id} \"{$z->zone_name}\" order={$z->zone_order} locs=[" . implode(', ', $codes) . "] methods=[" . implode(', ', $ms) . "]\n";
}

echo "== VERIFY: product IDs (for scripts/phase4-test.js args) ==\n";
foreach (array('embroidered-abaya', 'oversized-cotton-tee') as $pslug) {
    $found = get_posts(array(
        'post_type'   => 'product',
        'name'        => $pslug,
        'post_status' => 'publish',
        'fields'      => 'ids',
        'numberposts' => 1,
    ));
    echo "  {$pslug}: " . ($found ? '#' . $found[0] : 'NOT FOUND') . "\n";
}
$counts = wp_count_posts('product');
echo "  products published: " . (int) $counts->publish . "\n";
echo "  default country: " . get_option('woocommerce_default_country') . "\n";
echo "  ship to: " . get_option('woocommerce_ship_to_countries') . "\n";
echo "==> Seed done (idempotent — run again = no duplicates).\n";
