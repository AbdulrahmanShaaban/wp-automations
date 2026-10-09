// show-n8n-execution-error.js — print the error of the N latest executions.
//   node scripts/show-n8n-execution-error.js [executionIdOrLatest]
// The webhook reached n8n (HTTP 200 "Workflow was started") but executions end in
// error — this prints the failing node and message so the cause is not guessed.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = (process.env.N8N_URL || 'http://localhost:5678').replace(/\/+$/, '');
const ACCOUNTS = path.join(__dirname, '..', 'n8n', 'owner-account.local.txt');

function account() {
  const src = fs.readFileSync(ACCOUNTS, 'utf8');
  return {
    email: (src.match(/N8N_OWNER_EMAIL=(.+)/) || [])[1].trim(),
    password: (src.match(/N8N_OWNER_PASSWORD=(.+)/) || [])[1].trim(),
  };
}

async function api(p, cookie, options = {}) {
  const res = await fetch(BASE + p, {
    ...options,
    headers: { 'content-type': 'application/json', cookie, ...(options.headers || {}) },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function main() {
  const arg = process.argv[2];
  const { email, password } = account();
  const login = await fetch(BASE + '/rest/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ emailOrLdapLoginId: email, password }),
  });
  const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');

  const workflows = await api('/rest/workflows?limit=50', cookie);
  const names = new Map((workflows.body.data || []).map((w) => [w.id, w.name]));

  let targetId = arg && arg !== 'latest' ? arg : null;
  if (!targetId) {
    const list = await api('/rest/executions?limit=1&includeData=false', cookie);
    const rows = (list.body.data && (list.body.data.results || list.body.data)) || [];
    if (rows.length === 0) {
      console.log('no executions yet');
      return;
    }
    targetId = rows[0].id;
  }

  const one = await api('/rest/executions/' + targetId + '?includeData=true', cookie);
  const ex = one.body && one.body.data ? one.body.data : one.body;
  if (!ex) {
    console.log('could not read execution ' + targetId + ' (status ' + one.status + ')');
    return;
  }
  console.log('execution #' + ex.id + ' | ' + (names.get(ex.workflowId) || ex.workflowId) + ' | status=' + ex.status);
  const result = (ex.data && ex.data.resultData) || {};
  if (result.error) {
    console.log('  ERROR node: ' + (result.error.node && result.error.node.name));
    console.log('  ERROR message: ' + result.error.message);
  }
  const runData = (ex.data && ex.data.resultData && ex.data.resultData.runData) || {};
  for (const [nodeName, runs] of Object.entries(runData)) {
    for (const r of runs) {
      if (r.error) {
        console.log('  node ' + nodeName + ' -> ' + r.error.message);
      }
    }
  }
  console.log('  lastNodeExecuted: ' + (ex.data && ex.data.resultData && ex.data.resultData.lastNodeExecuted));
}

main().catch((err) => {
  console.error('failed: ' + err.message);
  process.exitCode = 1;
});
