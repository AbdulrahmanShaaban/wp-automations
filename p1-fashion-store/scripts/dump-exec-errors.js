// dump-exec-errors.js — read n8n's SQLite and print the node-level error of the latest
// executions. Runs inside a one-shot n8n container (has the sqlite3 driver).
// The error lives in execution_entity.data (resultData.error / runData[*].error);
// execution_metadata is usually empty for failed runs.
//
//   docker run --rm -v nilad-n8n-data:/data -v "$PWD/scripts:/scripts:ro" \
//     --entrypoint sh n8nio/n8n:latest -c "cp /data/database.sqlite /tmp/d.sqlite; \
//     cp /data/database.sqlite-wal /tmp/d.sqlite-wal 2>/dev/null; \
//     cp /data/database.sqlite-shm /tmp/d.sqlite-shm 2>/dev/null; \
//     node /scripts/dump-exec-errors.js 4"
'use strict';

const fs = require('fs');
const sqlite3 = require('/usr/local/lib/node_modules/n8n/node_modules/sqlite3');

fs.copyFileSync('/data/database.sqlite', '/tmp/d.sqlite');

const db = new sqlite3.Database('/tmp/d.sqlite', sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('open failed: ' + err.message);
    process.exitCode = 1;
  }
});

db.all(
  'SELECT e.id, e.mode, e.status, d.data AS data FROM execution_entity e ' +
    'LEFT JOIN execution_data d ON d.executionId = e.id ' +
    'ORDER BY CAST(e.id AS INTEGER) DESC LIMIT ?',
  [Number(process.argv[2] || 4)],
  (err, rows) => {
    if (err) {
      console.error('query failed: ' + err.message);
      process.exitCode = 1;
      return;
    }
    for (const r of rows) {
      console.log(`exec #${r.id} mode=${r.mode} status=${r.status}`);
      if (!r.data) {
        console.log('  (no execution_data row)');
        continue;
      }
      let j = null;
      try {
        // n8n 2.x stores execution data as "flatted" JSON (index references), not a
        // plain object — parsing it with JSON.parse gives an array of strings.
        const flatted = require('/usr/local/lib/node_modules/n8n/node_modules/flatted');
        j = flatted.parse(r.data);
      } catch (e) {
        console.log('  (parse failed: ' + e.message + ')');
        continue;
      }
      const rd = j.resultData || {};
      if (rd.lastNodeExecuted) console.log('  lastNodeExecuted: ' + rd.lastNodeExecuted);
      if (rd.error) {
        console.log('  ERROR: ' + (rd.error.message || 'unknown'));
        if (rd.error.node) console.log('  node: ' + (rd.error.node.name || JSON.stringify(rd.error.node)));
        if (rd.error.description) {
          console.log('  desc: ' + String(rd.error.description).replace(/\s+/g, ' ').slice(0, 400));
        }
        if (rd.error.stack) {
          console.log('  stack: ' + String(rd.error.stack).replace(/\s+/g, ' ').slice(0, 300));
        }
      } else {
        console.log('  (resultData.error empty — dumping node errors from runData)');
      }
      for (const [name, runs] of Object.entries(rd.runData || {})) {
        for (const run of runs) {
          if (run && run.error) {
            console.log('  node "' + name + '" -> ' + (run.error.message || 'error'));
            if (run.error.description) {
              console.log('     desc: ' + String(run.error.description).replace(/\s+/g, ' ').slice(0, 400));
            }
          }
        }
      }
    }
    console.log('done');
    db.close();
  }
);
