// probe-f1-webhook.js — POST a correctly-HMAC-signed order.created payload straight at
// n8n's F1 webhook, bypassing WooCommerce, to isolate each hop:
//
//   node scripts/probe-f1-webhook.js                 → default URL
//   N8N_WEBHOOK_URL=http://host:port/webhook/x node scripts/probe-f1-webhook.js
//
// Uses the real WOO_WEBHOOK_SECRET from n8n/.env and prints n8n's HTTP response
// plus the resulting execution status. Secrets are never printed.
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ENV_PATH = path.join(__dirname, '..', 'n8n', '.env');
function env() {
  const out = {};
  for (const raw of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i === -1) continue;
    out[line.slice(0, i)] = line.slice(i + 1).trim();
  }
  return out;
}

async function main() {
  const E = env();
  const url = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/woo-order-created';
  const payload = {
    id: 9001,
    status: 'processing',
    total: '1310.00',
    currency: 'EGP',
    date_created: '2026-10-04T12:00:00',
    payment_method: 'cod',
    billing: {
      first_name: 'سارة',
      last_name: 'محمود',
      email: 'sara.mahmoud@example.com',
      phone: '01099887766',
      city: 'الجيزة',
      state: 'EGGZ',
      address_1: '8 شارع الهرم',
    },
    line_items: [
      { id: 1, name: 'عباية كتان مطرّزة', product_id: 38, quantity: 1, total: '1250.00' },
    ],
  };
  const body = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', E.WOO_WEBHOOK_SECRET).update(body).digest('base64');

  console.log('POST ' + url);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-WC-Webhook-Signature': sig,
      'X-WC-Webhook-Topic': 'order.created',
      'X-WC-Webhook-ID': '1',
    },
    body,
  });
  console.log('n8n HTTP ' + res.status + ' — ' + (await res.text()).slice(0, 200));

  // bad signature control: must be rejected (Stop And Error → error workflow)
  const bad = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-WC-Webhook-Signature': crypto.createHmac('sha256', 'wrong-secret').update(body).digest('base64'),
      'X-WC-Webhook-Topic': 'order.created',
      'X-WC-Webhook-ID': '2',
    },
    body,
  });
  console.log('n8n HTTP (bad signature) ' + bad.status);
}

main().catch((err) => {
  console.error('probe failed: ' + err.message);
  process.exitCode = 1;
});
