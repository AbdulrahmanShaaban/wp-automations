#!/usr/bin/env node
/**
 * patch-wp-env.js — work around an @wordpress/env bug on Windows accounts whose
 * username contains a space (this machine: "Abdelrahman Shaaban").
 *
 * Same fix as p1-fashion-store/scripts/patch-wp-env.js (proven there): the CLI
 * image does `RUN adduser ... $HOST_USERNAME || true` (unquoted -> BusyBox usage
 * error, swallowed), then runs `composer global require` as USER $HOST_UID with
 * no passwd entry / home dir. Composer fails: "/.composer does not exist".
 *
 * Fix: as root, create the home dir + set ENV HOME before switching USER.
 * Idempotent (marker-based). Runs on `npm install` (postinstall).
 *
 * Remove when upstream fixes username-with-space handling:
 * https://github.com/WordPress/wp-env/issues
 */
const fs = require('fs');
const path = require('path');

const MARKER = 'siraj-wp-env-home-fix';
const target = path.join(
	__dirname,
	'..',
	'node_modules',
	'@wordpress',
	'env',
	'lib',
	'runtime',
	'docker',
	'docker-config.js'
);

if ( ! fs.existsSync( target ) ) {
	console.log( '[patch-wp-env] @wordpress/env not installed — skipped.' );
	process.exit( 0 );
}

let src = fs.readFileSync( target, 'utf8' );

if ( src.includes( MARKER ) ) {
	console.log( '[patch-wp-env] already applied.' );
	process.exit( 0 );
}

const anchor = 'dockerFileContent += `\nUSER $HOST_UID:$HOST_GID';
if ( ! src.includes( anchor ) ) {
	console.error( '[patch-wp-env] anchor not found — wp-env version changed; review manually.' );
	process.exit( 1 );
}

const replacement =
	'dockerFileContent += `\n' +
	'# ' + MARKER + ': home dir for host usernames containing spaces\n' +
	'RUN mkdir -p "/home/$HOST_USERNAME/.composer" \\\n' +
	'	&& chown -R $HOST_UID:$HOST_GID "/home/$HOST_USERNAME"\n' +
	'ENV HOME="/home/$HOST_USERNAME"\n' +
	'USER $HOST_UID:$HOST_GID';

src = src.replace( anchor, replacement );
fs.writeFileSync( target, src, 'utf8' );
console.log( '[patch-wp-env] applied to ' + target );
