// patch-telegram-env.js — move Telegram credentials out of node expressions.
//
// n8n 2.41 evaluates $env in *node expressions* with "access to env vars denied",
// while Code nodes may read $env freely. Every Telegram send is therefore routed as:
//   Code node  -> appends tgToken/tgChatId (from $env) to the item JSON
//   HTTP node  -> reads {{$json.tgToken}} / {{$json.tgChatId}} in url + jsonBody
//
// Idempotent: re-running does not double-append. Run from the repo root:
//   node scripts/patch-telegram-env.js
'use strict';

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'n8n', 'workflows');

const FORBIDDEN = /\$env\.(TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID)/;
const IS_TELEGRAM = (node) =>
  String(node.type || '').includes('httpRequest') &&
  String((node.parameters || {}).url || '').includes('api.telegram.org');

function patchFormatNode(node) {
  const code = node.parameters.jsCode;
  if (code.includes('tgToken:')) return { node, changed: false, why: 'already patched' };
  const marker = /\n(\s*)tgText\b/;
  const m = code.match(marker);
  if (!m) return { node, changed: false, why: 'no tgText field found' };
  const indent = m[1];
  const inject =
    indent + '// n8n 2.41 blocks $env in node expressions; Code nodes may read it, so the\n' +
    indent + '// credentials are resolved here and the HTTP node reads them from the item.\n' +
    indent + "tgToken: $env.TELEGRAM_BOT_TOKEN || '',\n" +
    indent + "tgChatId: $env.TELEGRAM_CHAT_ID || '',";
  const patched = code.replace(marker, '\n' + inject);
  return {
    node: Object.assign({}, node, { parameters: Object.assign({}, node.parameters, { jsCode: patched }) }),
    changed: true,
    why: 'added tgToken/tgChatId',
  };
}

// Appends the credential fields to whatever object a Code node returns, without
// touching the rest of its logic. Handles `return [{ json: { … } }];` shapes.
function injectCreds(code) {
  if (code.includes('tgToken:')) return { code, changed: false };
  const outRe = /return\s+\[\{\s*\n?\s*json:\s*\{/;
  const m = code.match(outRe);
  if (!m) return { code, changed: false };
  // find the first "return [{ json: {" and insert the fields right after it
  const idx = code.indexOf(m[0]) + m[0].length;
  const inject =
    "\n    // n8n 2.41 blocks $env in node expressions (Code nodes may read it), so\n" +
    '    // the Telegram HTTP node gets its credentials from this item instead.\n' +
    "    tgToken: $env.TELEGRAM_BOT_TOKEN || '',\n" +
    "    tgChatId: $env.TELEGRAM_CHAT_ID || '',";
  return { code: code.slice(0, idx) + inject + code.slice(idx), changed: true };
}

// For F3 the Telegram sender used to sit *after* the email node (which replaces the
// item JSON). Move it to be a direct sibling of the email, fed by the same IF.
function rewireTelegramOffEmailNode(wf) {
  const emailNodes = wf.nodes.filter((n) => String(n.type || '').includes('emailSend'));
  if (emailNodes.length === 0) return { wf, changed: false };
  let changed = false;
  for (const email of emailNodes) {
    const outs = wf.connections[email.name];
    if (!outs || !outs.main) continue;
    for (const branch of outs.main) {
      for (const c of branch || []) {
        const target = wf.nodes.find((n) => n.name === c.node);
        if (target && IS_TELEGRAM(target)) {
          // find what feeds the email node and route that source to the Telegram node too
          const feeders = [];
          for (const [src, o] of Object.entries(wf.connections)) {
            for (const br of o.main || []) {
              for (const cc of br || []) {
                if (cc.node === email.name) feeders.push(src);
              }
            }
          }
          // rewire: from each feeder, add the telegram node as an extra target on the
          // branch that fed the email; drop the email->telegram edge
          for (const feeder of feeders) {
            const br = wf.connections[feeder].main.find((b) => (b || []).some((x) => x.node === email.name));
            if (br && !br.some((x) => x.node === c.node)) {
              br.push({ node: c.node, type: 'main', index: 0 });
            }
          }
          branch.splice(branch.indexOf(c), 1);
          changed = true;
        }
      }
    }
  }
  return { wf, changed };
}

function patchHttpNode(node) {
  const p = node.parameters;
  const before = JSON.stringify(p);
  const next = Object.assign({}, p);
  next.url = '=https://api.telegram.org/bot{{ $json.tgToken }}/sendMessage';
  next.jsonBody =
    "={{ JSON.stringify({ chat_id: $json.tgChatId, text: $json.tgText, parse_mode: 'HTML' }) }}";
  if (JSON.stringify(next) === before) {
    return { node, changed: false, why: 'already patched' };
  }
  return {
    node: Object.assign({}, node, { parameters: next }),
    changed: true,
    why: 'url/jsonBody now read $json.tgToken/tgChatId',
  };
}

let anyChanged = false;
for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
  const full = path.join(DIR, file);
  const wf = JSON.parse(fs.readFileSync(full, 'utf8'));
  let fileChanged = false;
  const notes = [];

  const tgNodes = wf.nodes.filter(IS_TELEGRAM);
  const needCreds = tgNodes.some((n) => String(JSON.stringify(n.parameters)).includes('$json.tgToken'));
  if (needCreds) {
    // Inject creds into the Code node(s) that produce tgText (the Format nodes) —
    // they sit upstream of any IF/Mark and their fields flow to the HTTP node via
    // spread/passthrough. Patch every Code node in the file whose output carries tgText.
    const formatNodes = wf.nodes.filter(
      (n) => String(n.type || '').includes('.code') && String((n.parameters || {}).jsCode || '').includes('tgText')
    );
    for (const fnode of formatNodes) {
      const r = injectCreds(fnode.parameters.jsCode);
      if (r.changed) {
        wf.nodes = wf.nodes.map((n) =>
          n.name === fnode.name
            ? Object.assign({}, n, { parameters: Object.assign({}, n.parameters, { jsCode: r.code }) })
            : n
        );
        fileChanged = true;
        notes.push(fnode.name + ': injected tgToken/tgChatId');
      }
    }
  }

  // Move any Telegram node that currently sits downstream of an email node so it is
  // fed directly by the same IF branch (email/HTTP nodes replace item JSON).
  const rewired = rewireTelegramOffEmailNode(wf);
  if (rewired.changed) {
    wf.connections = rewired.wf.connections;
    fileChanged = true;
    notes.push('rewired: Telegram node moved off the emailSend output');
  }

  wf.nodes = wf.nodes.map((node) => {
    if (!IS_TELEGRAM(node)) return node;
    const r = patchHttpNode(node);
    if (r.changed) {
      fileChanged = true;
      notes.push(node.name + ': ' + r.why);
    }
    return r.node;
  });

  // A flow is only valid if every telegram sender now reads $json.*
  const stillEnv = wf.nodes.filter((n) => IS_TELEGRAM(n) && FORBIDDEN.test(JSON.stringify(n.parameters)));
  if (stillEnv.length > 0) {
    console.log(file + ': LEFTOVER $env telegram refs in: ' + stillEnv.map((n) => n.name).join(', '));
  }

  if (fileChanged) {
    fs.writeFileSync(full, JSON.stringify(wf, null, 2) + '\n');
    anyChanged = true;
    console.log(file + ': patched');
    for (const n of notes) console.log('    ' + n);
  } else {
    console.log(file + ': unchanged');
  }
}

console.log(anyChanged ? 'done (changes written)' : 'done (no changes needed)');
