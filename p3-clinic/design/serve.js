// serve.js — tiny static server for reviewing the design previews.
//   node design/serve.js [port]        (default 4321)
// Then open http://localhost:4321/ — it lists the three directions side by side.
// No dependencies: the design gate must work before anything is installed.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = parseInt(process.argv[2] || '4321', 10);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const rel = urlPath === '/' ? '/index.html' : urlPath;
    const file = path.join(ROOT, path.normalize(rel).replace(/^([/\\])+/, ''));

    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 ' + rel);
        return;
      }
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(data);
    });
  })
  .listen(PORT, () => {
    console.log('design previews on http://localhost:' + PORT + '/');
    console.log('  A: http://localhost:' + PORT + '/preview-a.html');
    console.log('  B: http://localhost:' + PORT + '/preview-b.html');
    console.log('  C: http://localhost:' + PORT + '/preview-c.html');
  });
