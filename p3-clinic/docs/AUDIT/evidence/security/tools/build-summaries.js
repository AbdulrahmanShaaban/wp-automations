#!/usr/bin/env node
/**
 * build-summaries.js — regenerate the two evidence summaries that were first
 * written through the PowerShell console (which mangles Arabic). Values are
 * taken from files already captured on disk; nothing is re-requested.
 */
'use strict';
const fs = require( 'fs' );
const dir = 'docs/AUDIT/evidence/security/';

// ---- 1. REST index summary -------------------------------------------------
const idx = JSON.parse( fs.readFileSync( dir + 'check4-wp-json-index.json', 'utf8' ) );
const routes = Object.keys( idx.routes );
const byNamespace = {};
for ( const r of routes ) {
	const ns = r.startsWith( '/' ) ? r.slice( 1 ).split( '/' )[ 0 ] : '(root)';
	byNamespace[ ns ] = ( byNamespace[ ns ] || 0 ) + 1;
}
const methods = {};
for ( const cfg of Object.values( idx.routes ) ) {
	// wp-json index stores methods as either ["GET"] or [{ "methods": ["GET"] }]
	const raw = cfg.methods || [];
	const list = raw.flatMap( ( x ) => ( typeof x === 'string' ? [ x ] : x.methods || [] ) );
	for ( const m of list ) {
		methods[ m ] = ( methods[ m ] || 0 ) + 1;
	}
}
const L = [];
L.push( '# /wp-json/ inventory (from check4-wp-json-index.json)' );
L.push( '' );
L.push( `site name (from index): ${ idx.name }` );
L.push( `site url: ${ idx.url }` );
L.push( `home: ${ idx.home }` );
L.push( `gmt_offset: ${ idx.gmt_offset }   timezone_string: "${ idx.timezone_string }"` );
L.push( `namespaces (${ idx.namespaces.length }): ${ idx.namespaces.join( ', ' ) }` );
L.push( `total routes: ${ routes.length }` );
L.push( '' );
L.push( '## routes per namespace' );
for ( const [ ns, n ] of Object.entries( byNamespace ).sort( ( a, b ) => b[ 1 ] - a[ 1 ] ) ) {
	L.push( `  ${ ns }: ${ n }` );
}
L.push( '' );
L.push( '## endpoint methods across the whole surface' );
for ( const [ m, n ] of Object.entries( methods ).sort( ( a, b ) => b[ 1 ] - a[ 1 ] ) ) {
	L.push( `  ${ m }: ${ n } routes` );
}
L.push( '' );
L.push( '## routes mentioning users / booking / oembed' );
for ( const r of routes.filter( ( x ) => /users|booking|oembed/i.test( x ) ) ) {
	L.push( '  ' + r );
}
L.push( '' );
L.push( '## any route path containing "siraj"?' );
L.push( '  ' + ( routes.filter( ( x ) => /siraj/i.test( x ) ).join( ', ' ) || 'NONE' ) );
L.push( '' );
L.push( '## authentication block as advertised' );
L.push( '  ' + JSON.stringify( idx.authentication ) );
fs.writeFileSync( dir + 'check4-wp-json-summary.txt', L.join( '\n' ) + '\n', 'utf8' );

// ---- 2. author enumeration evidence ---------------------------------------
const a = fs.readFileSync( dir + 'check4-author1.html', 'utf8' );
const rss = [ ...a.matchAll( /<link rel="alternate"[^>]*rss\+xml[^>]*>/g ) ].map( ( m ) => m[ 0 ] );
const M = [];
M.push( '# Author enumeration evidence (unauthenticated)' );
M.push( '' );
M.push( '## GET /?author=1' );
M.push( '  status: 200, no redirect (Location header absent)' );
M.push( '  response Link headers:' );
for ( const line of fs.readFileSync( dir + 'check4-author1-headers.txt', 'utf8' ).split( '\n' ) ) {
	if ( /^Link:/i.test( line ) ) {
		M.push( '    ' + line.trim() );
	}
}
M.push( '  feed autodiscovery links found in the body:' );
for ( const r of rss ) {
	M.push( '    ' + r );
}
M.push( '' );
M.push( '## comparison probes' );
M.push( '  /?author=2            -> 404' );
M.push( '  /?author=99           -> 404' );
M.push( '  /author/admin/        -> 200' );
M.push( '  /author/bogus-slug-audit/ -> 404' );
M.push( '  /author/admin/feed/   -> 200 (954 bytes XML)' );
M.push( '' );
M.push( '## GET /wp-json/wp/v2/users  (unauthenticated)' );
M.push( '  status: 200, body: ' + fs.readFileSync( dir + 'check4-users.json', 'utf8' ).trim() );
M.push( '## GET /wp-json/wp/v2/users/me' );
M.push( '  status: 401, body: ' + fs.readFileSync( dir + 'check4-users-me.json', 'utf8' ).trim() );
M.push( '## GET /wp-json/wp/v2/users/1' );
M.push( '  status: 401, body: ' + fs.readFileSync( dir + 'check6-resp-_wp_json_wp_v2_users_1.txt', 'utf8' ).trim() );
fs.writeFileSync( dir + 'check4-enumeration-summary.txt', M.join( '\n' ) + '\n', 'utf8' );

process.stdout.write( L.join( '\n' ) + '\n\n' + M.join( '\n' ) + '\n' );