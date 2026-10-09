<?php
$t0 = microtime(true);
require '/var/www/html/wp-load.php';
$t1 = microtime(true);
echo 'wp_load_ms=' . (int) round(($t1 - $t0) * 1000) . "\n";

if ( function_exists( 'opcache_get_status' ) ) {
	$s = opcache_get_status( false );
	echo 'opcache_used=' . $s['memory_usage']['used_memory'] . ' free=' . $s['memory_usage']['free_memory'] . "\n";
	echo 'hit_rate=' . $s['opcache_statistics']['opcache_hit_rate'] . "\n";
	echo 'oom_restarts=' . $s['opcache_statistics']['oom_restarts'] . ' full_restarts=' . $s['opcache_statistics']['full_restarts'] . "\n";
	echo 'revalidate_freq=' . ini_get( 'opcache.revalidate_freq' ) . ' validate_timestamps=' . ini_get( 'opcache.validate_timestamps' ) . "\n";
}

$t2 = microtime(true);
ob_start();
$_SERVER['HTTP_HOST']   = 'localhost:8889';
$_SERVER['REQUEST_URI'] = '/';
$_SERVER['REQUEST_METHOD'] = 'GET';
// Simulate a front page render without Apache.
status_header( 200 );
echo 'bootstrap_extra_ms=' . (int) round(($t2 - $t0) * 1000) . "\n";
ob_end_clean();
