#!/usr/bin/env node
// Sirve la carpeta de la skill para ver una escena interactiva en el navegador:
//   node servir.mjs [puerto=5199]   →   http://127.0.0.1:5199/ejemplos/golfista/golfista.html
// ("/_hgl/..." apunta a scripts/, como en render.mjs.)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.mp4': 'video/mp4' };
const port = Number(process.argv[2] || 5199);
http.createServer((rq, rs) => {
  const url = decodeURIComponent(rq.url.split('?')[0]);
  const [base, rel] = url.startsWith('/_hgl/') ? [HERE, url.slice(6)] : [ROOT, url.slice(1)];
  const file = path.resolve(base, rel);
  if (!file.startsWith(base) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { rs.writeHead(404); rs.end('no encontrado'); return; }
  rs.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(rs);
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/ejemplos/golfista/golfista.html`));
