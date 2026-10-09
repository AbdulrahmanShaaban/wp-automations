// dump-schema.js — print the columns of n8n's execution tables.
//   docker run --rm -v nilad-n8n-data:/data -v "$PWD/scripts:/scripts:ro" \
//     --entrypoint sh n8nio/n8n:latest -c "cp /data/database.sqlite /tmp/d.sqlite; \
//     cp /data/database.sqlite-wal /tmp/d.sqlite-wal 2>/dev/null; \
//     cp /data/database.sqlite-shm /tmp/d.sqlite-shm 2>/dev/null; \
//     node /scripts/dump-schema.js"
'use strict';

const fs = require('fs');
const sqlite3 = require('/usr/local/lib/node_modules/n8n/node_modules/sqlite3');

fs.copyFileSync('/data/database.sqlite', '/tmp/d.sqlite');

const db = new sqlite3.Database('/tmp/d.sqlite', sqlite3.OPEN_READONLY);
for (const table of ['execution_entity', 'execution_metadata', 'execution_data']) {
  db.all('PRAGMA table_info(' + table + ')', (err, rows) => {
    if (err) {
      console.log(table + ': ' + err.message);
      return;
    }
    console.log(table + ': ' + (rows || []).map((r) => r.name).join(', '));
  });
}
setTimeout(() => {
  db.close();
}, 1500);
