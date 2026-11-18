import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { AgentGateway } from '../gateway/service.mjs';
import { createGatewayServer } from '../gateway/server.mjs';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'station-gateway-test-'));
  let serial = 0;
  const runtimes = [];
  const gateway = new AgentGateway({ projects: [{ id: 'sample', name: 'Synthetic project', root: directory }], stateDirectory: join(directory, 'state'), runtimeFactory: options => {
    const runtime = { calls: [], replies: [], options, async initialize() {}, close() {}, respond(id, result) { this.replies.push({ id, result }); }, reject(id) { this.replies.push({ id, rejected: true }); }, async request(method, params) {
      this.calls.push({ method, params });
      if (method === 'thread/start') return { thread: { id: `thread-${++serial}` } };
      if (method === 'thread/resume') return { thread: { id: params.threadId } };
      if (method === 'thread/items/list') return { data: [{ id: 'saved', type: 'agentMessage', text: 'Prior visible result' }], nextCursor: null };
      if (method === 'turn/start') { const turn = { id: `turn-${++serial}`, status: 'inProgress' }; options.onEvent({ method: 'turn/started', params: { threadId: params.threadId, turn } }); options.onEvent({ method: 'item/started', params: { threadId: params.threadId, turnId: turn.id, item: { id: 'input', type: 'userMessage' } } }); return { turn }; }
      if (method === 'turn/steer') return { turnId: params.expectedTurnId };
      if (method === 'turn/interrupt') { options.onEvent({ method: 'turn/completed', params: { threadId: params.threadId, turn: { id: params.turnId, status: 'interrupted' } } }); return {}; }
      if (method === 'model/list') return { data: [{ id: 'synthetic-model', displayName: 'Synthetic model', secret: 'never-return' }] };
      if (method === 'account/read') return { account: { type: 'chatgpt', email: 'not-returned@example.invalid', accessToken: 'never-return' } };
      throw new Error('Unexpected mock method: ' + method);
    } };
    runtimes.push(runtime); return runtime;
  } });
  return { directory, gateway, runtimes, clean() { gateway.close(); rmSync(directory, { recursive: true, force: true }); } };
}

test('only configured roots; no injected runtime permissions; live steering and acknowledged stop', async () => {
  const f = fixture(); try {
    await assert.rejects(() => f.gateway.create('foreign'), { status: 404 });
    const { session } = await f.gateway.create('sample');
    const result = await f.gateway.turn(session.id, { text: 'Synthetic direction', sandboxPolicy: { type: 'dangerFullAccess' } });
    const calls = f.runtimes[0].calls;
    assert.equal(calls.find(c => c.method === 'thread/start').params.sandbox, 'workspace-write');
    assert.equal(calls.find(c => c.method === 'thread/start').params.approvalPolicy, 'on-request');
    assert.equal(calls.find(c => c.method === 'turn/start').params.sandboxPolicy, undefined);
    await assert.rejects(() => f.gateway.turn(session.id, { text: 'duplicate' }), { status: 409 });
    await assert.rejects(() => f.gateway.steer(session.id, { text: 'bad', expectedTurnId: 'stale' }), { status: 409 });
    assert.equal((await f.gateway.steer(session.id, { text: 'Change focus', expectedTurnId: result.turn.id })).accepted, true);
    await f.gateway.interrupt(session.id, { expectedTurnId: result.turn.id });
    assert.equal(f.gateway.session(session.id).status, 'interrupted');
    const events = await f.gateway.events(session.id);
    assert.ok(events.events.some(e => e.type === 'turn/completed'));
  } finally { f.clean(); }
});

test('approvals are one-use, scoped to session/turn and cannot amend permanent policy', async () => {
  const f = fixture(); try {
    const a = (await f.gateway.create('sample')).session, b = (await f.gateway.create('sample')).session;
    const turn = (await f.gateway.turn(a.id, { text: 'Synthetic request' })).turn;
    const runtime = f.runtimes[0];
    runtime.options.onRequest({ id: 72, method: 'item/commandExecution/requestApproval', params: { threadId: a.threadId, turnId: turn.id, command: 'synthetic command', cwd: f.directory } }, runtime);
    const requestId = f.gateway.session(a.id).events.at(-1).params.requestId;
    await assert.rejects(() => f.gateway.answer(b.id, requestId, { decision: 'accept' }), { status: 409 });
    await assert.rejects(() => f.gateway.answer(a.id, requestId, { decision: 'acceptForSession' }), { status: 422 });
    assert.equal((await f.gateway.answer(a.id, requestId, { decision: 'decline' })).accepted, true);
    assert.deepEqual(runtime.replies.at(-1), { id: 72, result: { decision: 'decline' } });
    await assert.rejects(() => f.gateway.answer(a.id, requestId, { decision: 'accept' }), { status: 409 });
    runtime.options.onRequest({ id: 73, method: 'unsupported/execute', params: { threadId: a.threadId } }, runtime);
    assert.equal(runtime.replies.at(-1).rejected, true);
  } finally { f.clean(); }
});

test('replay, private persistence and resume survive a gateway restart', async () => {
  const f = fixture(); let recovered;
  try {
    const session = (await f.gateway.create('sample')).session;
    const turn = (await f.gateway.turn(session.id, { text: 'Synthetic direction' })).turn;
    f.runtimes[0].options.onEvent({ method: 'item/agentMessage/delta', params: { threadId: session.threadId, turnId: turn.id, itemId: 'message', delta: 'Partial result' } });
    const replay = await f.gateway.events(session.id, 1);
    assert.equal(replay.events.at(-1).params.delta, 'Partial result');
    const state = JSON.parse(readFileSync(join(f.directory, 'state/sessions.json')));
    assert.equal(state.sessions[0].events, undefined);
    if (process.platform !== 'win32') assert.equal(statSync(join(f.directory, 'state/sessions.json')).mode & 0o777, 0o600);
    recovered = new AgentGateway({ projects: f.gateway.projects, stateDirectory: join(f.directory, 'state'), runtimeFactory: f.gateway.runtimeFactory });
    const restored = await recovered.resume(session.id);
    assert.equal(restored.session.threadId, session.threadId);
    assert.equal(restored.history.data[0].text, 'Prior visible result');
    assert.ok((await recovered.events(session.id)).events.some(e => e.params.delta === 'Partial result'));
  } finally { recovered?.close(); f.clean(); }
});

test('long-poll wakes on a real event and can be aborted without cancelling execution', async () => {
  const f = fixture(); try {
    const session = (await f.gateway.create('sample')).session;
    const cursor = f.gateway.session(session.id).lastSequence;
    const pending = f.gateway.events(session.id, cursor, 20000);
    f.gateway.emit(f.gateway.session(session.id), 'gateway/test', { value: 'arrived' });
    assert.equal((await pending).events[0].params.value, 'arrived');
    const controller = new AbortController(), waiting = f.gateway.events(session.id, cursor + 1, 20000, controller.signal);
    controller.abort(); await waiting;
    assert.equal(f.gateway.session(session.id).status, 'idle');
  } finally { f.clean(); }
});

test('HTTP auth, origin restrictions and account redaction protect every agent operation', async () => {
  const f = fixture(), token = 'synthetic-only-gateway-credential-1234567890';
  const server = createGatewayServer({ gateway: f.gateway, token });
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const origin = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(origin + '/health')).status, 200);
    assert.equal((await fetch(origin + '/v1/projects')).status, 401);
    assert.equal((await fetch(origin + '/v1/projects', { headers: { Authorization: 'Bearer ' + token, Origin: 'https://untrusted.invalid' } })).status, 403);
    const auth = await (await fetch(origin + '/v1/auth', { headers: { Authorization: 'Bearer ' + token } })).json();
    assert.deepEqual(auth, { authenticated: true, provider: 'codex', type: 'chatgpt' });
    const models = await (await fetch(origin + '/v1/models', { headers: { Authorization: 'Bearer ' + token } })).json();
    assert.equal(models.models[0].secret, undefined);
    const denied = await fetch(origin + '/v1/sessions', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: 'foreign' }) });
    assert.equal(denied.status, 404);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); f.clean(); }
});

test('active history includes only current scoped approval requests and resolves runtime IDs safely', async () => {
  const f = fixture(); try {
    const session = (await f.gateway.create('sample')).session;
    const turn = (await f.gateway.turn(session.id, { text: 'Synthetic work' })).turn;
    const runtime = f.runtimes[0];
    runtime.options.onRequest({ id: 900, method: 'item/fileChange/requestApproval', params: { threadId: session.threadId, turnId: turn.id, reason: 'Synthetic change', availableDecisions: ['decline', 'cancel'] } }, runtime);
    const snapshot = await f.gateway.history(session.id), request = snapshot.pendingRequests[0];
    assert.equal(snapshot.session.status, 'waiting');
    assert.ok(snapshot.session.pendingRequestIds.includes(request.params.requestId));
    await assert.rejects(() => f.gateway.answer(session.id, request.params.requestId, { decision: 'accept' }), { status: 422 });
    runtime.options.onEvent({ method: 'serverRequest/resolved', params: { threadId: session.threadId, requestId: 900 } });
    assert.deepEqual((await f.gateway.history(session.id)).pendingRequests, []);
    assert.equal(f.gateway.session(session.id).events.at(-1).params.requestId, request.params.requestId);
    await assert.rejects(() => f.gateway.answer(session.id, request.params.requestId, { decision: 'decline' }), { status: 409 });
  } finally { f.clean(); }
});

test('an immediate Stop waits for runtime readiness and issues one interruption request', async () => {
  const f = fixture(); try {
    const session = (await f.gateway.create('sample')).session, runtime = f.runtimes[0];
    const notify = runtime.options.onEvent;
    runtime.options.onEvent = message => { if (message.method === 'item/started') setTimeout(() => notify(message), 25); else notify(message); };
    const { turn } = await f.gateway.turn(session.id, { text: 'Synthetic work' });
    assert.equal(f.gateway.session(session.id).turnReady, false);
    await f.gateway.interrupt(session.id, { expectedTurnId: turn.id });
    assert.equal(f.gateway.session(session.id).status, 'interrupted');
    assert.equal(runtime.calls.filter(call => call.method === 'turn/interrupt').length, 1);
  } finally { f.clean(); }
});

test('first active turn without runtime pagination preserves replay and scoped decisions', async () => {
  const f = fixture();
  try {
    const session = (await f.gateway.create('sample')).session;
    const turn = (await f.gateway.turn(session.id, { text: 'Synthetic first turn' })).turn;
    const runtime = f.runtimes[0], request = runtime.request.bind(runtime);
    runtime.request = async (method, params) => {
      if (method === 'thread/items/list') throw Object.assign(new Error('thread/items/list is not supported yet'), { runtimeCode: -32601 });
      return request(method, params);
    };
    runtime.options.onRequest({ id: 990, method: 'item/commandExecution/requestApproval', params: { threadId: session.threadId, turnId: turn.id, command: 'synthetic', cwd: f.directory } }, runtime);
    const snapshot = await f.gateway.history(session.id);
    assert.equal(snapshot.replayOnly, true);
    assert.equal(snapshot.historyIncomplete, true);
    assert.equal(snapshot.replayAfter, 0);
    assert.equal(snapshot.session.status, 'waiting');
    assert.equal(snapshot.pendingRequests.length, 1);
    assert.ok((await f.gateway.events(session.id, 0)).events.some(event => event.type.endsWith('/requestApproval')));
    await assert.rejects(() => f.gateway.history(session.id, 'older-page'), /not supported yet/);
    runtime.options.onEvent({ method: 'turn/completed', params: { threadId: session.threadId, turn: { id: turn.id, status: 'completed' } } });
    await assert.rejects(() => f.gateway.history(session.id), /not supported yet/);
  } finally { f.clean(); }
});

test('active history does not hide transport or unrelated runtime failures', async () => {
  const f = fixture();
  try {
    const session = (await f.gateway.create('sample')).session;
    await f.gateway.turn(session.id, { text: 'Synthetic active turn' });
    f.runtimes[0].request = async () => { throw new Error('Runtime response timed out.'); };
    await assert.rejects(() => f.gateway.history(session.id), /timed out/);
  } finally { f.clean(); }
});
