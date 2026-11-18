import http from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFileSync, statSync } from 'node:fs';
import { createHash, timingSafeEqual } from 'node:crypto';
const [file, bridge, requestedPort] = process.argv.slice(2);
if (!file || !bridge) throw new Error('Provide a private desktop-view connection file and the Windows bridge script path.');
if (process.platform !== 'win32' && (statSync(file).mode & 0o077)) throw new Error('Private connection files must be owner-only.');
const connection = JSON.parse(readFileSync(file, 'utf8'));
if (typeof connection.token !== 'string' || connection.token.length < 32) throw new Error('A dedicated desktop-view credential is required.');
const digest = value => createHash('sha256').update(value).digest(), expected = digest(connection.token);
const port = Number(requestedPort || 8760), pending = new Map(); let sequence = 0, closed = false;
const processBridge = spawn('powershell.exe', ['-NoProfile', '-File', bridge], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
processBridge.stderr.resume();
const lines = createInterface({ input: processBridge.stdout });
function fail() { closed = true; for (const item of pending.values()) { clearTimeout(item.timer); item.resolve({ status: 502, body: { message: 'The local desktop view bridge disconnected.' } }); } pending.clear(); }
lines.on('line', line => {
  if (line.length > 8_000_000) { fail(); processBridge.kill(); return; }
  let value; try { value = JSON.parse(line); } catch { return; }
  const item = pending.get(value.id); if (!item) return;
  clearTimeout(item.timer); pending.delete(value.id); item.resolve(value);
});
processBridge.on('error', fail); processBridge.on('exit', fail); processBridge.stdin.on('error', fail);
function forward(path) {
  if (closed || pending.size >= 4) return Promise.resolve({ status: 503, body: { message: 'The desktop bridge is unavailable or busy.' } });
  return new Promise(resolve => { const id = ++sequence, timer = setTimeout(() => { pending.delete(id); resolve({ status: 504, body: { message: 'The desktop view request timed out.' } }); }, 12000); pending.set(id, { resolve, timer }); processBridge.stdin.write(JSON.stringify({ id, path, credentialFingerprint: expected.toString('hex') }) + '\n'); });
}
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (status, body) => { if (!res.destroyed) { res.writeHead(status); res.end(JSON.stringify(body)); } };
  const origin = req.headers.origin;
  if (origin && !['capacitor://localhost', 'http://localhost', 'https://localhost'].includes(origin)) { send(403, { message: 'Client origin is not allowed.' }); return; }
  if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Headers', 'Authorization'); res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS'); res.writeHead(204); res.end(); return; }
  if (req.method !== 'GET') { send(405, { message: 'This host is view-only.' }); return; }
  if (req.url.length > 1024 || !/^\/(health|v1\/(desktop|frame))(\?[a-zA-Z0-9%=&._-]*)?$/.test(req.url)) { send(404, { message: 'View-only route not found.' }); return; }
  if (req.url !== '/health') {
    const token = req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1];
    if (!token || !timingSafeEqual(expected, digest(token))) { send(401, { message: 'A separate desktop-view device credential is required.' }); return; }
  }
  try { const response = await forward(req.url); send(response.status, response.body); } catch { send(502, { message: 'Local desktop viewing is unavailable.' }); }
});
server.requestTimeout = 15000; server.headersTimeout = 10000;
server.listen(port, '127.0.0.1', () => console.log(`STATION view-only desktop relay listening on http://127.0.0.1:${port}`));
function stop() { server.close(); processBridge.stdin.end(); processBridge.kill(); lines.close(); fail(); }
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stop(); setTimeout(() => process.exit(0), 1000).unref(); });
