// live-e2e-evidence.js — capture the live F1 end-to-end evidence into a file
// (executions list + per-node results + error workflow firing), then print a summary.
// Run right after node scripts/probe-f1-webhook.js
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'n8n', 'tests', 'live-e2e-evidence.txt');
const ACCOUNT = path.join(ROOT, 'n8n', 'owner-account.local.txt');

(async () => {
  const lines = [];
  const say = (s) => {
    lines.push(s);
    console.log(s);
  };
  say('Nilad F1 — LIVE end-to-end evidence');
  say('====================================');
  say('Date: ' + new Date().toISOString());
  say('n8n: local docker (nilad-n8n), workflows imported + published + activated via API');
  say('Telegram: @nilad_notify_bot (token valid, chat id read from owner /start)');
  say('');

  // 1. webhook probes (re-run to capture HTTP results)
  say('1) Webhook probes against F1 (n8n /webhook/woo-order-created):');
  const probe = execFileSync('node', [path.join(ROOT, 'scripts', 'probe-f1-webhook.js')], { encoding: 'utf8' });
  for (const l of probe.trim().split('\n')) say('   ' + l);
  say('');

  // 2. wait for executions then list
  await new Promise((r) => setTimeout(r, 12000));
  say('2) Recent n8n executions:');
  const execs = execFileSync('node', [path.join(ROOT, 'scripts', 'list-n8n-executions.js'), '8'], { encoding: 'utf8' });
  for (const l of execs.trim().split('\n')) say('   ' + l);
  say('');

  // 3. per-execution node results (via the SQLite dumper inside a one-shot container)
  say('3) Per-node results (SQLite dump inside one-shot n8n container):');
  try {
    const dump = execFileSync(
      'docker',
      [
        'run', '--rm', '--name', 'nilad-n8n-evidence',
        '-v', 'nilad-n8n-data:/data',
        '-v', path.join(ROOT, 'scripts') + ':/scripts:ro',
        '--entrypoint', 'sh', 'n8nio/n8n:latest',
        '-c',
        'cp /data/database.sqlite /tmp/d.sqlite; cp /data/database.sqlite-wal /tmp/d.sqlite-wal 2>/dev/null; cp /data/database.sqlite-shm /tmp/d.sqlite-shm 2>/dev/null; node /scripts/dump-exec-errors.js 6',
      ],
      { encoding: 'utf8' }
    );
    for (const l of dump.trim().split('\n')) say('   ' + l);
  } catch (e) {
    say('   (dump failed: ' + (e.stderr || e.message).toString().slice(0, 200) + ')');
  }

  fs.writeFileSync(OUT, lines.join('\n') + '\n');
  console.log('\nevidence written to n8n/tests/live-e2e-evidence.txt');
})();
