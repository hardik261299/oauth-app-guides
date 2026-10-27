// Local dev server: serves /public and routes /api/* to the same handlers Vercel uses.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

if (existsSync(path.join(root, '.env'))) {
  for (const line of readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && m[2] && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    if (pathname.startsWith('/api/')) {
      const name = pathname.slice(5).replace(/[^a-z]/g, '');
      const file = path.join(root, 'api', `${name}.js`);
      if (!existsSync(file)) { res.statusCode = 404; return res.end('Not found'); }
      const mod = await import(`file://${file.replace(/\\/g, '/')}`);
      return await mod.default(req, res);
    }
    let rel = pathname === '/' ? '/index.html' : pathname;
    if (!path.extname(rel)) rel += '.html';
    const file = path.join(root, 'public', path.normalize(rel));
    if (!file.startsWith(path.join(root, 'public'))) { res.statusCode = 403; return res.end(); }
    res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch (err) {
    if (err.code === 'ENOENT') { res.statusCode = 404; return res.end('Not found'); }
    console.error(err);
    res.statusCode = 500;
    res.end('Server error');
  }
}).listen(process.env.PORT || 3000, () => console.log(`http://localhost:${process.env.PORT || 3000}`));
