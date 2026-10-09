#!/usr/bin/env node
/**
 * php-tune.js — applies PHP/OPcache performance tuning inside THIS project's
 * wordpress container (p3-clinic only; never touches p1-fashion-store).
 *
 * Why: the project + WordPress cache under the host home dir are bind mounts
 * through Docker Desktop's host relay, where stat()/read costs ~8-10ms.
 * Default PHP/OPcache settings re-stat thousands of files per request —
 * measured on p3 before tuning: homepage 30.2s (cold) / 14.7s (warm), single
 * `wp` CLI boots 27-33s. Same root cause P1 documented (p1 PROBLEMS: 8-24s).
 *
 * Applies to BOTH project containers: wordpress (Apache/SAPI) and cli (every
 * `wp` boot) — they share /var/www/html but have separate filesystems, so the
 * conf.d ini must be written in each. Runs automatically via .wp-env.json
 * lifecycleScripts.afterStart (wp-env lib/commands/start.js:129), and can be
 * run manually after a plain `docker restart`:  node scripts/php-tune.js
 *
 * Note: opcache.validate_timestamps=0 => PHP file edits are invisible until
 * Apache reloads. Re-run this script (it ends with `apache2ctl graceful`),
 * or restart the container, after editing any .php file.
 */
'use strict';

const { execFileSync, execSync } = require( 'child_process' );

const TARGET = '/usr/local/etc/php/conf.d/zz-siraj-perf.ini';
const INI_LINES = [
	'realpath_cache_size=4194304',
	'realpath_cache_ttl=600',
	'opcache.max_accelerated_files=20000',
	'opcache.memory_consumption=192',
	'opcache.interned_strings_buffer=32',
	'opcache.validate_timestamps=0',
];

function findProjectContainers() {
	const out = execSync( 'docker ps --format "{{.Names}}"', { encoding: 'utf8' } );
	const names = out
		.split( /\r?\n/ )
		.map( ( s ) => s.trim() )
		.filter( Boolean );
	// Scoped to THIS project: P1's looser /^wp-env-.*-wordpress-1$/ matches both
	// projects' containers when they run side by side — ours must not.
	const hits = names.filter( ( n ) => /^wp-env-p3-clinic-.*-(wordpress|cli)-1$/.test( n ) );
	if ( hits.length === 0 ) {
		throw new Error( 'No running p3-clinic wordpress/cli container found. Run `npx wp-env start` first.' );
	}
	return hits;
}

function main() {
	const containers = findProjectContainers();
	for ( const container of containers ) {
		let script = 'echo ' + INI_LINES[ 0 ] + ' > ' + TARGET;
		for ( let i = 1; i < INI_LINES.length; i++ ) {
			script += ' && echo ' + INI_LINES[ i ] + ' >> ' + TARGET;
		}
		// The cli container has no Apache — reload only where it exists.
		script += ' && { apache2ctl graceful 2>/dev/null || true; }';
		execFileSync( 'docker', [ 'exec', '-u', 'root', container, 'sh', '-c', script ], {
			stdio: [ 'ignore', 'inherit', 'inherit' ],
		} );
		console.log( 'php-tune: wrote ' + TARGET + ' in ' + container );
	}
	console.log( 'Note: opcache.validate_timestamps=0 - after editing PHP files run: node scripts/php-tune.js' );
}

try {
	main();
} catch ( err ) {
	console.error( 'php-tune: ' + err.message );
	process.exit( 1 );
}
