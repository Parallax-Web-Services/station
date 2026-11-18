// Real-host smoke check. Frames stay in memory and no credentials or host IDs are printed.
import { readFileSync, statSync } from 'node:fs';
import { isIP } from 'node:net';

const [file, override] = process.argv.slice(2);
if (!file) throw new Error('Provide a private desktop-view connection file; optionally a loopback origin override.');
if (process.platform !== 'win32' && (statSync(file).mode & 0o077)) throw new Error('Connection file must be owner-only.');
const connection = JSON.parse(readFileSync(file, 'utf8'));
const origin = new URL(override || connection.origin);
const host = origin.hostname.replace(/^\[|\]$/g, '');
if (origin.protocol !== 'http:' || !(host === 'localhost' || host === '::1' || (isIP(host) === 4 && host.startsWith('127.'))) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('This checker only accepts a loopback HTTP origin.');
if (typeof connection.token !== 'string' || connection.token.length < 32) throw new Error('A dedicated desktop-view credential is required.');
const headers = { Authorization: `Bearer ${connection.token}` };
async function request(path, options = {}, expected = 200) {
  const response = await fetch(new URL(path, origin), { headers, ...options, signal: AbortSignal.timeout(15000) });
  if (response.status !== expected) throw new Error(`Desktop check expected HTTP ${expected}, received ${response.status}.`);
  if (expected !== 200) { await response.arrayBuffer(); return; }
  return response.json();
}
const inventory = await request('/v1/desktop');
if (!inventory.hostId || !inventory.layoutRevision || !inventory.viewOnly || inventory.capabilities?.control !== false || inventory.capabilities?.unattended !== false || !Array.isArray(inventory.monitors) || !inventory.monitors.length) throw new Error('Invalid view-only inventory.');
const identities = new Set();
for (const monitor of inventory.monitors) {
  if (!monitor.id || identities.has(monitor.id)) throw new Error('Missing or duplicate monitor identity.');
  identities.add(monitor.id);
  const query = new URLSearchParams({ monitorId: monitor.id, revision: inventory.layoutRevision, maxWidth: '640' });
  const frame = await request(`/v1/frame?${query}`);
  if (frame.hostId !== inventory.hostId || frame.monitorId !== monitor.id || frame.layoutRevision !== inventory.layoutRevision || !frame.viewOnly || !(frame.width > 0 && frame.width <= 640 && frame.height > 0) || !['x', 'y', 'width', 'height'].every(key => frame.physicalBounds?.[key] === monitor.bounds?.[key]) || !frame.image?.startsWith('data:image/jpeg;base64,')) throw new Error('Frame does not match the selected host, monitor or layout.');
  const jpeg = Buffer.from(frame.image.slice('data:image/jpeg;base64,'.length), 'base64');
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8 || jpeg.at(-2) !== 0xff || jpeg.at(-1) !== 0xd9) throw new Error('Invalid JPEG frame.');
  console.log(`Selected-monitor JPEG passed: ${frame.width}×${frame.height}, scale ${monitor.scale}.`);
}
await request('/v1/desktop', { headers: {} }, 401);
await request('/v1/desktop', { headers: { Authorization: 'Bearer invalid-device-credential-value-000000' } }, 401);
await request('/v1/desktop', { headers: { ...headers, Origin: 'https://example.invalid' } }, 403);
await request('/v1/desktop', { method: 'POST' }, 405);
await request('/v1/frame?' + new URLSearchParams({ monitorId: inventory.monitors[0].id, revision: 'stale-layout' }), {}, 409);
await request('/v1/frame?' + new URLSearchParams({ monitorId: 'missing-monitor', revision: inventory.layoutRevision }), {}, 404);
console.log('Desktop transport, frame identity, authentication, origin and view-only checks passed.');
