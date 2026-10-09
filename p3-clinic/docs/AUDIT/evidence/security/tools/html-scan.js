#!/usr/bin/env node
/**
 * html-scan.js — READ-ONLY scan of saved page HTML for check 1 (headers are
 * separate) and check 2 (secrets in page output) / check 6 (PII leakage).
 *
 * Reports: generator/version disclosure, nonce field presence (name only),
 * secret-shaped literals (count + length only), PHP-warning markers, and any
 * occurrence of the booking meta key names in the page source.
 */
'use strict';

const fs = require( 'fs' );
const path = require( 'path' );

const dir = process.argv[ 2 ];
const out = process.argv[ 3 ];

const SECRET_RE = [
	[ 'long-hex-24plus', /\b[0-9a-f]{24,}\b/gi ],
	[ 'jwt', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./g ],
	[ 'aws-key', /\bAKIA[0-9A-Z]{16}\b/g ],
	[ 'basic-auth-url', /\b[a-z][a-z0-9+.-]*:\/\/[^\/\s:@]+:[^\/\s:@]+@/gi ],
	[ 'assigned-secret', /\b(?:password|passwd|secret|token|api[_-]?key)\b\s*[:=]\s*["'][^"']{6,}["']/gi ],
	[ 'db-credential', /\bDB_(?:NAME|USER|PASSWORD|HOST)\b/g ],
	[ 'salt-constant', /\b(?:AUTH|NONCE|LOGGED_IN|SECURE_AUTH)_SALT\b/g ]
];

const PI_RE = [
	[ 'egypt-mobile', /\b01[0125][0-9]{8}\b/g ],
	[ 'intl-phone', /\+20[0-9]{10}\b/g ],
	[ 'booking-meta-key', /siraj_(?:phone|service|date|notes|ip_hash|booking_submit|booking_form|website)\b/g ]
];

const DEBUG_RE = [
	[ 'php-warning', /<b>(?:Warning|Fatal error|Parse error|Notice|Deprecated)<\/b>/gi ],
	[ 'wp-debug-comment', /<!--\s*\/(?:\*|wp-content\/)/g ],
	[ 'trace', /\bStack trace:/g ]
];

const htmlFiles = fs.readdirSync( dir ).filter( ( f ) => /\.(html|xml)$/.test( f ) || /\.txt$/.test( f ) );

const lines = [];
lines.push( `# Page-output scan — ${ new Date().toISOString() }` );
lines.push( '' );

for ( const f of htmlFiles ) {
	const p = path.join( dir, f );
	const size = fs.statSync( p ).size;
	const text = fs.readFileSync( p, 'utf8' );
	lines.push( `## ${ f } (${ size } bytes)` );

	const gen = text.match( /<meta\s+name=["']generator["']\s+content=["']([^"']*)["'][^>]*>/gi );
	lines.push( `  generator-meta: ${ gen ? gen.length + ' found -> ' + gen.map( ( g ) => /content=["']([^"']*)["']/.exec( g )[ 1 ] ).join( ' | ' ) : 'none' }` );

	const nonceFields = [ ...new Set( ( text.match( /name=["'](siraj_booking_submit|_wpnonce|_wp_http_referer)["']/g ) || [] ) ) ];
	lines.push( `  nonce/referer input names present: ${ nonceFields.length ? nonceFields.join( ', ' ) : 'none' } (values withheld)` );

	const apApp = [ ...new Set( ( text.match( /<link\s+rel=["']https:\/\/api\.w\.org\/["'][^>]*>/g ) || [] ) ) ];
	lines.push( `  api.w.org link tags: ${ apApp.length }` );

	for ( const [ label, re ] of [ ...SECRET_RE, ...PI_RE, ...DEBUG_RE ] ) {
		const local = new RegExp( re.source, re.flags.includes( 'g' ) ? re.flags : re.flags + 'g' );
		const hits = [ ...text.matchAll( local ) ];
		if ( hits.length ) {
			const lens = hits.slice( 0, 10 ).map( ( h ) => h[ 0 ].length ).join( ',' );
			lines.push( `  ${ label }: hits=${ hits.length } valueLengths=${ lens }${ hits.length > 10 ? ',…' : '' }` );
		}
	}
	lines.push( '' );
}

fs.writeFileSync( out, lines.join( '\n' ) + '\n', 'utf8' );
process.stdout.write( `wrote ${ out } (${ htmlFiles.length } files)\n` );