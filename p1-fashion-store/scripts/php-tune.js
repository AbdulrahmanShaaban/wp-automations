#!/usr/bin/env node
/**
 * Applies PHP performance tuning inside the running wordpress container.
 *
 * Why: the project + WordPress cache under C:\Users\...\.wp-env are bind
 * mounts through Docker Desktop's host relay, where stat()/read costs ~8-10ms.
 * Default PHP/OPcache settings re-stat thousands of files per request, making
 * page loads 8-24s (see docs/PROBLEMS.md). The ini below raises realpath/opcache
 * caches and turns off timestamp revalidation.
 *
 * Runs automatically via .wp-env.json lifecycleScripts.afterStart, and can be
 * run manually after a plain `docker restart`:  node scripts/php-tune.js
 *
 * Note: opcache.validate_timestamps=0 => PHP file edits are invisible until
 * `bash scripts/opcache-reset.sh` (Git Bash) or an Apache reload.
 */
'use strict';

const { execFileSync, execSync } = require( 'child_process' );

const TARGET = '/usr/local/etc/php/conf.d/zz-nilad-perf.ini';
const INI_LINES = [
	'realpath_cache_size=4194304',
	'realpath_cache_ttl=600',
	'opcache.max_accelerated_files=20000',
	'opcache.memory_consumption=192',
	'opcache.interned_strings_buffer=32',
	'opcache.validate_timestamps=0',
];

function findWordPressContainer() {
	const out = execSync( 'docker ps --format "{{.Names}}"', { encoding: 'utf8' } );
	const names = out
		.split( /\r?\n/ )
		.map( ( s ) => s.trim() )
		.filter( Boolean );
	const hits = names.filter( ( n ) => /^wp-env-.*-wordpress-1$/.test( n ) );
	if ( hits.length === 0 ) {
		throw new Error( 'No running wordpress container found. Run `npx wp-env start` first.' );
	}
	if ( hits.length > 1 ) {
		console.warn( 'php-tune: multiple wordpress containers found, using: ' + hits[ 0 ] );
	}
	return hits[ 0 ];
}

function main() {
	const container = findWordPressContainer();
	let script = 'echo ' + INI_LINES[ 0 ] + ' > ' + TARGET;
	for ( let i = 1; i < INI_LINES.length; i++ ) {
		script += ' && echo ' + INI_LINES[ i ] + ' >> ' + TARGET;
	}
	script += ' && apache2ctl graceful 2>/dev/null';
	execFileSync( 'docker', [ 'exec', '-u', 'root', container, 'sh', '-c', script ], {
		stdio: [ 'ignore', 'inherit', 'inherit' ],
	} );
	console.log( 'php-tune: wrote ' + TARGET + ' in ' + container + ' and reloaded Apache.' );
	console.log( 'Note: opcache.validate_timestamps=0 — after editing PHP files run: bash scripts/opcache-reset.sh' );
}

main();
