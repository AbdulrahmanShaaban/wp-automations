// cleanup-n8n-api.js — one-shot maintenance against the local n8n REST API.
// Removes duplicate workflow copies left by re-imports (n8n import:workflow always
// creates NEW ids instead of updating), then wires the shared Error Workflow into
// every flow and can activate selected ones.
//
//   node scripts/cleanup-n8n-api.js --keep-new            (report only)
//   node scripts/cleanup-n8n-api.js --delete-stale        (delete older duplicates)
//   node scripts/cleanup-n8n-api.js --attach-error        (set errorWorkflow on all)
//   node scripts/cleanup-n8n-api.js --activate F1
//
// Reads credentials from n8n/owner-account.local.txt (local, gitignored) and
// keeps the session cookie in the OS temp dir. No secrets are printed.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = (process.env.N8N_URL || 'http://localhost:5678').replace(/\/+$/, '');
const COOKIE = path.join(os.tmpdir(), 'n8n-cookies.txt');
const ACCOUNTS = path.join(__dirname, '..', 'n8n', 'owner-account.local.txt');

function account() {
  const src = fs.readFileSync(ACCOUNTS, 'utf8');
  const email = (src.match(/N8N_OWNER_EMAIL=(.+)/) || [])[1];
  const password = (src.match(/N8N_OWNER_PASSWORD=(.+)/) || [])[1];
  if (!email || !password) throw new Error('owner credentials not found in n8n/owner-account.local.txt');
  return { email: email.trim(), password: password.trim() };
}

async function api(pathname, options = {}) {
  const res = await fetch(BASE + pathname, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, setCookie: res.headers.getSetCookie() };
}

async function login() {
  const { email, password } = account();
  const res = await api('/rest/login', {
    method: 'POST',
    body: JSON.stringify({ emailOrLdapLoginId: email, password }),
  });
  if (res.status >= 400) throw new Error('login failed: ' + res.status);
  const jar = res.setCookie || [];
  fs.writeFileSync(
    COOKIE,
    jar.map((c) => c.split(';')[0]).join('\n') + '\n'
  );
  return jar.length;
}

function cookieHeader() {
  const jar = fs.readFileSync(COOKIE, 'utf8').trim().split('\n').filter(Boolean);
  return jar.join('; ');
}

async function listWorkflows() {
  const res = await api('/rest/workflows?limit=100', { headers: { cookie: cookieHeader() } });
  if (res.status >= 400) throw new Error('list failed: ' + res.status);
  return res.body.data || [];
}

// Group by name; older ids are duplicates created by an earlier import.
function groupByName(workflows) {
  const map = new Map();
  for (const w of workflows) {
    if (!map.has(w.name)) map.set(w.name, []);
    map.get(w.name).push(w);
  }
  for (const list of map.values()) {
    // Prefer to keep an ACTIVE copy; among equals prefer the newest.
    list.sort((a, b) => {
      const aActive = a.active ? 1 : 0;
      const bActive = b.active ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
  }
  return map;
}

async function main() {
  const args = process.argv.slice(2);
  const cookies = await login();
  console.log('logged in (' + cookies + ' session cookies)');

  // Unarchive anything left archived by a previous run: n8n refuses to publish,
  // attach or activate an archived workflow.
  const initial = await listWorkflows();
  for (const w of initial) {
    if (!w.isArchived) continue;
    const res = await api('/rest/workflows/' + w.id + '/unarchive', {
      method: 'POST',
      headers: { cookie: cookieHeader() },
    });
    console.log('  unarchive ' + w.name + ' -> HTTP ' + res.status + (res.status >= 400 ? ' ' + JSON.stringify(res.body).slice(0, 120) : ''));
  }

  const workflows = await listWorkflows();
  const groups = groupByName(workflows);
  console.log('workflows in instance: ' + workflows.length + ' (' + groups.size + ' distinct names)');
  for (const [name, list] of groups) {
    if (list.length > 1) console.log('  DUPLICATE x' + list.length + ': ' + name);
  }

  if (args.includes('--delete-stale')) {
    let deleted = 0;
    for (const [, list] of groups) {
      for (const w of list.slice(0, -1)) {
        // n8n 2.x: "Workflow must be archived before it can be deleted", and archiving
        // has its own route — a PATCH with isArchived is silently ignored.
        const archived = await api('/rest/workflows/' + w.id + '/archive', {
          method: 'POST',
          headers: { cookie: cookieHeader() },
        });
        const alreadyArchived =
          archived.status >= 400 &&
          archived.body &&
          String(archived.body.message || '').indexOf('already archived') !== -1;
        if (archived.status >= 400 && !alreadyArchived) {
          console.log('  FAILED to archive ' + w.id + ': ' + archived.status + ' ' + JSON.stringify(archived.body));
          continue;
        }
        if (archived.body && archived.body.data && archived.body.data.isArchived === false && !alreadyArchived) {
          console.log('  archive not applied to ' + w.id + ' (isArchived still false)');
          continue;
        }
        const res = await api('/rest/workflows/' + w.id, {
          method: 'DELETE',
          headers: { cookie: cookieHeader() },
        });
        if (res.status < 400) {
          deleted += 1;
          console.log('  deleted stale ' + w.id + ' (' + w.name + ')');
        } else {
          console.log('  FAILED to delete ' + w.id + ': ' + res.status + ' ' + JSON.stringify(res.body));
        }
      }
    }
    console.log('deleted ' + deleted + ' stale duplicate(s)');
  }

  if (args.includes('--attach-error')) {
    const all0 = await listWorkflows();
    const errorFlow = all0.find((w) => w.name.includes('error'));
    if (!errorFlow) throw new Error('error workflow not found');
    console.log('error workflow: ' + errorFlow.id + ' (' + errorFlow.name + ')');
    const all = await listWorkflows();
    let patched = 0;
    for (const w of all) {
      if (w.id === errorFlow.id) continue;
      if (w.settings && w.settings.errorWorkflow === errorFlow.id) continue;
      const settings = Object.assign({}, w.settings, { errorWorkflow: errorFlow.id });
      const res = await api('/rest/workflows/' + w.id, {
        method: 'PATCH',
        headers: { cookie: cookieHeader() },
        body: JSON.stringify({ settings }),
      });
      if (res.status < 400) {
        patched += 1;
        console.log('  error workflow attached: ' + w.name);
      } else {
        console.log('  FAILED ' + w.name + ': ' + res.status + ' ' + JSON.stringify(res.body).slice(0, 200));
      }
    }
    console.log('attached to ' + patched + ' workflow(s)');
  }

  const activate = args.find((a) => a.startsWith('--activate='));
  const activateAll = args.includes('--activate-all');
  if (activate || activateAll) {
    const all = await listWorkflows();
    const wanted = activateAll
      ? all
      : all.filter((w) => w.name.includes(activate.slice('--activate='.length)));
    if (wanted.length === 0) {
      console.log('no workflow matched "' + (activate || '--activate-all') + '"');
    }
    // n8n 2.x: POST /rest/workflows/:id/activate requires the published versionId
    // in the body ({"versionId": "..."}) — otherwise 400 invalid_type.
    // Activation is idempotent here: an already-active workflow is left alone.
    for (const w of wanted) {
      if (w.active) {
        console.log('  already active: ' + w.name);
        continue;
      }
      const detail = await api('/rest/workflows/' + w.id, { headers: { cookie: cookieHeader() } });
      const versionId = detail.body && detail.body.data && detail.body.data.versionId;
      if (!versionId) {
        console.log('  SKIP activate ' + w.name + ': no versionId (publish it first)');
        continue;
      }
      const res = await api('/rest/workflows/' + w.id + '/activate', {
        method: 'POST',
        headers: { cookie: cookieHeader() },
        body: JSON.stringify({ versionId }),
      });
      console.log('  activate ' + w.name + ' -> HTTP ' + res.status + (res.status >= 400 ? ' ' + JSON.stringify(res.body) : ''));
    }
  }

  const after = await listWorkflows();
  console.log('workflows now: ' + after.length);
  for (const w of after) {
    console.log(
      '  ' + w.id + ' | ' + w.name + ' | active=' + w.active +
        ' | errorWorkflow=' + ((w.settings && w.settings.errorWorkflow) || 'none')
    );
  }
}

main().then(
  () => {
    process.exitCode = 0;
  },
  (err) => {
    console.error('cleanup failed: ' + err.message);
    process.exitCode = 1;
  }
);
