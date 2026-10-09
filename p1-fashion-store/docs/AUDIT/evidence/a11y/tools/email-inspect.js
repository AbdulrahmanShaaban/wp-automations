#!/usr/bin/env node
/**
 * Read-only inspection of the WooCommerce Arabic mail log (nilad_mail_log)
 * captured by nilad-core. Extracts subjects/bodies for the arabic-rtl email
 * checklist item. Writes email-inspect.json
 * Usage: node docs/AUDIT/evidence/a11y/tools/email-inspect.js
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..');
const CONTAINER = 'wp-env-p1-fashion-store-ec0ecbd6-cli-1';

const raw = execFileSync('docker', ['exec', CONTAINER, 'wp', 'option', 'get', 'nilad_mail_log', '--format=json'], {
  encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
});
const log = JSON.parse(raw);

const ar = /[\u0600-\u06FF]/;
const digitsLat = (s) => (s.match(/[0-9]/g) || []).length;
const digitsEast = (s) => (s.match(/[\u0660-\u0669]/g) || []).length;

const summarize = (e, i) => {
  const body = String(e.message || '');
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return {
    i,
    ts: e.ts,
    to: e.to,
    from: e.from,
    subject: e.subject,
    subjectArabic: ar.test(e.subject),
    bodyChars: body.length,
    bodyPreview: lines.slice(0, 18).join(' | ').slice(0, 700),
    latinDigits: digitsLat(body),
    easternDigits: digitsEast(body),
    hasPhoneExample: /01[0125][0-9]{8}|\+20/.test(body),
    currencyHits: (body.match(/ج\.م|EGP|E£/g) || []).length,
    englishWords: (body.match(/\b[A-Za-z]{3,}\b/g) || []).slice(0, 14),
    dirMarkers: /dir=|rtl|ltr/.test(body),
  };
};

const out = {
  generatedAt: new Date().toISOString(),
  source: 'wp option get nilad_mail_log (read-only)',
  count: log.length,
  subjects: log.map((e) => e.subject),
  uniqueSubjects: [...new Set(log.map((e) => e.subject))],
  samples: [log[log.length - 1], log[log.length - 2], log[0]].filter(Boolean).map(summarize),
  digitPolicy: {
    latinTotal: log.reduce((s, e) => s + digitsLat(String(e.message || '')), 0),
    easternTotal: log.reduce((s, e) => s + digitsEast(String(e.message || '')), 0),
  },
};

fs.writeFileSync(path.join(OUT, 'email-inspect.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ count: out.count, uniqueSubjects: out.uniqueSubjects, digitPolicy: out.digitPolicy, samples: out.samples.map((s) => ({ to: s.to, subject: s.subject, preview: s.bodyPreview.slice(0, 300), phone: s.hasPhoneExample, currency: s.currencyHits, latin: s.latinDigits, eastern: s.easternDigits })) }, null, 1));
