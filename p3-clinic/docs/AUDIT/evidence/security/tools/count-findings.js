#!/usr/bin/env node
/**
 * count-findings.js — cross-check the report's own numbers so no tally in the
 * prose disagrees with the table it summarises.
 */
'use strict';
const fs = require( 'fs' );
const t = fs.readFileSync( process.argv[ 2 ], 'utf8' );

const rows = t.split( '\n' ).filter( ( l ) => /^\| \d+ \|/.test( l ) );
const tally = { High: 0, Medium: 0, Low: 0, Info: 0 };
for ( const r of rows ) {
	const cells = r.split( '|' ).map( ( c ) => c.trim() );
	const sev = cells[ 2 ].replace( /\*/g, '' ).split( /\s+—\s+|\s+-\s+/ )[ 0 ].trim();
	if ( sev in tally ) {
		tally[ sev ]++;
	} else {
		console.log( '  UNRECOGNISED severity cell: "' + cells[ 2 ] + '"' );
	}
}
const claimed = /\*\*Counts:\*\*\s*High (\d+) · Medium (\d+) · Low (\d+) · Info (\d+) \((\d+) rows\)/.exec( t );
console.log( 'table rows: ' + rows.length );
console.log( 'computed tally: ' + JSON.stringify( tally ) + ' total=' + Object.values( tally ).reduce( ( a, b ) => a + b, 0 ) );
if ( claimed ) {
	console.log( 'claimed in report: High ' + claimed[ 1 ] + ' · Medium ' + claimed[ 2 ] + ' · Low ' + claimed[ 3 ] + ' · Info ' + claimed[ 4 ] + ' (' + claimed[ 5 ] + ' rows)' );
	const ok = [ 1, 2, 3, 4 ].every( ( i ) => Number( claimed[ i ] ) === tally[ [ 'High', 'Medium', 'Low', 'Info' ][ i - 1 ] ] ) && Number( claimed[ 5 ] ) === rows.length;
	console.log( 'MATCH: ' + ( ok ? 'YES' : 'NO — fix the Counts line' ) );
} else {
	console.log( 'claimed in report: (no Counts line found)' );
}

// numbering continuity
const nums = rows.map( ( r ) => Number( /^\| (\d+) \|/.exec( r )[ 1 ] ) );
const gaps = nums.filter( ( n, i ) => n !== i + 1 );
console.log( 'numbering 1..' + nums.length + ' continuous: ' + ( gaps.length === 0 ? 'YES' : 'NO -> ' + gaps.join( ',' ) ) );

// every "highest-impact fix" bullet exists
const fixes = ( t.split( '## 5 highest-impact fixes' )[ 1 ] || '' ).split( '\n' ).filter( ( l ) => /^\d\. /.test( l ) );
console.log( 'highest-impact fix bullets: ' + fixes.length );

// report structure sections present
for ( const s of [ '## Exact tools / commands used', '## Attack-surface inventory', '## Findings', '## 5 highest-impact fixes', '## Deployment items', '## Could not verify / out of scope', '## Evidence index' ] ) {
	console.log( ( t.includes( s ) ? '  present ' : '  MISSING ' ) + s );
}

// banned words
for ( const w of [ 'secure', 'safe', 'no vulnerabilities', 'completely' ] ) {
	const n = ( t.toLowerCase().match( new RegExp( '\\b' + w + '\\b', 'g' ) ) || [] ).length;
	console.log( '  word "' + w + '" occurrences: ' + n );
}