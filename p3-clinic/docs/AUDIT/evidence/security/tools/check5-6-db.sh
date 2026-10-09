#!/bin/bash
# check5-6-db.sh — READ-ONLY DB + runtime inspection for the booking form and CPT.
# PII rule: names, phones and notes are NEVER printed; only ids, meta_key names
# and value lengths. Counts are used to prove nothing is stored by a bad request.

echo '=== A. effective PHP ini AFTER WordPress bootstrap (web code path) ==='
wp eval '
printf( "display_errors=%s expose_php=%s display_startup_errors=%s error_reporting=%d\n", ini_get( "display_errors" ), ini_get( "expose_php" ), ini_get( "display_startup_errors" ), error_reporting() );
printf( "WP_DEBUG=%s WP_DEBUG_DISPLAY=%s WP_DEBUG_LOG=%s\n", var_export( WP_DEBUG, true ), var_export( WP_DEBUG_DISPLAY, true ), var_export( WP_DEBUG_LOG, true ) );
'

echo ''
echo '=== B. siraj_booking CPT as WordPress resolved it ==='
wp eval '
$o = get_post_type_object( "siraj_booking" );
if ( ! $o ) { echo "NOT REGISTERED\n"; return; }
foreach ( array( "public", "publicly_queryable", "exclude_from_search", "show_ui", "show_in_rest", "show_in_nav_menus", "has_archive", "query_var", "can_export", "hierarchical", "rewrite", "map_meta_cap", "capability_type", "_builtin" ) as $k ) {
  $v = isset( $o->$k ) ? $o->$k : "(n/a)";
  printf( "%s=%s\n", $k, is_bool( $v ) ? var_export( $v, true ) : ( is_array( $v ) ? wp_json_encode( $v ) : wp_json_encode( $v ) ) );
}
echo "-- capabilities --\n";
foreach ( array( "edit_post", "read_post", "delete_post", "edit_posts", "publish_posts", "create_posts" ) as $c ) {
  printf( "cap[%s]=%s\n", $c, json_encode( array_values( (array) ( isset( $o->cap->$c ) ? $o->cap->$c : array() ) ) ) );
}
echo "-- is this type in the public REST list? --\n";
printf( "get_post_types( array( \"show_in_rest\" => true ) ) contains siraj_booking: %s\n", in_array( "siraj_booking", get_post_types( array( "show_in_rest" => true ) ), true ) ? "YES" : "NO" );
'

echo ''
echo '=== C. booking row count BEFORE the malformed submission ==='
wp db query "SELECT COUNT(*) AS bookings_before FROM wp_posts WHERE post_type='siraj_booking';"

echo ''
echo '=== D. existing booking rows (ids + status + title LENGTH only, no PII) ==='
wp db query "SELECT ID, post_status, post_date, CHAR_LENGTH(post_title) AS title_len FROM wp_posts WHERE post_type='siraj_booking' ORDER BY ID;"

echo ''
echo '=== E. booking meta: key names + value lengths only (no values) ==='
wp db query "SELECT m.meta_key, COUNT(*) AS rows_n, MIN(CHAR_LENGTH(m.meta_value)) AS min_len, MAX(CHAR_LENGTH(m.meta_value)) AS max_len FROM wp_postmeta m JOIN wp_posts p ON p.ID=m.post_id WHERE p.post_type='siraj_booking' GROUP BY m.meta_key ORDER BY m.meta_key;"

echo ''
echo '=== F. are any booking meta keys registered as REST-visible? ==='
wp eval '
global $wp_meta_keys;
printf( "registered meta for post_type siraj_booking: %s\n", empty( $wp_meta_keys["siraj_booking"] ) ? "NONE (no register_post_meta calls)" : wp_json_encode( $wp_meta_keys["siraj_booking"] ) );
'

echo ''
echo '=== G. cron / scheduled events ==='
wp cron event list --fields=hook,next_run_gmt,recurrence 2>/dev/null | head -20
echo "--- DISABLE_WP_CRON / ALTERNATE_WP_CRON ---"
wp eval 'printf( "DISABLE_WP_CRON=%s ALTERNATE_WP_CRON=%s\n", var_export( defined( "DISABLE_WP_CRON" ) ? DISABLE_WP_CRON : null, true ), var_export( defined( "ALTERNATE_WP_CRON" ) ? ALTERNATE_WP_CRON : null, true ) );'

echo ''
echo '=== H. does a page render the booking shortcode and is it in any feed? ==='
wp db query "SELECT ID, post_name, CHAR_LENGTH(post_content) AS content_len FROM wp_posts WHERE post_type='page' AND post_status='publish' ORDER BY ID;"
echo '--- shortcode occurrences per page (counts only) ---'
wp db query "SELECT post_id, (CHAR_LENGTH(post_content)-CHAR_LENGTH(REPLACE(post_content,'[siraj_booking]','')))/16 AS shortcode_count FROM wp_posts WHERE post_type='page' AND post_status='publish' AND post_content LIKE '%[siraj_booking]%';"

echo ''
echo '=== I. active theme / plugin code paths that read $_GET or $_POST globally ==='
wp eval '
$hits = array();
foreach ( array( "wp-content/plugins/siraj-core/siraj-core.php", "wp-content/plugins/siraj-core/booking.php", "wp-content/plugins/siraj-core/seed-wp.php", "wp-content/themes/siraj-theme/functions.php" ) as $f ) {
  $p = get_theme_file_path() === "" ? "" : ABSPATH . $f;
  if ( ! file_exists( $p ) ) { printf( "%s: ABSENT\n", $f ); continue; }
  $src = file_get_contents( $p );
  printf(
    "%s: bytes=%d \$_POST=%d \$_GET=%d \$_REQUEST=%d \$_SERVER=%d wp_query=%d wp_insert_post=%d eval=%d exec=%d system=%d file_get_contents(http=%d) unserialize=%d\n",
    $f,
    strlen( $src ),
    substr_count( $src, '$_POST' ),
    substr_count( $src, '$_GET' ),
    substr_count( $src, '$_REQUEST' ),
    substr_count( $src, '$_SERVER' ),
    substr_count( $src, 'wp_query' ),
    substr_count( $src, 'wp_insert_post' ),
    substr_count( $src, 'eval(' ),
    substr_count( $src, 'exec(' ),
    substr_count( $src, 'system(' ),
    preg_match_all( "#file_get_contents\(\s*[\x27\"]https?://#i", $src ),
    substr_count( $src, 'unserialize(' )
  );
}
'

echo ''
echo '=== J. cron jobs + HTTP-loopback check (is wp-cron reachable / does it fire) ==='
wp option get cron 2>/dev/null | head -c 200
echo ''