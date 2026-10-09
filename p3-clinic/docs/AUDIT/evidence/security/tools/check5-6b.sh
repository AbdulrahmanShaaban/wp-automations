#!/bin/bash
# check5-6b.sh — READ-ONLY follow-ups: shortcode location, source-level grep of
# project code, WP_DEBUG_DISPLAY provenance, and the booking count AFTER the
# malformed submission (run after the curl probe).

echo '=== A. where is the booking shortcode (page ids + names only) ==='
wp db query "SELECT ID, post_name FROM wp_posts WHERE post_type='page' AND post_status='publish' AND post_content LIKE '%[siraj_booking]%';"

echo ''
echo '=== B. does wp-config.php mention WP_DEBUG_DISPLAY / WP_DEBUG_LOG / DISALLOW_* ? ==='
for k in WP_DEBUG_DISPLAY WP_DEBUG_LOG DISALLOW_FILE_EDIT DISALLOW_FILE_MODS AUTOMATIC_UPDATER_DISABLED DISABLE_WP_CRON WP_ENVIRONMENT_TYPE SCRIPT_DEBUG WP_DEBUG; do
  printf '%s: ' "$k"
  if grep -q "define( *'$k'" /var/www/html/wp-config.php; then echo 'PRESENT in wp-config.php'; else echo 'absent from wp-config.php'; fi
done
echo '--- WP_DEBUG line in wp-config.php ---'
grep -n "WP_DEBUG" /var/www/html/wp-config.php
echo '--- wp-cli.yml ---'
cat /var/www/html/wp-cli.yml

echo ''
echo '=== C. source-level grep of the four project code files (counts only) ==='
for f in /var/www/html/wp-content/plugins/siraj-core/siraj-core.php \
         /var/www/html/wp-content/plugins/siraj-core/booking.php \
         /var/www/html/wp-content/plugins/siraj-core/seed-wp.php \
         /var/www/html/wp-content/themes/siraj-theme/functions.php; do
  echo "--- $f  bytes=$(wc -c < "$f") lines=$(wc -l < "$f")"
  printf '  $_POST=%s  $_GET=%s  $_REQUEST=%s  $_SERVER=%s  $_COOKIE=%s\n' \
    "$(grep -c '\$_POST' "$f")" "$(grep -c '\$_GET' "$f")" "$(grep -c '\$_REQUEST' "$f")" \
    "$(grep -c '\$_SERVER' "$f")" "$(grep -c '\$_COOKIE' "$f")"
  printf '  sanitize_text_field=%s sanitize_textarea_field=%s sanitize_email=%s esc_html=%s esc_attr=%s esc_url=%s esc_textarea=%s absint=%s intval=%s wp_unslash=%s\n' \
    "$(grep -c 'sanitize_text_field' "$f")" "$(grep -c 'sanitize_textarea_field' "$f")" "$(grep -c 'sanitize_email' "$f")" \
    "$(grep -c 'esc_html' "$f")" "$(grep -c 'esc_attr' "$f")" "$(grep -c 'esc_url' "$f")" \
    "$(grep -c 'esc_textarea' "$f")" "$(grep -c 'absint' "$f")" "$(grep -c 'intval' "$f")" "$(grep -c 'wp_unslash' "$f")"
  printf '  wp_nonce_field=%s wp_verify_nonce=%s check_ajax_referer=%s wp_create_nonce=%s\n' \
    "$(grep -c 'wp_nonce_field' "$f")" "$(grep -c 'wp_verify_nonce' "$f")" "$(grep -c 'check_ajax_referer' "$f")" "$(grep -c 'wp_create_nonce' "$f")"
  printf '  $wpdb=%s prepare=%s query=%s get_results=%s get_var=%s get_row=%s\n' \
    "$(grep -c 'wpdb' "$f")" "$(grep -c '\->prepare' "$f")" "$(grep -c '\->query' "$f")" \
    "$(grep -c 'get_results' "$f")" "$(grep -c 'get_var' "$f")" "$(grep -c 'get_row' "$f")"
  printf '  eval=%s exec=%s system=%s passthru=%s shell_exec=%s unserialize=%s include/require=%s\n' \
    "$(grep -c 'eval *(' "$f")" "$(grep -c 'exec *(' "$f")" "$(grep -c 'system *(' "$f")" \
    "$(grep -c 'passthru *(' "$f")" "$(grep -c 'shell_exec *(' "$f")" "$(grep -c 'unserialize *(' "$f")" \
    "$(grep -cE 'require|include' "$f")"
  printf '  wp_insert_post=%s update_post_meta=%s add_post_meta=%s register_rest_route=%s register_meta=%s\n' \
    "$(grep -c 'wp_insert_post' "$f")" "$(grep -c 'update_post_meta' "$f")" "$(grep -c 'add_post_meta' "$f")" \
    "$(grep -c 'register_rest_route' "$f")" "$(grep -c 'register_meta' "$f")"
  printf '  raw-SELECT-with-var=%s  echo-without-esc=%s  shortcode=%s add_shortcode=%s\n' \
    "$(grep -cE '\\$wpdb->(query|get_results|get_var|get_row|get_col)\(' "$f")" \
    "$(grep -cE 'echo [^e]' "$f")" "$(grep -c 'add_shortcode' "$f")" "$(grep -c 'shortcode_atts' "$f")"
done

echo ''
echo '=== D. echo statements in booking.php that do NOT go through esc_* ==='
grep -n 'echo ' /var/www/html/wp-content/plugins/siraj-core/booking.php | grep -v 'esc_html' | grep -v 'esc_attr' | grep -v 'esc_url' | grep -v 'sprintf' || echo '(none: every echo is esc_*/sprintf-wrapped)'

echo ''
echo '=== E. booking count AFTER the malformed submission ==='
wp db query "SELECT COUNT(*) AS bookings_after FROM wp_posts WHERE post_type='siraj_booking';"
echo '--- ids again (compare with section D of check5-6-db.txt) ---'
wp db query "SELECT ID, CHAR_LENGTH(post_title) AS title_len FROM wp_posts WHERE post_type='siraj_booking' ORDER BY ID;"
echo '--- meta rows again (compare with section E of check5-6-db.txt) ---'
wp db query "SELECT m.meta_key, COUNT(*) AS rows_n FROM wp_postmeta m JOIN wp_posts p ON p.ID=m.post_id WHERE p.post_type='siraj_booking' GROUP BY m.meta_key ORDER BY m.meta_key;"

echo ''
echo '=== F. any revision/autosave/other table rows for the CPT ==='
wp db query "SELECT COUNT(*) AS other_rows FROM wp_posts WHERE post_type='siraj_booking' AND post_status<>'publish';"

echo ''
echo '=== G. who can see the booking list in wp-admin? (capability check) ==='
wp eval '
printf( "edit_posts granted to administrator: %s\n", current_user_can_for_site( 0, "administrator", "edit_posts" ) ? "n/a" : "n/a" );
$admin = get_user_by( "login", "admin" );
if ( $admin ) {
  printf( "admin can edit_posts=%s publish_posts=%s read=%s\n", user_can( $admin, "edit_posts" ) ? "YES" : "NO", user_can( $admin, "publish_posts" ) ? "YES" : "NO", user_can( $admin, "read" ) ? "YES" : "NO" );
}
printf( "anonymous current_user_can(edit_posts)=%s current_user_can(publish_posts)=%s\n", current_user_can( "edit_posts" ) ? "YES" : "NO", current_user_can( "publish_posts" ) ? "YES" : "NO" );
'