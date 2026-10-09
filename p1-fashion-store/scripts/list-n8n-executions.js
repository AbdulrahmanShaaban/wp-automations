// list-n8n-executions.js — recent n8n executions with status, so webhook delivery can
// be verified from the server side (no Telegram/Sheets login needed).
//   node scripts/list-n8n-executions.js [limit]
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = (process.env.N8N_URL || 'http://localhost:5678').replace(/\/+$/, '');
const ACCOUNTS = path.join(__dirname, '..', 'n8n', 'owner-account.local.txt');
const COOKIE = path.join(os.tmpdir(), 'n8n-cookies.txt');

function account() {
  const src = fs.readFileSync(ACCOUNTS, 'utf8');
  return {
    email: (src.match(/N8N_OWNER_EMAIL=(.+)/) || [])[1].trim(),
    password: (src.match(/N8N_OWNER_PASSWORD=(.+)/) || [])[1].trim(),
  };
}

async function main() {
  const limit = process.argv[2] || '10';
  const { email, password } = account();
  const login = await fetch(BASE + '/rest/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ emailOrLdapLoginId: email, password }),
  });
  const jar = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const cookie = jar;

  const workflows = await (await fetch(BASE + '/rest/workflows?limit=50', { headers: { cookie } })).json();
  const names = new Map((workflows.data || []).map((w) => [w.id, w.name]));

  const res = await fetch(BASE + '/rest/executions?limit=' + limit + '&includeData=false', { headers: { cookie } });
  const body = await res.json();
  const rows = (body.data && (body.data.results || body.data)) || [];
  console.log('executions: ' + rows.length + ' (newest first)');
  for (const e of rows) {
    console.log(
      '  #' + e.id + ' | ' + (names.get(e.workflowId) || e.workflowId) +
        ' | status=' + e.status + ' | finished=' + e.finished +
        ' | started=' + e.startedAt + (e.mode ? ' | mode=' + e.mode : '')
    );
  }
}

main().then(
  () => {
    process.exitCode = 0;
  },
  (err) => {
    console.error('failed: ' + err.message);
    process.exitCode = 1;
  }
);
