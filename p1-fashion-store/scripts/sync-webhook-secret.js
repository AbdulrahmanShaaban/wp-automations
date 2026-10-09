#!/usr/bin/env node
/**
 * sync-webhook-secret.js — push the WP-side webhook secret into n8n/.env.
 *
 * Canonical source (GATE-2026-10-06 B1): wp option `nilad_n8n_webhook_secret`,
 * which register-n8n-webhooks.php generates/uses and pushes into the WooCommerce
 * webhook rows. n8n verifies signatures with WOO_WEBHOOK_SECRET from n8n/.env,
 * so after any rotation this script copies the option value across.
 *
 * Usage:
 *   node scripts/sync-webhook-secret.js            # WP option -> n8n/.env
 *
 * Prints status + lengths only — never the value. Exits non-zero on mismatch.
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, 'n8n', '.env');
const HEX48 = /^[0-9a-f]{48}$/;

function readOption() {
  let out;
  try {
    out = execFileSync(
      'npx',
      ['@wordpress/env', 'run', 'cli', 'wp', 'option', 'get', 'nilad_n8n_webhook_secret'],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: true }
    );
  } catch (err) {
    console.error('FAIL: could not read wp option nilad_n8n_webhook_secret.');
    console.error('      Run first: npx @wordpress/env run cli wp eval-file /var/www/html/wp-content/plugins/nilad-core/register-n8n-webhooks.php');
    process.exit(2);
  }
  const line = (out || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => HEX48.test(l));
  if (!line) {
    console.error('FAIL: option value missing or not a 48-hex string (output parsed, value not shown).');
    process.exit(2);
  }
  return line;
}

function writeEnv(secret) {
  if (!fs.existsSync(envPath)) {
    console.error(`FAIL: ${path.relative(root, envPath)} not found (expected WOO_WEBHOOK_SECRET line).`);
    process.exit(2);
  }
  const raw = fs.readFileSync(envPath, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  let found = false;
  const next = lines.map((line) => {
    if (/^WOO_WEBHOOK_SECRET=/.test(line)) {
      found = true;
      return `WOO_WEBHOOK_SECRET=${secret}`;
    }
    return line;
  });
  if (!found) next.push(`WOO_WEBHOOK_SECRET=${secret}`);
  fs.writeFileSync(envPath, next.join(eol), { encoding: 'utf8' });
}

function verifyEnv(secret) {
  const raw = fs.readFileSync(envPath, 'utf8');
  const m = raw.match(/^WOO_WEBHOOK_SECRET=(.*)$/m);
  if (!m) return false;
  return m[1].trim() === secret;
}

const secret = readOption();
const before = (() => {
  if (!fs.existsSync(envPath)) return '(no file)';
  const m = fs.readFileSync(envPath, 'utf8').match(/^WOO_WEBHOOK_SECRET=(.*)$/m);
  if (!m) return '(key missing)';
  const v = m[1].trim();
  return `present len=${v.length} matches-option=${v === secret}`;
})();

writeEnv(secret);
if (!verifyEnv(secret)) {
  console.error('FAIL: n8n/.env WOO_WEBHOOK_SECRET does not match the wp option after write.');
  process.exit(1);
}

console.log(`CHECK sync-webhook-secret: before ${before}`);
console.log(`CHECK sync-webhook-secret: n8n/.env WOO_WEBHOOK_SECRET updated len=${secret.length} matches-wp-option=true`);
console.log('CHECK sync-webhook-secret: PASS (value not printed)');
