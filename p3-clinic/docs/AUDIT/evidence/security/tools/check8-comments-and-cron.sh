#!/bin/bash
# check8-comments-and-cron.sh — READ-ONLY: comment/spam surface and cron reach.

echo '=== A. comment_status per published post/page ==='
wp db query "SELECT post_type, post_status, comment_status, COUNT(*) AS n FROM wp_posts WHERE post_status IN ('publish','private','draft') GROUP BY post_type, post_status, comment_status ORDER BY post_type;"

echo ''
echo '=== B. comment endpoint reachability (GET only — no comment is ever posted) ==='
echo "wp-comments-post.php GET -> $( curl -s -o /dev/null -m 20 -w '%{http_code}' http://localhost:8889/wp-comments-post.php 2>/dev/null || echo err )"
echo 'NOTE: a comment POST would write to the DB, so it was deliberately NOT performed.'
echo '      Anonymous posting is decided by comment_status=open/closed + moderation settings above.'

echo ''
echo '=== C. trackback / pingback endpoints ==='
for u in /wp-trackback.php /xmlrpc.php /wp-links-opml.php /wp-activate.php /wp-mail.php /wp-signup.php; do
  printf '%s -> %s\n' "$u" "$( curl -s -o /dev/null -m 20 -w '%{http_code}' "http://localhost:8889$u" 2>/dev/null || echo timeout )"
done

echo ''
echo '=== D. can an anonymous visitor read the comment feed / trackback for a page? ==='
curl -s -m 20 -o /dev/null -w 'comments feed -> %{http_code}\n' 'http://localhost:8889/comments/feed/'
curl -s -m 20 -o /dev/null -w 'trackback for page 4 -> %{http_code}\n' 'http://localhost:8889/wp-trackback.php?p=4'

echo ''
echo '=== E. wp-cron.php behaviour (publicly triggerable) ==='
curl -s -m 20 -o /dev/null -w 'GET wp-cron.php -> %{http_code}\n' 'http://localhost:8889/wp-cron.php'
curl -s -m 20 -o /dev/null -w 'POST wp-cron.php -> %{http_code}\n' -X POST 'http://localhost:8889/wp-cron.php?doing_wp_cron'

echo ''
echo '=== F. xmlrpc availability ==='
curl -s -m 20 -o /dev/null -w 'GET xmlrpc.php -> %{http_code}\n' 'http://localhost:8889/xmlrpc.php'
curl -s -m 20 -o /dev/null -w 'POST xmlrpc system.listMethods -> %{http_code}\n' -X POST -H 'Content-Type: text/xml' --data "<?xml version='1.0'?><methodCall><methodName>system.listMethods</methodName></methodCall>" 'http://localhost:8889/xmlrpc.php'

echo ''
echo '=== G. pingback.ping amplification surface (single outbound attempt refused) ==='
echo 'not exercised: a real pingback test would send an outbound HTTP request from the container'