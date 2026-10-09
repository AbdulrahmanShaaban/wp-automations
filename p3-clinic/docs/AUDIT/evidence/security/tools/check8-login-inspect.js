#!/usr/bin/env node
/**
 * check8-login-inspect.js — READ-ONLY inspection of the wp-login.php response.
 * Reports only structural facts (no credentials, no cookie values).
 */
'use strict';
const fs = require( 'fs' );
const p = process.argv[ 2 ];
const out = process.argv[ 3 ];
const h = fs.readFileSync( p, 'utf8' );
const L = [];

L.push( 'bytes: ' + h.length );
const err = /<div id="login_error"[\s\S]{0,500}?<\/div>/.exec( h );
L.push( 'login_error block: ' + ( err ? err[ 0 ].replace( /<[^>]+>/g, ' ' ).replace( /\s+/g, ' ' ).trim() : 'NONE' ) );
L.push( 'redirect_to input echoed: ' + /name="redirect_to"/.test( h ) );
L.push( 'lostpassword link present: ' + /action=lostpassword/.test( h ) );
L.push( 'register link present: ' + /action=register/.test( h ) );
L.push( 'two-factor / app-password hints: ' + /two-factor|totp|app password/i.test( h ) );
L.push( 'form action target: ' + ( /<form[^>]*name="loginform"[^>]*>/.exec( h )?.[ 0 ] || 'n/a' ) );
L.push( 'login form fields: ' + ( [ ...new Set( ( h.match( /<input[^>]*name="[a-z_]+"/g ) || [] ).map( ( s ) => /name="([a-z_]+)"/.exec( s )[ 1 ] ) ) ].join( ', ' ) || 'none' ) );
L.push( 'generator tag: ' + ( /<meta name="generator" content="([^"]*)"/.exec( h )?.[ 1 ] || 'none' ) );
L.push( 'php warning markers: ' + ( /Warning<\/b>|Fatal error|Parse error|Deprecated:|Notice:/.test( h ) ? 'PRESENT' : 'none' ) );
L.push( 'body mentions wp-admin path: ' + /wp-admin/.test( h ) );

fs.writeFileSync( out, L.join( '\n' ) + '\n', 'utf8' );
process.stdout.write( L.join( '\n' ) + '\n' );