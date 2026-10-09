#!/usr/bin/env node
/**
 * grab-nonce.js — pull the booking form nonce out of a saved /book/ page so the
 * single allowed malformed POST can be issued with a *valid* nonce (which is
 * what proves the SERVER-side validation rejects the payload, not just the
 * nonce check). Writes the nonce to a temp file inside the evidence folder;
 * the value is never printed.
 */
'use strict';
const fs = require( 'fs' );
const src = process.argv[ 2 ];
const out = process.argv[ 3 ];
const html = fs.readFileSync( src, 'utf8' );

const form = /<form[^>]*>/.exec( html );
const m =
	/name="siraj_booking_submit"\s+value="([^"]+)"/.exec( html ) ||
	/value="([^"]+)"\s+name="siraj_booking_submit"/.exec( html );

if ( ! m ) {
	process.stdout.write( 'nonce: NOT FOUND in ' + src + '\n' );
	process.exit( 1 );
}
fs.writeFileSync( out, m[ 1 ], 'utf8' );
process.stdout.write(
	'nonce-found: yes length=' + m[ 1 ].length + ' (value withheld)\n' +
	'form-tag: ' + ( form ? form[ 0 ] : '(none)' ) + '\n' +
	'has-referer-field: ' + /name="_wp_http_referer"/.test( html ) + '\n' +
	'honeypot-present: ' + /name="siraj_website"/.test( html ) + '\n' +
	'hidden-marker-present: ' + /name="siraj_booking_form"/.test( html ) + '\n' +
	'form-method: ' + ( /<form method="post"/.test( html ) ? 'post' : ( form ? /method="([a-z]+)"/.exec( form[ 0 ] )[ 1 ] : '?' ) ) + '\n' +
	'form-action-attribute: ' + ( /action="/.test( form ? form[ 0 ] : '' ) ? 'present' : 'absent (posts to the same URL)' ) + '\n'
);