#!/usr/bin/env node
/**
 * header-matrix.js â€” build the check-1 header matrix from the already-captured
 * header files. No new requests. Prints one row per endpoint with the presence
 * of each security header plus the banner values.
 */
'use strict';
const fs = require( 'fs' );
const dir = 'docs/AUDIT/evidence/security/';

const WATCH = [
	[ 'strict-transport-security', /^(strict-transport-security):[ ]*(.*)$/im ],
	[ 'content-security-policy', /^(content-security-policy):[ ]*(.*)$/im ],
	[ 'x-frame-options', /^(x-frame-options):[ ]*(.*)$/im ],
	[ 'x-content-type-options', /^(x-content-type-options):[ ]*(.*)$/im ],
	[ 'referrer-policy', /^(referrer-policy):[ ]*(.*)$/im ],
	[ 'permissions-policy', /^(permissions-policy):[ ]*(.*)$/im ],
	[ 'x-xss-protection', /^(x-xss-protection):[ ]*(.*)$/im ],
	[ 'x-powered-by', /^(x-powered-by):[ ]*(.*)$/im ],
	[ 'server', /^(server):[ ]*(.*)$/im ],
	[ 'set-cookie', /^(set-cookie):[ ]*(.*)$/im ]
];

const endpoints = [
	[ '/', 'check1-headers-home.txt' ],
	[ '/services/', 'check1-headers-services.txt' ],
	[ '/team/', 'check1-headers-team.txt' ],
	[ '/contact/', 'check1-headers-contact.txt' ],
	[ '/book/', 'check1-headers-book.txt' ],
	[ '404 page', 'check1-headers-404-page.txt' ],
	[ '/wp-login.php', 'check1-headers-wp-login.txt' ],
	[ '/wp-json/', 'check1-headers-wp-json-index.txt' ],
	[ '/xmlrpc.php (GET)', 'check1-headers-xmlrpc-get.txt' ],
	[ '/wp-cron.php', 'check1-headers-wp-cron.txt' ],
	[ '/wp-admin/ (302)', 'check1-headers-wp-admin-redirect.txt' ],
	[ '/wp-admin/admin-post.php', 'check1-headers-admin-post.txt' ],
	[ '/wp-config-sample.php (500)', 'check4-headers-wp-config-sample.txt' ],
	[ '/readme.html', 'check1-headers-readme.txt' ],
	[ '/license.txt', 'check1-headers-license.txt' ],
	[ '/wp-cli.yml', 'check4-wp-cli-yml-headers.txt' ],
	[ 'failed login POST', 'check8-login-failed-headers.txt' ]
];

const L = [];
L.push( '# HTTP security header matrix (unauthenticated, from the captured *.txt files)' );
L.push( '' );
L.push( 'legend: "-" = header absent, value = header value as captured' );
L.push( '' );
const cols = WATCH.map( ( w ) => w[ 0 ] );
L.push( '| endpoint | status | ' + cols.join( ' | ') + ' |' );
L.push( '| ' + [ 'endpoint', 'status' ].concat( cols ).join( ' | ' ) + ' |' );
L.push( '| ' + new Array( cols.length + 2 ).fill( '---' ).join( ' | ' ) + ' |' );

for ( const [ label, file ] of endpoints ) {
	const p = dir + file;
	if ( ! fs.existsSync( p ) ) {
		L.push( `| ${ label } | (not captured) |` + cols.map( () => '?' ).join( ' | ' ) + ' |' );
		continue;
	}
	const text = fs.readFileSync( p, 'utf8' );
	const status = ( /^HTTP\/[\d.]+[ ](\d+)/m.exec( text ) || [ '', '?' ] )[ 1 ];
	const cells = WATCH.map( ( [ name, re ] ) => {
		const m = re.exec( text );
		if ( ! m ) {
			return '-';
		}
		const value = ( m[ 2 ] || '' ).trim();
		// cookie values are not secrets and are not needed; report attributes only
		if ( name === 'set-cookie' ) {
			const attrs = ( value.match( /;[ ]*[A-Za-z]+/g ) || [] ).map( ( s ) => s.trim() ).join( ' ' );
			return 'PRESENT' + ( attrs ? ` [${ attrs }]` : '' );
		}
		return value ? '`' + value + '`' : 'PRESENT';
	} );
	L.push( `| ${ label } | ${ status } | ` + cells.join( ' | ' ) + ' |' );
}

L.push( '' );
L.push( '## how many of the five themed pages carry each header' );
const themed = endpoints.slice( 0, 5 ).map( ( e ) => e[ 1 ] );
for ( const [ name, re ] of WATCH.slice( 0, 7 ) ) {
	const n = themed.filter( ( f ) => re.test( fs.readFileSync( dir + f, 'utf8' ) ) ).length;
	L.push( `  ${ name }: ${ n } / 5` );
}

fs.writeFileSync( dir + 'check1-header-matrix.md', L.join( '\n' ) + '\n', 'utf8' );
process.stdout.write( L.join( '\n' ) + '\n' );
