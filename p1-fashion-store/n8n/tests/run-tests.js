#!/usr/bin/env node
/**
 * run-tests.js — sample-payload tests for the Order Ops Suite.
 *
 * Runs the ACTUAL jsCode embedded in n8n/workflows/*.json through shims
 * (no n8n instance needed): happy / duplicate / missing-field / bad-signature
 * per OPENCODE_MASTER_BRIEF P2 acceptance.
 *
 * Flow-specific cases live in tests/cases/*.cases.js and are auto-loaded.
 *
 * Usage: node n8n/tests/run-tests.js   (exit 0 = all pass)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { SECRET, ENV_OK, ORDER, loadWorkflow, findCodeNode, runCode, webhookItem } = require('./helpers');

let passed = 0;
let failed = 0;
const failures = [];

function ok(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (err) {
    failed++;
    failures.push(`${name}: ${err.message}`);
    console.log(`FAIL ${name} — ${err.message}`);
  }
}

const ctx = { ok, assert, SECRET, ENV_OK, ORDER, loadWorkflow, findCodeNode, runCode, webhookItem };

// ---------------------------------------------------------------- F1
const f1 = loadWorkflow('f1-new-order-alert.json');

ok('f1-structure: required keys + settings', () => {
  assert.ok(f1.name && Array.isArray(f1.nodes) && f1.connections && f1.settings);
  assert.strictEqual(f1.settings.executionOrder, 'v1');
  assert.strictEqual(f1.settings.timezone, 'Africa/Cairo');
  const names = new Set(f1.nodes.map((n) => n.name));
  for (const [src, outs] of Object.entries(f1.connections)) {
    assert.ok(names.has(src), `connection source missing: ${src}`);
    for (const branch of outs.main) for (const c of branch || []) {
      assert.ok(names.has(c.node), `connection target missing: ${c.node}`);
    }
  }
  // The Sheet tab must be selected by numeric gid, not by name: a localized tab
  // name ("الصفحة1") cannot be typed reliably into an env var (CONVENTIONS).
  const sheets = f1.nodes.find((n) => String(n.type).includes('googleSheets'));
  assert.ok(sheets, 'F1 must have a Google Sheets node');
  assert.strictEqual(sheets.parameters.sheetName.mode, 'id', 'sheet tab must be selected by gid');
  assert.ok(
    String(sheets.parameters.sheetName.value).includes('GOOGLE_SHEET_GID'),
    'sheet tab must come from $env.GOOGLE_SHEET_GID'
  );
  assert.strictEqual(sheets.parameters.documentId.mode, 'id', 'document must be selected by id');
  // The Sheets node must sit behind the SHEETS_ENABLED gate: without a connected
  // Google credential the node fails, and a failed node would mark a perfectly good
  // order alert (and its Telegram branch) as a failed execution.
  const gate = f1.nodes.find((n) => n.name === 'Sheet log enabled?');
  assert.ok(gate, 'F1 must gate the Sheets node behind "Sheet log enabled?"');
  assert.strictEqual(gate.type, 'n8n-nodes-base.if');
  assert.ok(
    String(gate.parameters.conditions.conditions[0].leftValue).includes('SHEETS_ENABLED'),
    'the gate must read $env.SHEETS_ENABLED'
  );
  const fmtOut = f1.connections['Format owner message + row'].main[0].map((c) => c.node);
  assert.ok(fmtOut.includes('Telegram → owner'), 'Telegram must still receive the message directly');
  assert.ok(fmtOut.includes('Sheet log enabled?'), 'the gate must receive the same item as Telegram');
  const gateOut = f1.connections['Sheet log enabled?'].main;
  assert.strictEqual(gateOut[0][0].node, 'Google Sheets → order log', 'gate true → Sheets');
  assert.strictEqual(gateOut[1][0].node, 'Sheet log skipped', 'gate false → skip (NoOp)');
});

const verify = findCodeNode(f1, 'Verify HMAC + validate');

ok('f1-happy: valid signature → ok, order fields, phone normalized', () => {
  const sd = {};
  const [out] = runCode(verify, [webhookItem(rawHappy())], { sd });
  assert.strictEqual(out.json.ok, true, out.json.reason);
  assert.strictEqual(out.json.reason, 'valid');
  assert.strictEqual(out.json.duplicate, false);
  assert.strictEqual(out.json.orderId, 50);
  assert.strictEqual(out.json.total, 1310);
  assert.strictEqual(out.json.city, 'القاهرة');
  assert.strictEqual(out.json.phone, '+201012345678');
  assert.strictEqual(out.json.phoneValid, true);
  assert.strictEqual(out.json.status, 'processing');
  assert.strictEqual(out.json.paymentMethod, 'الدفع عند الاستلام');
  assert.ok(out.json.itemsText.includes('عباية كتان مطرّزة'));
  assert.strictEqual(out.json.customerName, 'منى أحمد');
});

ok('f1-bad-signature: tampered secret rejected (fail-closed)', () => {
  const crypto = require('crypto');
  const bad = crypto.createHmac('sha256', 'wrong-secret').update(rawHappy()).digest('base64');
  const [out] = runCode(verify, [webhookItem(rawHappy(), { signature: bad })], { sd: {} });
  assert.strictEqual(out.json.ok, false);
  assert.strictEqual(out.json.reason, 'bad-signature');
});

ok('f1-missing-signature-header: rejected', () => {
  const [out] = runCode(verify, [webhookItem(rawHappy(), { omitSig: true })], { sd: {} });
  assert.strictEqual(out.json.ok, false);
  assert.strictEqual(out.json.reason, 'missing-signature-header');
});

ok('f1-missing-raw-body: rejected (Raw Body off is a misconfig)', () => {
  const [out] = runCode(verify, [webhookItem(rawHappy(), { omitRaw: true })], { sd: {} });
  assert.strictEqual(out.json.ok, false);
  assert.strictEqual(out.json.reason, 'no-raw-body: enable Raw Body on the Webhook node');
});

ok('f1-missing-field: valid signature but no order id → rejected', () => {
  const noId = { ...ORDER };
  delete noId.id;
  const [out] = runCode(verify, [webhookItem(JSON.stringify(noId))], { sd: {} });
  assert.strictEqual(out.json.ok, false);
  assert.strictEqual(out.json.reason, 'missing-order-id');
});

ok('f1-missing-field: no phone → advisory only (order still ok)', () => {
  const noPhone = JSON.parse(rawHappy());
  delete noPhone.billing.phone;
  const [out] = runCode(verify, [webhookItem(JSON.stringify(noPhone))], { sd: {} });
  assert.strictEqual(out.json.ok, true, out.json.reason);
  assert.strictEqual(out.json.phone, '');
  assert.strictEqual(out.json.phoneValid, false);
});

ok('f1-duplicate: same order id on second delivery → duplicate=true', () => {
  const sd = {};
  const [first] = runCode(verify, [webhookItem(rawHappy())], { sd });
  assert.strictEqual(first.json.duplicate, false);
  sd.processed = ['f1:50'];
  const [second] = runCode(verify, [webhookItem(rawHappy())], { sd });
  assert.strictEqual(second.json.ok, true);
  assert.strictEqual(second.json.duplicate, true);
});

ok('f1-phone-variants: +20 / 0020 / spaces normalize, garbage fails', () => {
  const cases = [
    ['+201012345678', '+201012345678', true],
    ['00201123456789', '+201123456789', true],
    ['010 123 45678', '+201012345678', true],
    ['0155512345678', '0155512345678', false],
    ['12345', '12345', false],
  ];
  for (const [input, wantPhone, wantValid] of cases) {
    const order = JSON.parse(rawHappy());
    order.billing.phone = input;
    const [out] = runCode(verify, [webhookItem(JSON.stringify(order))], { sd: {} });
    assert.strictEqual(out.json.phone, wantPhone, `phone(${input})`);
    assert.strictEqual(out.json.phoneValid, wantValid, `valid(${input})`);
    assert.strictEqual(out.json.ok, true);
  }
});

const mark = findCodeNode(f1, 'Mark processed');
ok('f1-mark-processed: writes idempotency key, passes data through', () => {
  const sd = {};
  const [out] = runCode(mark, [{ json: { orderId: 50, total: 1310 } }], { sd });
  assert.deepStrictEqual(sd.processed, ['f1:50']);
  assert.strictEqual(out.json.orderId, 50);
  runCode(mark, [{ json: { orderId: 50 } }], { sd });
  assert.deepStrictEqual(sd.processed, ['f1:50']);
});

const fmt = findCodeNode(f1, 'Format owner message + row');
ok('f1-format: Arabic tgText, HTML-escaped, sheet row fields only', () => {
  const input = {
    json: {
      orderId: 50,
      total: 1310,
      city: 'القاهرة',
      phone: '+201012345678',
      phoneValid: true,
      status: 'processing',
      createdAt: '2026-10-03T05:12:00',
      paymentMethod: 'الدفع عند الاستلام',
      customerName: 'منى <script>أحمد</script>',
      itemsText: 'عباية كتان مطرّزة ×1',
    },
  };
  const [out] = runCode(fmt, [input], { sd: {} });
  const { tgText, tgToken, tgChatId, ...row } = out.json;
  assert.ok(tgText.includes('طلب جديد #50'), 'order id in message');
  assert.ok(tgText.includes('+201012345678'), 'phone in message');
  assert.ok(tgText.includes('1310 ج.م'), 'total in message');
  assert.ok(tgText.includes('&lt;script&gt;'), 'HTML escaped');
  assert.ok(!tgText.includes('<script>'), 'no raw script tag');
  // n8n 2.41 blocks $env in node expressions, so the Format node hands the Telegram
  // HTTP node its credentials through the item (read as {{$json.tgToken}}).
  assert.ok(typeof tgToken === 'string', 'tgToken is present for the HTTP node');
  assert.ok(typeof tgChatId === 'string' || tgChatId === 0, 'tgChatId is present for the HTTP node');
  assert.deepStrictEqual(Object.keys(row).sort(), ['city', 'createdAt', 'orderId', 'phone', 'status', 'total']);
  assert.strictEqual(row.total, 1310);
});

function rawHappy() {
  return JSON.stringify(ORDER);
}

// --------------------------------------------------- flow-specific cases
const casesDir = path.join(__dirname, 'cases');
if (fs.existsSync(casesDir)) {
  for (const f of fs.readdirSync(casesDir).filter((n) => n.endsWith('.cases.js')).sort()) {
    require(path.join(casesDir, f))(ctx);
  }
}

// ------------------------------------------------- cross-flow static checks
ok('all-workflows: unique names, settings, valid connection endpoints, secret hygiene', () => {
  const files = fs.readdirSync(path.join(__dirname, '..', 'workflows')).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 8, `expected >=8 workflow json, found ${files.length}`);
  for (const f of files) {
    const wf = loadWorkflow(f);
    assert.ok(wf.name && Array.isArray(wf.nodes) && wf.connections && wf.settings, f);
    assert.strictEqual(wf.settings.executionOrder, 'v1', f);
    const names = wf.nodes.map((n) => n.name);
    assert.strictEqual(new Set(names).size, names.length, `${f}: duplicate node names`);
    for (const [src, outs] of Object.entries(wf.connections)) {
      assert.ok(names.includes(src), `${f}: missing source ${src}`);
      for (const branch of outs.main) for (const c of branch || []) {
        assert.ok(names.includes(c.node), `${f}: missing target ${c.node}`);
      }
    }
    const blob = JSON.stringify(wf.nodes);
    assert.ok(!/bot\d{8,}:/.test(blob), `${f}: literal telegram token`);
    assert.ok(!/AIza[0-9A-Za-z_-]{20,}/.test(blob), `${f}: literal google key`);
  }
});

// ---------------------------------------------------------------- summary
console.log(`\n=== n8n sample-payload tests: ${passed} passed, ${failed} failed ===`);
if (failed) {
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
process.exit(0);
