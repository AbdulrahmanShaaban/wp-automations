<?php
/**
 * seed-wp.php — idempotent site seed, run in ONE WordPress boot:
 *
 *   npx @wordpress/env run cli wp eval-file /var/www/html/wp-content/plugins/siraj-core/seed-wp.php
 *
 * Why one boot: each `wp` CLI call pays a full WP boot; the P1 project's old
 * per-step bash loop made seed runs take 40+ minutes on this host. Network
 * needs (language pack install) stay in scripts/seed.sh.
 *
 * Scope: site identity, Arabic locale, the 4 demo pages, static front page,
 * pretty permalinks. No WooCommerce, no medical claims — Demo clinic only.
 *
 * @package Siraj
 */

defined( 'ABSPATH' ) || exit;

/** Return the page ID for $name, creating a published page if missing.
 *
 * Content is owned by the seed ("everything-as-code"): when a page already
 * exists but its title/content drifted from the seed, the seed wins. Running
 * this twice in a row changes nothing.
 */
function siraj_seed_page_id( $name, $title, $content = '' ) {
	$found = get_posts( array(
		'post_type'   => 'page',
		'name'        => $name,
		'post_status' => 'any',
		'numberposts' => 1,
	) );
	if ( $found ) {
		$id      = (int) $found[0]->ID;
		$update  = array( 'ID' => $id );
		$changed = false;
		if ( $title !== $found[0]->post_title ) {
			$update['post_title'] = $title;
			$changed               = true;
		}
		if ( '' !== $content && $content !== $found[0]->post_content ) {
			$update['post_content'] = $content;
			$changed                = true;
		}
		if ( 'publish' !== $found[0]->post_status ) {
			$update['post_status'] = 'publish';
			$changed               = true;
		}
		if ( $changed ) {
			wp_update_post( $update );
			echo "    updated:     {$name} (#{$id})\n";
		} else {
			echo "    exists:      {$name} (#{$id})\n";
		}
		return $id;
	}
	$id = wp_insert_post( array(
		'post_type'    => 'page',
		'post_status'  => 'publish',
		'post_title'   => $title,
		'post_name'    => $name,
		'post_content' => $content,
	) );
	echo "    created:     {$name} (#{$id})\n";
	return (int) $id;
}

echo "==> Seed: site identity + Arabic\n";
update_option( 'blogname', 'عيادة سِراج للأسنان' );
update_option( 'blogdescription', 'حجز زيارات وطب أسنان (Demo)' );
update_option( 'WPLANG', 'ar' );

echo "==> Seed: pages (idempotent)\n";
siraj_seed_page_id( 'home', 'الرئيسية' );

siraj_seed_page_id(
	'services',
	'الخدمات',
	"<!-- wp:paragraph -->\n<p class=\"lead\">كل خدمة بسعرها ومدةها المتوقعة. التقييم النهائي بيحدده الفحص، وأي علاج بيبدأ بعد موافقتك على التكلفة المكتوبة.</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:heading {\"level\":2} -->\n<h2 class=\"wp-block-heading\">فحص وتشخيص</h2>\n<!-- /wp:heading -->\n<!-- wp:paragraph -->\n<p>فحص كامل للفم والأسنان، مع صورة أشعة وتوضيح الحالة والتكلفة قبل أي علاج. المدة: 20 دقيقة · السعر: 300 ج.م</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:heading {\"level\":2} -->\n<h2 class=\"wp-block-heading\">تنظيف وتلميع</h2>\n<!-- /wp:heading -->\n<!-- wp:paragraph -->\n<p>إزالة الجير وتلميع الأسنان، مع نصايح عن العناية المنزلية بعد الجلسة. المدة: 45 دقيقة · السعر: 700 ج.م</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:heading {\"level\":2} -->\n<h2 class=\"wp-block-heading\">علاج العصب (حشو عصب)</h2>\n<!-- /wp:heading -->\n<!-- wp:paragraph -->\n<p>جلسة واحدة غالبًا حسب حالة السن، مع توضيح عدد الجلسات والتكلفة قبل البدء. السعر: 1,200 ج.م</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:heading {\"level\":2} -->\n<h2 class=\"wp-block-heading\">حشو تجميلي</h2>\n<!-- /wp:heading -->\n<!-- wp:paragraph -->\n<p>ترميم بالحشو التجميلي الملوّن أو الحشو الشفاف حسب حالة السن، والسعر بيحسب النوع. السعر: 900 ج.م</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:heading {\"level\":2} -->\n<h2 class=\"wp-block-heading\">تقويم</h2>\n<!-- /wp:heading -->\n<!-- wp:paragraph -->\n<p>خطة على مراحل مع تقدير زمني وتكلفة إجمالية قبل أول جلسة. السعر: من 12,000 ج.م</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:heading {\"level\":2} -->\n<h2 class=\"wp-block-heading\">زراعة سن</h2>\n<!-- /wp:heading -->\n<!-- wp:paragraph -->\n<p>التقييم بيشمل الأشعة، والخطة والتكلفة بتتعرض على مراحل واضحة قبل البدء. السعر: من 15,000 ج.م</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:paragraph {\"className\":\"field-note\"} -->\n<p class=\"field-note\">الأسعار والمدد في هذا النموذج توضيحية للعرض، ولا تمثّل قائمة أسعار حقيقية.</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:paragraph -->\n<p><a class=\"btn btn-primary\" href=\"/book/\">احجز زيارة</a></p>\n<!-- /wp:paragraph -->"
);

siraj_seed_page_id(
	'team',
	'الفريق',
	"<!-- wp:paragraph -->\n<p class=\"lead\">النموذج بيعرض التخصصات والأدوار بدون صور أشخاص — دور واضح لكل تخصص، من غير أسماء حقيقية.</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:heading {\"level\":2} -->\n<h2 class=\"wp-block-heading\">طبقة التقويم</h2>\n<!-- /wp:heading -->\n<!-- wp:paragraph -->\n<p>تخطيط التقويم والمتابعة الشهرية، مع تقدير زمني مبدئي لكل حالة.</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:heading {\"level\":2} -->\n<h2 class=\"wp-block-heading\">طبقة زراعة الأسنان</h2>\n<!-- /wp:heading -->\n<!-- wp:paragraph -->\n<p>تقييم الزراعة وشرح مراحل العلاج، مع خطة تكلفة مكتوبة قبل البدء.</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:heading {\"level\":2} -->\n<h2 class=\"wp-block-heading\">طبقة تجميل الأسنان</h2>\n<!-- /wp:heading -->\n<!-- wp:paragraph -->\n<p>الحشو التجميلي والتلميع، مع شرح الفرق بين الخيارات قبل الاختيار.</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:heading {\"level\":2} -->\n<h2 class=\"wp-block-heading\">فريق المساعدة</h2>\n<!-- /wp:heading -->\n<!-- wp:paragraph -->\n<p>استقبال المواعيد وتأكيدها، ومتابعة الملف مع شركة التأمين.</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:paragraph {\"className\":\"field-note\"} -->\n<p class=\"field-note\">الأسماء والأدوار في النموذج توضيحية، ولا تمثّل أشخاصًا حقيقيين.</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:paragraph -->\n<p><a class=\"btn btn-primary\" href=\"/book/\">احجز زيارة</a></p>\n<!-- /wp:paragraph -->"
);

siraj_seed_page_id(
	'contact',
	'تواصل',
	"<!-- wp:paragraph -->\n<p class=\"lead\">العنوان في وسط البلد، القاهرة، والمواعيد يوميًا من 10ص لـ9م.</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:list -->\n<ul class=\"info-list\"><li><span class=\"k\">الهاتف</span><span class=\"v\">0100 000 0000 <span class=\"demo-badge\" lang=\"en\">Demo</span></span></li><li><span class=\"k\">واتساب</span><span class=\"v\">نفس الرقم — للحالات الطارئة</span></li><li><span class=\"k\">المواعيد</span><span class=\"v\">يوميًا 10ص — 9م</span></li><li><span class=\"k\">التأمين</span><span class=\"v\">بيتم مع أي شركة تأمين</span></li></ul>\n<!-- /wp:list -->\n\n<!-- wp:paragraph -->\n<p><a class=\"btn btn-primary\" href=\"/book/\">احجز زيارة</a></p>\n<!-- /wp:paragraph -->\n\n<!-- wp:paragraph {\"className\":\"field-note\"} -->\n<p class=\"field-note\">بيانات التواصل في النموذج توضيحية ومحجوزة للعرض.</p>\n<!-- /wp:paragraph -->"
);

siraj_seed_page_id(
	'book',
	'احجز زيارة',
	"<!-- wp:paragraph -->\n<p class=\"lead\">املأ النموذج بالتوازي، والتأكيد بيتم بعد كده على واتساب أو اتصال. البيانات مش بتتخزن عند أي طرف تالت.</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:shortcode -->\n[siraj_booking]\n<!-- /wp:shortcode -->"
);

// WordPress ships a "Sample Page" and a "Hello world!" post nobody wants.
$sample = get_posts( array(
	'post_type'   => 'page',
	'name'        => 'sample-page',
	'post_status' => 'any',
	'numberposts' => 1,
) );
if ( $sample ) {
	wp_delete_post( $sample[0]->ID, true );
	echo "    deleted sample-page (#{$sample[0]->ID})\n";
}
$hello = get_posts( array(
	'post_type'   => 'post',
	'name'        => 'hello-world',
	'post_status' => 'any',
	'numberposts' => 1,
) );
if ( $hello ) {
	wp_delete_post( $hello[0]->ID, true );
	echo "    deleted hello-world (#{$hello[0]->ID})\n";
}

echo "==> Seed: static front page + permalinks\n";
$home = get_posts( array(
	'post_type'   => 'page',
	'name'        => 'home',
	'post_status' => 'any',
	'numberposts' => 1,
) );
if ( $home ) {
	update_option( 'show_on_front', 'page' );
	update_option( 'page_on_front', (int) $home[0]->ID );
	echo "    front page -> home (#{$home[0]->ID})\n";
}
update_option( 'permalink_structure', '/%postname%/' );
echo "    permalinks -> /%postname%/\n";

echo "==> Seed done (idempotent — run again = no duplicates).\n";
