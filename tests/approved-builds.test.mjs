import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { AgentGateway } from '../gateway/service.mjs';
import { createGatewayServer } from '../gateway/server.mjs';

test('approved build uses a separate checkout, restricted credential, one turn and durable evidence', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'station-approved-build-')), source = join(folder, 'repo');
  execFileSync('git', ['init', source], { stdio: 'ignore' });
  writeFileSync(join(source, 'README.md'), 'Original\n');
  execFileSync('git', ['-C', source, 'add', 'README.md']);
  execFileSync('git', ['-C', source, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'Fixture'], { stdio: 'ignore' });
  let turns = 0, server;
  const full = 'synthetic-full-credential-123456789012345', inspection = 'synthetic-read-credential-123456789012345', build = 'synthetic-build-credential-12345678901234';
  const factory = options => ({ async initialize() {}, close() {}, reject() {}, async request(method, params) {
    if (method === 'thread/start') { assert.equal(params.approvalPolicy, 'on-request'); assert.equal(params.sandbox, 'workspace-write'); return { thread: { id: 'fixture-thread' } }; }
    if (method === 'turn/start') {
      turns++;
      if (turns === 2) assert.equal(readFileSync(join(options.cwd, 'added.txt'), 'utf8').replaceAll('\r\n', '\n'), 'Actual isolated fixture change\n');
      const turn = { id: 'fixture-turn', status: 'completed' };
      writeFileSync(join(options.cwd, 'added.txt'), turns === 1 ? 'Actual isolated fixture change\n' : 'Revised fixture change\n');
      options.onEvent({ method: 'turn/completed', params: { threadId: params.threadId, turn } });
      return { turn };
    }
    throw new Error('Unexpected provider operation.');
  } });
  const config = { projects: [{ id: 'sample', name: 'Sample', root: source }], stateDirectory: join(folder, 'state'), runtimeFactory: factory };
  const start = async () => {
    const gateway = new AgentGateway(config);
    server = createGatewayServer({ gateway, token: full, inspectionToken: inspection, inspectionProjects: ['sample'], buildToken: build, buildProjects: ['sample'] });
    server.listen(0, '127.0.0.1'); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}`;
  };
  try {
    let origin = await start();
    const reference = '00000000-0000-4000-8000-000000000001', approvedPlan = 'Add the approved fixture text in an isolated checkout.';
    const body = { reference, projectId: 'sample', approvedPlan, planSha256: createHash('sha256').update(approvedPlan).digest('hex') };
    const request = (path, token, input) => fetch(origin + path, { method: input ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(input ? { body: JSON.stringify(input) } : {}) });
    assert.equal((await request('/v1/builds', inspection, body)).status, 403);
    assert.equal((await request('/v1/auth', build)).status, 403);
    const result = await (await request('/v1/builds', build, body)).json();
    assert.equal(result.build.status, 'completed'); assert.match(result.build.diff, /Actual isolated fixture change/);
    assert.equal(result.build.diffSha256, createHash('sha256').update(result.build.diff).digest('hex'));
    assert.equal(readFileSync(join(source, 'README.md'), 'utf8'), 'Original\n'); assert.equal(existsSync(join(source, 'added.txt')), false);
    assert.equal((await request('/v1/builds', build, body)).status, 200); assert.equal(turns, 1);
    assert.equal((await request('/v1/builds', build, { ...body, approvedPlan: 'Another plan' })).status, 422);
    await new Promise(resolve => server.close(resolve)); origin = await start();
    const recovered = await (await request('/v1/builds/' + reference, build)).json();
    assert.equal(recovered.build.status, 'completed'); assert.equal(recovered.build.planSha256, body.planSha256); assert.equal(turns, 1);
    const next = '00000000-0000-4000-8000-000000000002';
    const revision = diff_sha256 => {
      const plan = JSON.stringify({ summary: 'Revise added.txt', continuation: { reference, plan_sha256: body.planSha256, diff_sha256 } });
      return { ...body, reference: next, approvedPlan: plan, planSha256: createHash('sha256').update(plan).digest('hex') };
    };
    assert.equal((await request('/v1/builds', build, revision('0'.repeat(64)))).status, 409);
    const follow = revision(result.build.diffSha256);
    const revised = await (await request('/v1/builds', build, follow)).json();
    assert.ok(revised.build, JSON.stringify(revised));
    assert.equal(revised.build.continuedFrom, reference);
    assert.match(revised.build.diff, /Revised fixture change/);
    assert.equal((await request('/v1/builds', build, follow)).status, 200);
    assert.equal(turns, 2);
    assert.equal((await (await request('/v1/builds/' + reference, build)).json()).build.diffSha256, result.build.diffSha256);
  } finally { if (server?.listening) await new Promise(resolve => server.close(resolve)); rmSync(folder, { recursive: true, force: true }); }
});
