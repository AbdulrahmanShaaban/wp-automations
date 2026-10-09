#!/usr/bin/env node
/**
 * check5-inspect-response.js — read the malformed-POST response and report only
 * what is needed as evidence: HTTP status, which error messages rendered,
 * whether aria-invalid fired, whether the injected <script> survived anywhere
 * in the response (it must NOT), and whether the form was replaced by the
 * success block (it must NOT be).
 */
'use strict';
const fs = require( 'fs' );
const html = fs.readFileSync( process.argv[ 2 ], 'utf8' );

const out = [];
out.push( `bytes: ${ html.length }` );
out.push( `has role="alert" summary: ${ /role="alert"/.test( html ) }` );
out.push( `has role="status" success block: ${ /role="status"/.test( html ) }` );
out.push( `aria-invalid="true" occurrences: ${ ( html.match( /aria-invalid="true"/g ) || [] ).length }` );
out.push( '' );

out.push( '--- error <li> items rendered ---' );
const alert = /<div class="siraj-alert" role="alert">([\s\S]*?)<\/div>/.exec( html );
if ( alert ) {
	for ( const li of alert[ 1 ].matchAll( /<li>([\s\S]*?)<\/li>/g ) ) {
		out.push( '  ' + li[ 1 ].replace( /<[^>]+>/g, '' ).trim() );
	}
} else {
	out.push( '  (no alert block found)' );
}

out.push( '' );
out.push( '--- XSS probe: does the literal <script>alert(1)</script> survive in the response? ---' );
out.push( '  literal "<script>alert(1)</script>" present: ' + html.includes( '<script>alert(1)</script>' ) );
out.push( '  "alert(1)" present anywhere: ' + html.includes( 'alert(1)' ) );
const echoed = /<input[^>]*name="siraj_name"[^>]*>/.exec( html );
out.push( '  siraj_name input tag: ' + ( echoed ? echoed[ 0 ] : '(not found)' ) );
const phoneTag = /<input[^>]*name="siraj_phone"[^>]*>/.exec( html );
out.push( '  siraj_phone input tag: ' + ( phoneTag ? phoneTag[ 0 ] : '(not found)' ) );

out.push( '' );
out.push( '--- error paragraphs with ids (for aria-describedby wiring) ---' );
for ( const m of html.matchAll( /<p class="siraj-error" id="([^"]+)">([\s\S]*?)<\/p>/g ) ) {
	out.push( '  ' + m[ 1 ] + ' -> ' + m[ 2 ].replace( /<[^>]+>/g, '' ).trim().slice( 0, 60 ) );
}

out.push( '' );
out.push( '--- page generator / debug markers in this response ---' );
const gen = /<meta name="generator" content="([^"]*)"/.exec( html );
out.push( '  generator: ' + ( gen ? gen[ 1 ] : 'none' ) );
out.push( '  php warning markers: ' + ( /<(?:b|strong)>Warning|Fatal error|Parse error|Deprecated:|Notice:/.test( html ) ? 'PRESENT' : 'none' ) );

fs.writeFileSync( process.argv[ 3 ], out.join( '\n' ) + '\n', 'utf8' );
process.stdout.write( out.join( '\n' ) + '\n' );