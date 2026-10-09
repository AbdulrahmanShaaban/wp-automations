#!/usr/bin/env node
/**
 * check6-pii-context.js — READ-ONLY, count-only context scan for findings
 * #18 (PII reachability), #21/#28 (oEmbed assigned-secret false positive).
 *
 * A. counts occurrences of the seeded booking's stored values across every
 *    capture in docs/AUDIT/evidence/security/ — counts and file names only,
 *    the values themselves are never printed;
 * B. prints REDACTED context around the pattern hits that html-scan.js
 *    reported (egypt-mobile / booking-meta-key) to show they are the public
 *    form markup, not stored data;
 * C. measures the assigned-secret regex match inside the oEmbed capture
 *    (offset, full-match length, quoted-value length).
 *
 * Run from the project root: node docs/AUDIT/evidence/security/tools/check6-pii-context.js
 * Output: docs/AUDIT/evidence/security/check6-pii-context.txt
 */
'use strict';
const fs = require( 'fs' );
const path = require( 'path' );

const EV = 'docs/AUDIT/evidence/security/';
const OUT = EV + 'check6-pii-context.txt';

// Candidates = the valid-booking submission of scripts/booking-e2e.js (lines 91-95),
// with the phone as siraj_normalize_phone() stores it (booking.php:350-371,
// '+20' + national digits). Derived lengths must equal the lengths recorded in
// check5-6-db-and-cpt.txt §D/§E (title 15, notes 29, phone 13, service 8, date 10).
const CANDIDATES = [
	{ label: 'booking title (siraj_name)', value: 'سارة عبد الرحمن', dbLen: 15, kind: 'pii' },
	{ label: 'booking notes (siraj_notes)', value: 'أول زيارة، morningZX9 الموعد.', dbLen: 29, kind: 'pii' },
	{ label: 'booking phone as stored (siraj_phone)', value: '+201012345678', dbLen: 13, kind: 'pii' },
	{ label: 'booking service (siraj_service)', value: 'cleaning', dbLen: 8, kind: 'public' },
	{ label: 'booking date (siraj_date)', value: '2026-11-02', dbLen: 10, kind: 'public' },
	{ label: 'phone as typed / public hint example', value: '01012345678', dbLen: null, kind: 'public' },
];

const PI_RE = [
	[ 'egypt-mobile', /\b01[0125][0-9]{8}\b/g ],
	[ 'intl-phone', /\+20[0-9]{10}\b/g ],
	[ 'booking-meta-key', /siraj_(?:phone|service|date|notes|ip_hash|booking_submit|booking_form|website)\b/g ],
];
const SECRET_RE = [ [ 'assigned-secret', /\b(?:password|passwd|secret|token|api[_-]?key)\b\s*[:=]\s*["'][^"']{6,}["']/gi ] ];

function escapeRe( s ) {
	return s.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );
}
function redact( s ) {
	return s
		.replace( /[0-9]{3,}/g, ( m ) => `<digits:${m.length}>` )
		.replace( /[\u0600-\u06FF]+/g, '<ar>' )
		.replace( /\+/g, '+' );
}
function countAll( text, needle ) {
	let n = 0, i = 0;
	while ( ( i = text.indexOf( needle, i ) ) !== -1 ) { n++; i += needle.length; }
	return n;
}

const files = fs.readdirSync( EV ).filter( ( f ) => fs.statSync( path.join( EV, f ) ).isFile() && f !== path.basename( OUT ) );
const L = [];
L.push( '# PII / pattern context scan (count-only, values withheld) — ' + new Date().toISOString() );
L.push( '' );

// ---------- A. stored-value count-only scan --------------------------------
L.push( '## A. stored booking values — occurrences across all ' + files.length + ' captures' );
L.push( '    (candidates derived from scripts/booking-e2e.js valid submission; DB lengths: check5-6-db-and-cpt.txt §D/§E)' );
L.push( '' );
L.push( 'candidate                                   candLen  dbLen  match    totalHits  files-with-hits' );
for ( const c of CANDIDATES ) {
	const len = [ ...c.value ].length;
	const re = new RegExp( escapeRe( c.value ), 'g' );
	let total = 0;
	const hitFiles = [];
	for ( const f of files ) {
		const text = fs.readFileSync( path.join( EV, f ), 'utf8' );
		const n = countAll( text, c.value );
		if ( n > 0 ) { total += n; hitFiles.push( f + '(' + n + ')' ); }
	}
	const lenOk = c.dbLen === null ? 'n/a' : ( len === c.dbLen ? 'OK' : 'DIFFER' );
	const dbCol = c.dbLen === null ? 'n/a' : c.dbLen;
	L.push(
		c.label.padEnd( 42 ) + String( len ).padStart( 7 ) + '  ' + String( dbCol ).padStart( 4 ) + '  ' +
		lenOk.padEnd( 7 ) + '  ' + String( total ).padStart( 9 ) + '  ' + ( hitFiles.join( ', ' ) || '-' )
	);
}
L.push( '' );
L.push( 'PII rows (title/notes/stored phone) must be 0 — a hit would mean a stored value leaked into a capture.' );
L.push( 'service/date/public-hint rows are expected in the public form markup of /book/ and its REST render.' );
L.push( '' );

// ---------- B. redacted context of html-scan pattern hits ------------------
L.push( '## B. redacted context of the pattern hits reported by check2-check6-page-output-scan.txt' );
L.push( '    (digit runs -> <digits:N>, Arabic runs -> <ar>; the point is WHICH markup they sit in)' );
L.push( '' );
for ( const f of [ 'check6-resp-_wp_json_wp_v2_pages_per_page_100.txt', 'page-book.html' ] ) {
	const p = path.join( EV, f );
	if ( ! fs.existsSync( p ) ) { continue; }
	const text = fs.readFileSync( p, 'utf8' );
	L.push( '### ' + f );
	for ( const [ label, re ] of PI_RE ) {
		const r = new RegExp( re.source, 'g' );
		let m, i = 0;
		while ( ( m = r.exec( text ) ) !== null && i < 12 ) {
			const from = Math.max( 0, m.index - 70 );
			const to = Math.min( text.length, m.index + m[ 0 ].length + 70 );
			L.push( '  ' + label + ' hit ' + ( ++i ) + ' @' + m.index + ': …' + redact( text.slice( from, to ) ) + '…' );
			if ( m[ 0 ].length === 0 ) { r.lastIndex++; }
		}
		if ( i === 0 ) { L.push( '  ' + label + ': 0 hits' ); }
	}
	L.push( '' );
}

// ---------- C. oEmbed assigned-secret match measurement --------------------
L.push( '## C. assigned-secret match in the oEmbed capture (finding #28)' );
L.push( '' );
const oembed = files.find( ( f ) => f.startsWith( 'check6-resp-_wp_json_oembed' ) );
if ( oembed ) {
	const text = fs.readFileSync( path.join( EV, oembed ), 'utf8' );
	const r = new RegExp( SECRET_RE[ 0 ][ 1 ].source, 'gi' );
	let m, n = 0;
	while ( ( m = r.exec( text ) ) !== null ) {
		n++;
		const key = /^[a-z_-]+/i.exec( m[ 0 ] )[ 0 ];
		const q = /[\"']([^\"']+)[\"']$/.exec( m[ 0 ] );
		const valueLen = q ? [ ...q[ 1 ] ].length : -1;
		const from = Math.max( 0, m.index - 50 );
		const to = Math.min( text.length, m.index + m[ 0 ].length + 50 );
		L.push( '  file: ' + oembed + ' (' + text.length + ' chars)' );
		L.push( '  hit ' + n + ': offset=' + m.index + ' fullMatchLength=' + m[ 0 ].length +
			' key=' + key + ' quotedValueLength=' + valueLen );
		L.push( '  redacted context: …' + redact( text.slice( from, to ) ) + '…' );
	}
	if ( n === 0 ) { L.push( '  0 hits' ); }
	try {
		const j = JSON.parse( text );
		L.push( '  top-level oEmbed keys: ' + Object.keys( j ).join( ', ' ) );
	} catch ( e ) {
		L.push( '  (response is not a single JSON object: ' + e.message + ')' );
	}
} else {
	L.push( '  oEmbed capture not found' );
}
L.push( '' );

fs.writeFileSync( OUT, L.join( '\n' ) + '\n', 'utf8' );
process.stdout.write( 'wrote ' + OUT + '\n' );
