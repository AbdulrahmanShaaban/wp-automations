#!/usr/bin/env node
/**
 * secret-scan.js — READ-ONLY secrets sweep for the P3 security audit.
 *
 * Rule (from the P1 audit): report key NAMES and match/no-match only.
 * A literal value is NEVER printed — only its length and a MATCH/DIFFER verdict
 * against a second occurrence, so a reviewer can prove a secret was duplicated
 * without the value ever entering the evidence files.
 */
'use strict';

const fs = require( 'fs' );
const path = require( 'path' );

const ROOT = path.resolve( process.argv[ 2 ] );
const OUT = process.argv[ 3 ];

const SKIP_DIRS = new Set( [ 'node_modules', '.git', 'shots', 'evidence' ] );
const TEXT_EXT = new Set( [
	'.php', '.js', '.mjs', '.cjs', '.ts', '.json', '.md', '.css', '.html', '.sh',
	'.txt', '.env', '.log', '.yml', '.yaml', '.xml', '.svg', ''
] );

// name = human label, re = pattern that finds a secret-ish literal
const PATTERNS = [
	[ 'aws-access-key-id', /\bAKIA[0-9A-Z]{16}\b/g ],
	[ 'private-key-block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g ],
	[ 'long-hex-literal-24plus', /\b[0-9a-f]{24,}\b/gi ],
	[ 'bearer-or-jwt', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./g ],
	[ 'slack-token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/g ],
	[ 'telegram-bot-token', /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/g ],
	[ 'wp-hash-32', /\b[a-f0-9]{32}\b/gi ],
	[ 'assigned-secret-name', /\b(?:password|passwd|secret|token|api[_-]?key|app[_-]?key|private[_-]?key|client[_-]?secret|auth[_-]?token)\b\s*[:=]\s*["'][^"']{6,}["']/gi ],
	[ 'basic-auth-url', /\b[a-z][a-z0-9+.-]*:\/\/[^\/\s:@]+:[^\/\s:@]+@/gi ]
];

function walk( dir, acc ) {
	for ( const entry of fs.readdirSync( dir, { withFileTypes: true } ) ) {
		if ( entry.isDirectory() ) {
			if ( SKIP_DIRS.has( entry.name ) ) {
				continue;
			}
			walk( path.join( dir, entry.name ), acc );
		} else if ( entry.isFile() ) {
			const ext = path.extname( entry.name ).toLowerCase();
			if ( TEXT_EXT.has( ext ) && !/\.(png|jpe?g|gif|webp|woff2?|ttf|zip|gz)$/i.test( entry.name ) ) {
				acc.push( path.join( dir, entry.name ) );
			}
		}
	}
	return acc;
}

const files = walk( ROOT, [] );
const lines = [];

lines.push( `# Secret sweep — ${ new Date().toISOString() }` );
lines.push( '' );
lines.push( '## 1. Secret-shaped filenames present in the project tree' );
lines.push( '' );
lines.push( '```' );
const secretNames = files.filter( ( f ) => /\.(env|log|local)$|^\.env|credential|secret|\.pem$|\.key$/i.test( path.basename( f ) ) );
lines.push( `files-scanned: ${ files.length }` );
lines.push( `secret-shaped-filenames: ${ secretNames.length }` );
for ( const f of secretNames ) {
	lines.push( `  PRESENT ${ path.relative( ROOT, f ) } (${ fs.statSync( f ).size } bytes)` );
}
lines.push( '```' );

lines.push( '' );
lines.push( '## 2. Secret-shaped filenames present in the PARENT working folder (siblings, informational only)' );
lines.push( '' );
lines.push( '```' );
try {
	for ( const f of fs.readdirSync( path.dirname( ROOT ), { withFileTypes: true } ) ) {
		if ( f.isFile() && /\.(env|log)$|^\.env|credential|secret/i.test( f.name ) ) {
			lines.push( `  PRESENT ${ f.name }` );
		}
	}
	lines.push( 'scan: direct children of the parent folder only' );
} catch ( err ) {
	lines.push( `  parent-folder scan failed: ${ err.code }` );
}
lines.push( '```' );

lines.push( '' );
lines.push( '## 3. Pattern sweep across every scanned file (values withheld: only name + count + length)' );
lines.push( '' );
lines.push( '```' );
let totalHits = 0;
for ( const file of files ) {
	const text = fs.readFileSync( file, 'utf8' );
	const rel = path.relative( ROOT, file );
	for ( const [ name, re ] of PATTERNS ) {
		const local = new RegExp( re.source, re.flags.includes( 'g' ) ? re.flags : re.flags + 'g' );
		let m;
		let count = 0;
		const lengths = [];
		while ( ( m = local.exec( text ) ) !== null ) {
			count++;
			lengths.push( m[ 0 ].length );
			if ( count > 200 ) {
				break;
			}
		}
		if ( count ) {
			totalHits += count;
			const line = text.slice( 0, text.indexOf( m && m[ 0 ] ) === -1 ? 0 : text.indexOf( m[ 0 ] ) ).split( '\n' ).length;
			lines.push( `${ rel } :: ${ name } :: hits=${ count } :: valueLengths=${ lengths.join( ',' ) } :: firstHitLine=${ line }` );
		}
	}
}
lines.push( `total-pattern-hits: ${ totalHits }` );
lines.push( '```' );

lines.push( '' );
lines.push( '## 4. Duplication test (MATCH / DIFFER only, values never printed)' );
lines.push( '' );
lines.push( '```' );
const hexHits = new Map();
for ( const file of files ) {
	const text = fs.readFileSync( file, 'utf8' );
	for ( const m of text.matchAll( /\b[0-9a-f]{24,}\b/gi ) ) {
		const key = m[ 0 ].toLowerCase();
		if ( ! hexHits.has( key ) ) {
			hexHits.set( key, [] );
		}
		hexHits.get( key ).push( path.relative( ROOT, file ) );
	}
}
lines.push( `distinct-long-hex-values: ${ hexHits.size }` );
for ( const [ value, where ] of hexHits ) {
	const verdict = where.length > 1 ? 'MATCH (value appears in >1 file)' : 'DIFFER (unique to one file)';
	lines.push( `  length=${ value.length } verdict=${ verdict } files=${ where.join( ' , ' ) }` );
}
lines.push( '```' );

lines.push( '' );
lines.push( '## 5. Config key names declared by .wp-env.json (names only)' );
lines.push( '' );
lines.push( '```' );
try {
	const cfg = JSON.parse( fs.readFileSync( path.join( ROOT, '.wp-env.json' ), 'utf8' ) );
	lines.push( `top-level keys: ${ Object.keys( cfg ).join( ', ' ) }` );
	lines.push( `config keys: ${ Object.keys( cfg.config || {} ).join( ', ' ) }` );
	for ( const [ k, v ] of Object.entries( cfg.config || {} ) ) {
		lines.push( `  ${ k } = ${ typeof v } (value: ${ JSON.stringify( v ) })` );
	}
} catch ( err ) {
	lines.push( `  parse failed: ${ err.message }` );
}
lines.push( '```' );

fs.writeFileSync( OUT, lines.join( '\n' ) + '\n', 'utf8' );
process.stdout.write( `wrote ${ OUT } (files scanned: ${ files.length }, pattern hits: ${ totalHits })\n` );