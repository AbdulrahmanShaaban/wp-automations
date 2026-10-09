#!/usr/bin/env node
/**
 * helpers.js — shared shims for the n8n sample-payload tests.
 * Tests execute the ACTUAL jsCode embedded in workflow JSONs.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

const SECRET = 'test-secret-do-not-use-prod';
const WF_DIR = path.join(__dirname, '..', 'workflows');
const ENV_OK = {
  WOO_WEBHOOK_SECRET: SECRET,
  TELEGRAM_BOT_TOKEN: 'fake-token',
  TELEGRAM_CHAT_ID: '12345',
  GOOGLE_SHEET_ID: 'sheet-id',
  GOOGLE_SHEET_TAB: 'Orders',
  STORE_URL: 'http://localhost:8888',
  WC_API_KEY: 'ck_test',
  WC_API_SECRET: 'cs_test',
  PENDING_HOURS: '48',
  LOW_STOCK_QTY: '5',
  REVIEW_AFTER_DAYS: '5',
};

const ORDER = {
  id: 50,
  status: 'processing',
  total: '1310.00',
  date_created: '2026-10-03T05:12:00',
  payment_method: 'cod',
  payment_method_title: 'الدفع عند الاستلام',
  billing: { first_name: 'منى', last_name: 'أحمد', phone: '01012345678', city: 'القاهرة', email: 'qa@nilad.test' },
  shipping: { first_name: 'منى', last_name: 'أحمد', city: 'القاهرة' },
  line_items: [{ name: 'عباية كتان مطرّزة', quantity: 1, product_id: 38, total: '1250.00' }],
};

function loadWorkflow(file) {
  return JSON.parse(fs.readFileSync(path.join(WF_DIR, file), 'utf8'));
}

function findCodeNode(wf, nodeName) {
  const node = wf.nodes.find((n) => n.name === nodeName && n.type === 'n8n-nodes-base.code');
  if (!node) throw new Error(`code node not found: ${nodeName} in ${wf.name}`);
  return node;
}

/** Execute a Code node's jsCode the way n8n would, through shims. */
function runCode(node, items, { env = ENV_OK, sd = {} } = {}) {
  const $input = {
    first: () => items[0],
    all: () => items,
    item: () => items[0],
  };
  const $getWorkflowStaticData = () => sd;
  const fn = new Function(
    '$input',
    '$env',
    '$getWorkflowStaticData',
    'require',
    '"use strict";\n' + node.parameters.jsCode
  );
  const out = fn($input, env, $getWorkflowStaticData, require);
  assert.ok(Array.isArray(out) && out.length > 0, 'jsCode must return a non-empty array');
  return out;
}

/** Build a webhook item the way n8n delivers it (Raw Body ON). */
function webhookItem(rawBody, { signature, omitRaw = false, omitSig = false, headers = {} } = {}) {
  const sig =
    signature !== undefined
      ? signature
      : crypto.createHmac('sha256', SECRET).update(rawBody).digest('base64');
  const h = {
    'content-type': 'application/json',
    ...(omitSig ? {} : { 'x-wc-webhook-signature': sig }),
    ...headers,
  };
  const item = { json: { headers: h, params: {}, query: {}, body: JSON.parse(rawBody) } };
  if (!omitRaw) {
    item.binary = {
      data: { data: Buffer.from(rawBody, 'utf8').toString('base64'), mimeType: 'application/json' },
    };
  }
  return item;
}

module.exports = { SECRET, ENV_OK, ORDER, loadWorkflow, findCodeNode, runCode, webhookItem };
