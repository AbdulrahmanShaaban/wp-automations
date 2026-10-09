<?php
/**
 * seed-catalog.php — idempotent demo catalog + shipping/payment config (Phase 3).
 * Lives inside the mounted plugin dir so wp-cli can reach it; loaded by
 * scripts/seed.sh via:
 *   wp eval-file /var/www/html/wp-content/plugins/nilad-core/seed-catalog.php
 * (base64-in-argv was abandoned: ~9KB trips Windows' command-line length limit;
 * raw multiline args get truncated by the npx/wp-env bridge).
 *
 * Run order requirement: placeholder images must already be imported as
 * attachments (bash loop in seed.sh) — products reference them by attachment slug.
 * Regenerate images: scripts/make-placeholders.ps1
 */

if (!class_exists('WooCommerce')) {
    echo "seed-catalog: woocommerce inactive — skipped\n";
    return;
}

/* ---------- product categories ---------- */
$cats = array('هدوم', 'قمصان', 'فساتين', 'تيشيرتات', 'حقائب', 'ساعات', 'نظارات', 'أكسسوارات');
$catIds = array();
foreach ($cats as $c) {
    $t = get_term_by('name', $c, 'product_cat');
    if ($t) {
        $catIds[$c] = (int) $t->term_id;
        continue;
    }
    $r = wp_insert_term($c, 'product_cat');
    if (is_wp_error($r)) {
        echo "seed-catalog: cat failed {$c}: " . $r->get_error_message() . "\n";
        $catIds[$c] = 0;
    } else {
        $catIds[$c] = (int) $r['term_id'];
        echo "seed-catalog: created cat {$c} (#{$catIds[$c]})\n";
    }
}

/* ---------- products (slug-keyed; converges prices/order/images each run) ----------
 * Names/prices/categories mirror the approved homepage demo cards exactly
 * (regular 1,450 → sale 1,250 for the abaya — the card's <del>/<now> pair). */
$items = array(
    // slug, name, regular, sale, cat, attachment, short description, menu_order
    array('embroidered-abaya',   'عباية كتان مطرّزة',      '1450', '1250', 'هدوم',     'abaya',      'كتان مطرّز بقصّة مريحة — مثالية للاستخدام اليومي.', 1),
    array('leather-shoulder-bag','حقيبة كتف جلد طبيعي',   '1890', '',     'حقائب',    'bag',        'حقيبة كتف بخامات متينة وتصميم بسيط يناسب كل الإطلالات.', 2),
    array('classic-metal-watch', 'ساعة كلاسيك معدنية',     '2450', '',     'ساعات',    'watch',      'ساعة كلاسيك بحزام معدني وتصميم أنيق يدوم.', 3),
    array('classic-sunglasses',  'نظارة شمسية كلاسيك',     '750',  '',     'نظارات',   'sunglasses', 'نظارة شمسية بإطار كلاسيك وحماية من الأشعة.', 4),
    array('plain-cotton-shirt',  'قميص قطن بسيط',          '690',  '',     'قمصان',    'shirt',      'قميص قطن مريح بقصّة بسيطة تناسب العمل والخروجات.', 5),
    array('linen-scarf',         'شال كتان خفيف',          '380',  '',     'أكسسوارات','scarf',      'شال كتان خفيف يضيف لمسة أنيقة على أي إطلالة.', 6),
    array('summer-embroidered-dress', 'فستان صيفي مطرّز',  '1650', '',     'فساتين',   'dress',      'فستان صيفي بتطريز متناسب وقماش خفيف ومريح.', 7),
    array('oversized-cotton-tee', 'تيشيرت قطن أوفرسايز',   '420',  '',     'تيشيرتات', 'tee',        'تيشيرت قطن أوفرسايز بقصّة مريحة للاستخدام اليومي.', 8),
);

foreach ($items as $it) {
    list($slug, $name, $regular, $sale, $cat, $img, $short, $order) = $it;

    $existing = get_posts(array(
        'post_type'   => 'product',
        'name'        => $slug,
        'post_status' => array('publish', 'draft', 'pending'),
        'fields'      => 'ids',
        'posts_per_page' => 1,
    ));

    if ($existing) {
        $p = wc_get_product($existing[0]);
        $created = false;
    } else {
        $p = new WC_Product_Simple();
        $p->set_name($name);
        $p->set_slug($slug);
        $p->set_status('publish');
        $created = true;
    }

    // Converged fields (set on every run — keeps re-seeds fixing drift).
    $p->set_regular_price($regular);
    $p->set_sale_price($sale);
    if ($sale === '') {
        $p->set_date_on_sale_from(null);
        $p->set_date_on_sale_to(null);
    }
    $p->set_menu_order($order);
    $p->set_short_description($short);
    if (!empty($catIds[$cat])) {
        $p->set_category_ids(array($catIds[$cat]));
    }
    $att = get_posts(array(
        'post_type'   => 'attachment',
        'name'        => $img,
        'post_status' => 'inherit',
        'fields'      => 'ids',
        'posts_per_page' => 1,
    ));
    if ($att) {
        $p->set_image_id($att[0]);
    } elseif ($created) {
        echo "seed-catalog: no attachment for {$slug} ({$img}.jpg)\n";
    }
    $id = $p->save();
    echo 'seed-catalog: ' . ($created ? 'created' : 'updated') . " {$slug} (#{$id})\n";
}

/* ---------- shipping zones (Phase 4): by governorate ----------
 * WC matches a package against EVERY zone whose location matches, then picks
 * the LOWEST zone_order (no specificity bonus), so the state-level zone MUST
 * sort before the country-wide fallback. State location codes are `EG:{code}`
 * (WC uppercases both sides at match time). Costs: Cairo/Giza 60, rest 90,
 * free over 1,500 in both (settings converged on every run). */
$zones_plan = array(
    array(
        'name'      => 'القاهرة والجيزة',
        'locations' => array(
            array('code' => 'EG:EGC',  'type' => 'state'),
            array('code' => 'EG:EGGZ', 'type' => 'state'),
        ),
        'order'     => 0,
        'flat'      => '60',
    ),
    array(
        'name'      => 'باقي المحافظات',
        'locations' => array(
            array('code' => 'EG', 'type' => 'country'),
        ),
        'order'     => 1,
        'flat'      => '90',
    ),
);

$by_name = array();
$legacy_id = 0;
foreach (WC_Shipping_Zones::get_zones() as $z) {
    if ('مصر' === $z['zone_name']) {
        $legacy_id = (int) $z['zone_id'];
    } else {
        $by_name[$z['zone_name']] = (int) $z['zone_id'];
    }
}

foreach ($zones_plan as $i => $plan) {
    $zone_id = $by_name[$plan['name']] ?? 0;
    if (!$zone_id && 0 === $i && $legacy_id) {
        $zone_id = $legacy_id; // reuse legacy zone "مصر" → keeps method instances #1/#2
    }
    if ($zone_id) {
        $zone = new WC_Shipping_Zone($zone_id);
    } else {
        $zone = new WC_Shipping_Zone(); // new: must save BEFORE set_locations (add_location no-ops on id 0)
        $zone->save();
    }
    $zone->set_zone_name($plan['name']);
    $zone->set_zone_order($plan['order']);
    $zone->set_locations($plan['locations']); // replaces wholesale (idempotent)
    $zone->save();

    $present = array();
    foreach ($zone->get_shipping_methods() as $m) {
        $present[$m->id] = true;
    }
    if (!isset($present['free_shipping'])) {
        $zone->add_shipping_method('free_shipping');
    }
    if (!isset($present['flat_rate'])) {
        $zone->add_shipping_method('flat_rate');
    }

    /* Converge settings EVERY run: an older seed wrote a stale `minimum_amount`
     * key (WC's form field is `min_amount`), which silently disabled the 1,500
     * EGP free-shipping threshold — settings written only at add-time never heal. */
    foreach ($zone->get_shipping_methods() as $m) {
        if ($m->id === 'free_shipping') {
            update_option("woocommerce_free_shipping_{$m->instance_id}_settings", array(
                'enabled'          => 'yes',
                'title'            => 'شحن مجاني',
                'requires'         => 'min_amount',
                'min_amount'       => '1500',
                'ignore_discounts' => 'no',
            ));
        } elseif ($m->id === 'flat_rate') {
            update_option("woocommerce_flat_rate_{$m->instance_id}_settings", array(
                'enabled'    => 'yes',
                'title'      => 'شحن قياسي',
                'cost'       => $plan['flat'],
                'tax_status' => 'none',
            ));
        }
    }
    echo "seed-catalog: zone {$plan['name']} converged (flat {$plan['flat']}, free min 1500)\n";
}

/* Leftover legacy zone "مصر" (only possible when plan zone #1 already existed
 * separately): drop it — its country-wide EG location would shadow the state
 * zone, because WC picks the lowest zone_order among ALL matching zones. */
foreach (WC_Shipping_Zones::get_zones() as $z) {
    if ('مصر' === $z['zone_name']) {
        $zobj = new WC_Shipping_Zone($z['zone_id']);
        $zobj->delete();
        echo "seed-catalog: deleted leftover legacy zone مصر (#{$z['zone_id']})\n";
    }
}

/* ---------- payment gateways: COD (already enabled in seed.sh) + bank transfer demo ---------- */
update_option('woocommerce_bacs_settings', array(
    'enabled'       => 'yes',
    'title'         => 'تحويل بنكي',
    'description'   => 'بيانات الحساب تظهر بعد تأكيد الطلب (Demo)',
    'instructions'  => 'تحويل بنكي تجريبي — لا يتم تنفيذ أي عملية فعليًا.',
));
echo "seed-catalog: bank transfer enabled (demo)\n";

/* ---------- cart page: WooCommerce bakes the English empty-state text into
 * post_content when the page is created at install time (en_US CLI context).
 * Block content is static HTML — gettext can never fix it, so swap it here
 * (idempotent: strtr keys vanish after the first run). ---------- */
$cartPage = get_page_by_path('cart');
if ($cartPage) {
    $en2ar = array(
        'Your cart is currently empty!'      => 'سلة مشترياتك فارغة في الوقت الحالي!',
        'New in store'                       => 'جديد في المتجر',
        'You may be interested in&hellip;'    => 'قد يعجبك أيضًا…',
        'You may be interested in…'          => 'قد يعجبك أيضًا…',
        'Browse store'                       => 'تصفح المتجر',
    );
    $content = $cartPage->post_content;
    $new     = strtr($content, $en2ar);
    if ($new !== $content) {
        wp_update_post(array('ID' => $cartPage->ID, 'post_content' => $new));
        echo "seed-catalog: cart page English baked strings replaced with Arabic\n";
    } else {
        echo "seed-catalog: cart page content already localized\n";
    }
}

$counts = wp_count_posts('product');
echo "seed-catalog: done — products published: " . (int) $counts->publish . "\n";
