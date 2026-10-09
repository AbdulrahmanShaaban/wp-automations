#!/usr/bin/env node
/**
 * n8n-sink.js — local stand-in for the n8n webhook while testing the WP notifier.
 *
 * Verifies exactly what the n8n Code node verifies:
 *   X-Siraj-Timestamp  — unix seconds, skew <= 300s
 *   X-Siraj-Signature  — v1=hex(HMAC-SHA256("<ts>.<rawBody>", secret))
 *
 * Usage:
 *   SIRAJ_N8N_SECRET=<hex> node scripts/n8n-sink.js        # port 9333
 *   SIRAJ_N8N_SECRET=<hex> SINK_PORT=9334 node scripts/n8n-sink.js
 *
 * From the wordpress container reach it at http://host.docker.internal:9333/siraj-sink.
 */
'use strict';
const http = require('http');
const crypto = require('crypto');

const SECRET = process.env.SIRAJ_N8N_SECRET || process.argv[2] || '';
const PORT = Number(process.env.SINK_PORT || 9333);
const SKEW = 300;
const log = (o) => console.log(JSON.stringify(Object.assign({ at: new Date().toISOString() }, o)));

if (!SECRET) {
  console.error('usage: SIRAJ_N8N_SECRET=<hex> node scripts/n8n-sink.js');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || !req.url.startsWith('/siraj-sink')) {
    res.writeHead(404).end();
    return;
  }
  let raw = '';
  req.setEncoding('utf8');
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const ts = String(req.headers['x-siraj-timestamp'] || '');
    const sig = String(req.headers['x-siraj-signature'] || '');
    const skew = Number.isFinite(Number(ts)) ? Math.abs(Math.floor(Date.now() / 1000) - Number(ts)) : null;
    const expected = 'v1=' + crypto.createHmac('sha256', SECRET).update(ts + '.' + raw).digest('hex');
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    const sigOk = skew !== null && skew <= SKEW && a.length === b.length && crypto.timingSafeEqual(a, b);
    let event = null;
    let booking = null;
    let parseOk = false;
    try {
      const p = JSON.parse(raw);
      event = p.event || null;
      booking = p.booking || null;
      parseOk = true;
    } catch (e) { /* keep null */ }
    log({
      signature: sigOk ? 'VALID' : 'INVALID',
      skewSeconds: skew,
      bodyParse: parseOk ? 'ok' : 'not-json',
      event,
      booking,
    });
    res.writeHead(sigOk ? 200 : 401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: sigOk }));
  });
});

server.listen(PORT, '0.0.0.0', () => {
  log({ listening: PORT, path: '/siraj-sink' });
});
