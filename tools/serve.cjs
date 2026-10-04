// Static dev server for site/ plus a screenshot receiver.
//   node tools/serve.js [port]
// POST /__shot/<name>  body = canvas.toDataURL()  -> %TEMP%/brut-shots/<name>.(jpg|png)
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '..', 'site');
const port = +process.argv[2] || 9333;
const shots = path.join(os.tmpdir(), 'brut-shots');
fs.mkdirSync(shots, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'POST' && u.pathname.startsWith('/__shot/')) {
    const name = u.pathname.slice(8).replace(/[^a-zA-Z0-9_.-]/g, '_') || 'shot';
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const m = /^data:image\/(png|jpeg);base64,(.*)$/s.exec(body);
      if (!m) { res.writeHead(400); res.end('bad body'); return; }
      const file = path.join(shots, name + (m[1] === 'png' ? '.png' : '.jpg'));
      fs.writeFileSync(file, Buffer.from(m[2], 'base64'));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, file }));
    });
    return;
  }
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(data);
  });
}).listen(port, '127.0.0.1', () => {
  console.log(`brut dev server http://127.0.0.1:${port}  (shots -> ${shots})`);
});
