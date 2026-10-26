'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('./desktop/source.cjs');
const client = createClient();
const files = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/i18n.js': ['i18n.js', 'text/javascript'], '/cinema.css': ['cinema.css', 'text/css'], '/layar.ico': ['layar.ico', 'image/x-icon'] };
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    if (url.pathname === '/api/source') {
      const data = await client(url.searchParams.get('resource'));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); return;
    }
    const file = files[url.pathname];
    if (!file) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': file[1] + '; charset=utf-8' });
    fs.createReadStream(path.join(__dirname, file[0])).pipe(res);
  } catch (error) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
}).listen(5173, '127.0.0.1', () => console.log('Layar: http://127.0.0.1:5173'));
