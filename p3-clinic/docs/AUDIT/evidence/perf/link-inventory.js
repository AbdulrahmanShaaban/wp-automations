// link-inventory.js — READ-ONLY audit helper (docs/AUDIT/evidence/perf only).
// Anchor + id inventory per saved page: internal links, hash anchors, id targets.
// Usage: node link-inventory.js
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const IDS = ['home', 'services', 'team', 'contact', 'book'];
const out = { generatedAt: new Date().toISOString(), pages: {} };
for (const id of IDS) {
  const h = fs.readFileSync(path.join(OUT, 'html-' + id + '.html'), 'utf8');
  const docIds = [...new Set([...h.matchAll(/\sid=["']([^"']+)["']/g)].map((m) => m[1]))];
  const anchors = [...h.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((m) => ({
    attrs: m[1].replace(/\s+/g, ' ').trim().slice(0, 180),
    href: (m[1].match(/href=["']([^"']*)["']/i) || [])[1] || null,
    text: m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 60),
  }));
  const hash = anchors.filter((a) => a.href && a.href.startsWith('#')).map((a) => a.href);
  const internal = anchors.filter((a) => a.href && (a.href.startsWith('/') || a.href.startsWith('http://localhost:8889'))).map((a) => a.href);
  const external = anchors.filter((a) => a.href && /^https?:\/\//.test(a.href) && !a.href.startsWith('http://localhost:8889')).map((a) => a.href);
  out.pages[id] = {
    idCount: docIds.length,
    ids: docIds,
    anchorCount: anchors.length,
    hashAnchors: [...new Set(hash)],
    brokenHash: [...new Set(hash)].filter((x) => !docIds.includes(x.slice(1))),
    internalLinks: [...new Set(internal)],
    externalLinks: [...new Set(external)],
    emptyTextLinks: anchors.filter((a) => !a.text).map((a) => a.href),
  };
  console.log('==', id, 'ids=' + docIds.length, 'anchors=' + anchors.length,
    'internal=' + out.pages[id].internalLinks.length, 'hash=' + JSON.stringify(out.pages[id].hashAnchors),
    'broken=' + JSON.stringify(out.pages[id].brokenHash),
    'external=' + JSON.stringify(out.pages[id].externalLinks),
    'emptyText=' + JSON.stringify(out.pages[id].emptyTextLinks));
}
fs.writeFileSync(path.join(OUT, 'link-inventory.json'), JSON.stringify(out, null, 2));
console.log('done -> link-inventory.json');
