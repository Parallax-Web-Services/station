import http from 'node:http';
import https from 'node:https';
import { timingSafeEqual, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AgentGateway } from './service.mjs';
import { ApprovedBuilds } from './builds.mjs';
import { join } from 'node:path';
const digest = value => createHash('sha256').update(value).digest();
const problem = (status, message) => Object.assign(new Error(message), { status });
export function createGatewayServer({ gateway, token, tls, inspectionToken, inspectionProjects = [], buildToken, buildProjects = [], origins = ['capacitor://localhost', 'http://localhost', 'https://localhost'] }) {
  if (typeof token !== 'string' || token.length < 32) throw new Error('A separate gateway token of at least 32 characters is required.');
  const expected = digest(token);
  if (inspectionToken && (typeof inspectionToken !== 'string' || inspectionToken.length < 32 || inspectionToken === token || !inspectionProjects.length || inspectionProjects.some(id => !gateway.projects.some(project => project.id === id)))) throw new Error('Inspection credentials require a separate token and an explicit configured project allowlist.');
  const inspectionExpected = inspectionToken ? digest(inspectionToken) : null;
  if (buildToken && (typeof buildToken !== 'string' || buildToken.length < 32 || [token, inspectionToken].includes(buildToken) || !buildProjects.length || buildProjects.some(id => !gateway.projects.some(project => project.id === id)))) throw new Error('Build credentials require a separate token and an explicit configured project allowlist.');
  const buildExpected = buildToken ? digest(buildToken) : null;
  const builds = buildToken ? new ApprovedBuilds({ projects: gateway.projects.filter(project => buildProjects.includes(project.id)),
    stateDirectory: join(gateway.directory, 'approved-builds'), command: gateway.command, args: gateway.args, runtimeFactory: gateway.runtimeFactory }) : null;
  const handler = async (req, res) => {
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, body) => { if (!res.destroyed && !res.writableEnded) { res.writeHead(status); res.end(JSON.stringify(body)); } };
    const controller = new AbortController(); res.on('close', () => controller.abort());
    try {
      const origin = req.headers.origin;
      if (origin && !origins.includes(origin)) throw problem(403, 'This client origin is not allowed.');
      if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
      if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.writeHead(204); res.end(); return; }
      const url = new URL(req.url, 'http://localhost'), path = url.pathname;
      if (req.method === 'GET' && path === '/health') { send(200, { name: 'PARALLAX STATION agent gateway', version: 1 }); return; }
      const credential = req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1];
      if (!credential) throw problem(401, 'A valid gateway device credential is required.');
      const supplied = digest(credential), fullAccess = timingSafeEqual(expected, supplied);
      const inspectionAccess = inspectionExpected && timingSafeEqual(inspectionExpected, supplied);
      const buildAccess = buildExpected && timingSafeEqual(buildExpected, supplied);
      if (!fullAccess && !inspectionAccess && !buildAccess) throw problem(401, 'A valid gateway device credential is required.');
      if (!fullAccess && inspectionAccess) {
        const inspection = path.match(/^\/v1\/projects\/([^/]+)\/inspection$/);
        if (req.method !== 'GET' || !inspection || !inspectionProjects.includes(decodeURIComponent(inspection[1]))) throw problem(403, 'This capability permits only the approved repository inspection.');
      }
      if (!fullAccess && buildAccess && !/^\/v1\/builds(?:\/|$)/.test(path)) throw problem(403, 'This capability permits only approved isolated builds.');
      let input = {};
      if (req.method === 'POST') {
        if (!req.headers['content-type']?.startsWith('application/json')) throw problem(415, 'Send application/json.');
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 65536) throw problem(413, 'Request is too large.'); chunks.push(chunk); }
        try { input = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { throw problem(400, 'Invalid JSON.'); }
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw problem(400, 'Send a JSON object.');
      }
      let output;
      if (/^\/v1\/builds(?:\/|$)/.test(path)) {
        if (!builds) throw problem(403, 'No build capability is configured.');
        const match = path.match(/^\/v1\/builds(?:\/([a-f0-9-]{36})(?:\/(resume|interrupt|steer|approvals|questions)(?:\/([a-f0-9-]{36}))?)?)?$/);
        if (!match) throw problem(404, 'Build operation not found.');
        const [, id, action, requestId] = match;
        if (req.method === 'POST' && !id) output = await builds.start(input);
        else if (req.method === 'GET' && id && !action) output = await builds.status(id, url.searchParams.get('diff') === '1');
        else if (req.method === 'POST' && id && ['resume', 'interrupt', 'steer'].includes(action)) output = await builds.control(id, action, input);
        else if (req.method === 'POST' && id && ['approvals', 'questions'].includes(action) && requestId) output = await builds.answer(id, requestId, input, action === 'questions');
        else throw problem(404, 'Build operation not found.');
      }
      else if (req.method === 'GET' && path === '/v1/projects') output = { projects: gateway.projects };
      else if (req.method === 'GET' && /^\/v1\/projects\/[^/]+\/inspection$/.test(path)) output = await gateway.inspection(decodeURIComponent(path.split('/')[3]));
      else if (req.method === 'GET' && path === '/v1/sessions') output = { sessions: [...gateway.sessions.values()].map(item => gateway.view(item)) };
      else if (req.method === 'GET' && path === '/v1/models') output = await gateway.models();
      else if (req.method === 'GET' && path === '/v1/auth') output = await gateway.auth();
      else if (req.method === 'POST' && path === '/v1/sessions') output = await gateway.create(input.projectId);
      else {
        const match = path.match(/^\/v1\/sessions\/([a-f0-9-]{36})\/(resume|turn|steer|interrupt|events|history|diff|approvals|questions)(?:\/([a-f0-9-]{36}))?$/);
        if (!match) throw problem(404, 'Gateway operation not found.');
        const [, id, action, requestId] = match;
        if (req.method === 'GET' && action === 'events') output = await gateway.events(id, Number(url.searchParams.get('after') || 0), Number(url.searchParams.get('wait') || 0), controller.signal);
        else if (req.method === 'GET' && action === 'history') output = await gateway.history(id, url.searchParams.get('cursor'));
        else if (req.method === 'GET' && action === 'diff') output = await gateway.diff(id);
        else if (req.method === 'POST' && action === 'resume') output = await gateway.resume(id);
        else if (req.method === 'POST' && action === 'turn') output = await gateway.turn(id, input);
        else if (req.method === 'POST' && action === 'steer') output = await gateway.steer(id, input);
        else if (req.method === 'POST' && action === 'interrupt') output = await gateway.interrupt(id, input);
        else if (req.method === 'POST' && ['approvals', 'questions'].includes(action) && requestId) output = await gateway.answer(id, requestId, input, action === 'questions');
        else throw problem(404, 'Gateway operation not found.');
      }
      send(200, output);
    } catch (error) {
      // Runtime/provider error text can carry account/configuration details.
      send(error.status || 502, { message: error.status ? error.message : 'The agent runtime could not complete this request. Check host connection and provider sign-in before retrying.' });
    }
  };
  const server = tls ? https.createServer(tls, handler) : http.createServer(handler);
  server.requestTimeout = 60000; server.headersTimeout = 10000;
  server.on('close', () => { builds?.close(); gateway.close(); });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const host = process.env.STATION_GATEWAY_HOST || '127.0.0.1', port = Number(process.env.STATION_GATEWAY_PORT || 8754);
  const tls = process.env.STATION_GATEWAY_TLS_CERT && process.env.STATION_GATEWAY_TLS_KEY ? { cert: readFileSync(process.env.STATION_GATEWAY_TLS_CERT), key: readFileSync(process.env.STATION_GATEWAY_TLS_KEY) } : undefined;
  if (!['127.0.0.1', '::1', 'localhost'].includes(host) && !tls) throw new Error('Non-loopback listeners require TLS; use a secure tunnel or TLS termination on loopback.');
  const projects = JSON.parse(process.env.STATION_GATEWAY_PROJECTS || '[]');
  const gateway = new AgentGateway({ projects, stateDirectory: process.env.STATION_GATEWAY_STATE || resolve('.state/agent-gateway'), command: process.env.STATION_CODEX_COMMAND || 'codex' });
  const server = createGatewayServer({ gateway, token: process.env.STATION_GATEWAY_TOKEN, tls, inspectionToken: process.env.STATION_INSPECTION_TOKEN, inspectionProjects: JSON.parse(process.env.STATION_INSPECTION_PROJECTS || '[]') });
  server.listen(port, host, () => console.log(`STATION agent gateway listening on ${tls ? 'https' : 'http'}://${host}:${server.address().port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { gateway.close(); server.close(); setTimeout(() => process.exit(0), 3000).unref(); });
}
