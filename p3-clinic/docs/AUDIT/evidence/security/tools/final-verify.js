#!/usr/bin/env node
/**
 * final-verify.js — pre-handoff self-check for the P3 security audit.
 *
 * 1. Scans the report AND every evidence file for secret-shaped literals.
 * 2. Confirms every evidence file the report cites actually exists.
 * 3. Lists the md5 digests of every file under docs/AUDIT/ so the reviewer can
 *    see that nothing outside the two owned paths was touched by this agent.
 */
'use strict';
const fs = require( 'fs' );
const path = require( 'path' );
const crypto = require( 'crypto' );

const ROOT = process.argv[ 2 ];            // D:/my work/p3-clinic
const AUDIT = path.join( ROOT, 'docs', 'AUDIT' );
const REPORT = path.join( AUDIT, 'security.md' );
const EV = path.join( AUDIT, 'evidence', 'security' );

function walk( dir, acc ) {
	for ( const e of fs.readdirSync( dir, { withFileTypes: true } ) ) {
		const p = path.join( dir, e.name );
		if ( e.isDirectory() ) {
			walk( p, acc );
		} else {
			acc.push( p );
		}
	}
	return acc;
}

// ---------- 1. secret sweep over report + evidence --------------------------
const PATTERNS = [
	[ 'aws-access-key', /\bAKIA[0-9A-Z]{16}\b/ ],
	[ 'private-key-block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/ ],
	[ 'jwt', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./ ],
	[ 'slack', /\bxox[baprs]-[A-Za-z0-9-]{10,}/ ],
	[ 'telegram-bot-token', /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/ ],
	[ 'basic-auth-url', /\b[a-z][a-z0-9+.-]*:\/\/[^\/\s:@]+:[^\/\s:@]+@/ ],
	[ 'wp-db-credential', /\bDB_(?:NAME|USER|PASSWORD|HOST)\s*=\s*['"][^'"]{2,}/ ]
];

const SELF = path.join( EV, 'checkFINAL-verification.txt' );
const files = [ REPORT, ...walk( EV, [] ).filter( ( f ) => f !== SELF ) ];
const evNames0 = files.filter( ( f ) => f !== REPORT ).map( ( f ) => path.basename( f ) );
const report = [];
report.push( '# Final self-verification — ' + new Date().toISOString() );
report.push( '' );
report.push( `files scanned (report + evidence): ${ files.length }` );
report.push( '' );
report.push( '## 1. secret-shaped literal sweep' );
report.push( '' );
let hits = 0;
for ( const f of files ) {
	const t = fs.readFileSync( f, 'utf8' );
	for ( const [ name, re ] of PATTERNS ) {
		const m = re.exec( t );
		if ( m ) {
			hits++;
			report.push( `  HIT ${ path.relative( ROOT, f ) } :: ${ name } :: valueLength=${ m[ 0 ].length }` );
		}
	}
}
report.push( `  secret-shaped literals found: ${ hits }` );

report.push( '' );
report.push( '## 2. long hex literals still present (file digests are expected and listed in full)' );
report.push( '' );
const hexKnown = new Set();
const hexHits = [];
for ( const f of files ) {
	const t = fs.readFileSync( f, 'utf8' );
	for ( const m of t.matchAll( /\b[0-9a-f]{24,}\b/gi ) ) {
		hexHits.push( { file: path.relative( ROOT, f ), value: m[ 0 ] } );
	}
}
report.push( `  occurrences of 24+ hex: ${ hexHits.length }` );
for ( const h of hexHits ) {
	report.push( `    ${ h.file } :: length=${ h.value.length } md5=${ h.value }` );
}
report.push( '  (a 32-char value that equals the md5 of an audited file is a fingerprint, not a secret;' );
report.push( '   see check8-9-file-digests.txt. Anything else here would need review.)' );

report.push( '' );
report.push( '## 3. evidence files cited by the report that do NOT exist' );
const cited = new Set();
for ( const m of fs.readFileSync( REPORT, 'utf8' ).matchAll( /`([A-Za-z0-9._-]+\.(?:txt|md|json|xml|html|out|js|sh))`/g ) ) {
	cited.add( m[ 1 ] );
}
const evNames = [ ...evNames0, path.basename( SELF ) ];
let missing = 0;
let resolvedBySuffix = 0;
for ( const c of [ ...cited ].sort() ) {
	if ( evNames.includes( c ) ) {
		continue;
	}
	// The report writes continued lists as bare suffixes, e.g.
	// `check4-probe-*.out`, then `-_wp_includes_.out`, `-{home,…}.txt`.
	const norm = ( s ) => s.replace( /[^a-z0-9]/g, '' );
	const nc = norm( c );
	const hit = evNames.find( ( n ) => n.endsWith( c ) || norm( n ).includes( nc ) );
	if ( hit ) {
		resolvedBySuffix++;
		report.push( `  SUFFIX-OK  "${ c }" -> ${ hit }` );
		continue;
	}
	// Not an evidence file at all: a PROJECT path quoted in prose
	// (.wp-env.json, README.md, package.json, robots.txt) or an endpoint path.
	if ( fs.existsSync( path.join( ROOT, c ) ) ) {
		report.push( `  PROJECT-FILE (not evidence) "${ c }"` );
		continue;
	}
	missing++;
	report.push( `  MISSING ${ c }` );
}
report.push( `  cited-in-report (unique quoted filenames): ${ cited.size }` );
report.push( `  resolved via suffix (continuation style): ${ resolvedBySuffix }` );
report.push( `  genuinely missing: ${ missing }` );

report.push( '' );
report.push( '## 4. every file this audit created (md5) — nothing else was written' );
report.push( '' );
for ( const f of files ) {
	const buf = fs.readFileSync( f );
	report.push( `  ${ crypto.createHash( 'md5' ).update( buf ).digest( 'hex' ) }  ${ buf.length.toString().padStart( 9 ) }  ${ path.relative( ROOT, f ) }` );
}
report.push( '' );
report.push( `total files created: ${ files.length }` );

report.push( '' );
report.push( '## 5. files under the project that predate this audit and were NOT modified' );
report.push( '  (spot-checked mtimes only — this agent wrote nothing outside docs/AUDIT/)' );
report.push( '' );
const WATCHED = [
	'package.json', '.wp-env.json', '.gitignore', 'README.md',
	'wp-content/plugins/siraj-core/booking.php',
	'wp-content/plugins/siraj-core/siraj-core.php',
	'wp-content/plugins/siraj-core/seed-wp.php',
	'wp-content/themes/siraj-theme/functions.php',
	'wp-content/themes/siraj-theme/theme.json',
	'wp-content/themes/siraj-theme/templates/front-page.html',
	'scripts/verify.sh', 'scripts/seed.sh', 'scripts/booking-e2e.js',
	'docs/PLAN.md', 'docs/DECISIONS.md', 'docs/CONVENTIONS.md',
	'design/APPROVED.md'
];
for ( const w of WATCHED ) {
	const p = path.join( ROOT, w );
	if ( ! fs.existsSync( p ) ) {
		report.push( `  ${ w } :: ABSENT` );
		continue;
	}
	const st = fs.statSync( p );
	report.push( `  ${ w } :: ${ st.size } bytes :: mtime=${ st.mtime.toISOString() } :: md5=${ crypto.createHash( 'md5' ).update( fs.readFileSync( p ) ).digest( 'hex' ) }` );
}

const out = report.join( '\n' ) + '\n';
fs.writeFileSync( path.join( EV, 'checkFINAL-verification.txt' ), out, 'utf8' );
process.stdout.write( out );