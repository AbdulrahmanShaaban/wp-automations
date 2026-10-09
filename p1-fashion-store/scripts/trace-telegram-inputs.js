// trace-telegram-inputs.js — for every workflow, check that each Telegram HTTP node
// receives tgToken/tgChatId in its input item.
//
// A Telegram node reads {{$json.tgToken}}; that field must survive every hop between
// the Code node that resolves $env and the HTTP node. n8n replaces item JSON in some
// nodes (email/HTTP output), so the chain has to be walked hop by hop.
'use strict';

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'n8n', 'workflows');
const IS_TG = (n) =>
  String(n.type || '').includes('httpRequest') &&
  String((n.parameters || {}).url || '').includes('api.telegram.org');

function codeHasCreds(node) {
  const c = String((node.parameters || {}).jsCode || '');
  return c.includes('tgToken:') || c.includes('tgChatId:');
}

// does this node pass the whole item through (spread) or rebuild it?
function codePassesThrough(node) {
  const c = String((node.parameters || {}).jsCode || '');
  return /\.\.\./.test(c);
}

function preds(wf, name) {
  const out = new Set();
  for (const [src, outs] of Object.entries(wf.connections || {})) {
    for (const branch of outs.main || []) {
      for (const c of branch || []) {
        if (c.node === name) out.add(src);
      }
    }
  }
  return [...out];
}

let problems = 0;
for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
  const wf = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
  const tgNodes = wf.nodes.filter(IS_TG);
  if (tgNodes.length === 0) {
    console.log(file + ': no Telegram node');
    continue;
  }
  console.log('=== ' + file);
  for (const tg of tgNodes) {
    console.log('  Telegram node: ' + tg.name);
    const direct = preds(wf, tg.name);
    // Walk back until we find a Code node that sets the credentials, or a node that
    // provably drops fields.
    const chain = [];
    let frontier = direct;
    let found = false;
    let guard = 0;
    while (frontier.length > 0 && guard < 12) {
      guard += 1;
      chain.push(frontier.join(' | '));
      const next = [];
      for (const p of direct.concat(frontier)) {
        const node = wf.nodes.find((x) => x.name === p);
        if (!node) continue;
        const type = String(node.type || '');
        if (type.includes('.code')) {
          if (codeHasCreds(node)) {
            found = true;
            chain.push('  (creds resolved in: ' + p + ')');
          } else {
            chain.push('  (Code node WITHOUT creds: ' + p + ')');
          }
          continue;
        }
        if (type.includes('httpRequest') || type.includes('.emailSend')) {
          chain.push('  (field-dropping node in chain: ' + p + ')');
          next.push(...preds(wf, p));
        } else if (type.includes('.if') || type.includes('.noOp') || type.includes('.switch')) {
          next.push(...preds(wf, p));
        } else if (type.includes('.set')) {
          // Set nodes can keep or drop fields; check its keepOtherFields
          const keep = (node.parameters || {}).includeOtherFields;
          chain.push('  (Set node keepOtherFields=' + keep + ': ' + p + ')');
          if (keep) next.push(...preds(wf, p));
        } else {
          chain.push('  (node: ' + p + ' ' + type.split('.').pop() + ')');
          next.push(...preds(wf, p));
        }
      }
      frontier = [...new Set(next)];
    }
    for (const c of chain) console.log('    ' + c);
    if (!found) {
      problems += 1;
      console.log('    => NO credential source found for ' + tg.name);
    }
  }
}
console.log(problems === 0 ? '\nall Telegram nodes have a credential source' : '\n' + problems + ' Telegram node(s) without a credential source');
