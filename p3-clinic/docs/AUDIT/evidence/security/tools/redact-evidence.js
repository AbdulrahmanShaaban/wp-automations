#!/usr/bin/env node
/**
 * redact-evidence.js — post-process a captured evidence file so that no secret
 * VALUE survives in the evidence tree. Replaces long hex literals and the
 * wp-env placeholder strings, and reports how many were found (count only).
 *
 * Usage: node redact-evidence.js <file> [<file> ...]
 */
'use strict';
const fs = require( 'fs' );

for ( const p of process.argv.slice( 2 ) ) {
	const original = fs.readFileSync( p, 'utf8' );
	const hexCount = ( original.match( /\b[0-9a-f]{24,}\b/gi ) || [] ).length;
	const phCount = ( original.match( /example (?:username|password)/gi ) || [] ).length;
	const redacted = original
		.replace( /'[0-9a-f]{20,}'/gi, "'<REDACTED-HEX-LITERAL>'" )
		.replace( /'example (username|password)'/gi, "'<REDACTED-PLACEHOLDER>'" )
		.replace( /\b[0-9a-f]{24,}\b/gi, '<REDACTED-HEX-LITERAL>' );
	fs.writeFileSync( p, redacted, 'utf8' );
	const left = ( redacted.match( /\b[0-9a-f]{24,}\b/gi ) || [] ).length;
	process.stdout.write(
		`${ p }: long-hex-literals-found=${ hexCount } placeholders=${ phCount } remaining-after-redaction=${ left }\n`
	);
}