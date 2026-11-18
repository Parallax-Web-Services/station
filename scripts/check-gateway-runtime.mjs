import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { AgentGateway } from '../gateway/service.mjs';
const directory = mkdtempSync(join(tmpdir(), 'station-runtime-check-'));
execFileSync('git', ['init', '-q', directory]);
writeFileSync(join(directory, 'smoke.txt'), 'Synthetic Station gateway verification fixture.\n');
let recovered;
const gateway = new AgentGateway({ projects: [{ id: 'verification', name: 'Isolated runtime verification', root: directory }], stateDirectory: join(directory, 'state') });
try {
  const auth = await gateway.auth();
  console.log(JSON.stringify({ step: 'runtime-handshake', authenticated: auth.authenticated, provider: auth.provider }));
  const result = await gateway.create('verification'), id = result.session.id;
  const resumed = await gateway.resume(id);
  if (resumed.session.threadId !== result.session.threadId) throw new Error('Runtime thread identity changed on resume.');
  console.log(JSON.stringify({ step: 'create-resume', passed: true }));
  if (process.argv.includes('--turn')) {
    if (!auth.authenticated) throw new Error('A host-side supported provider sign-in is required for a real turn.');
    const { turn } = await gateway.turn(id, { text: 'This is an isolated protocol smoke check. Reply with exactly STATION_GATEWAY_READY. Do not use tools, read files, change files, or access the network.', effort: 'low' });
    const deadline = Date.now() + 120000; let cursor = 0, output = '', completed = false;
    while (Date.now() < deadline) {
      const batch = await gateway.events(id, cursor, 1000); cursor = batch.lastSequence;
      for (const event of batch.events) {
        if (event.type === 'item/agentMessage/delta') output += event.params.delta || '';
        if (event.type === 'turn/completed' && event.params.turn.id === turn.id) {
          completed = true; if (event.params.turn.status !== 'completed') throw new Error('Real runtime turn did not complete successfully.');
        }
      }
      if (completed) break;
    }
    if (!completed || !output.includes('STATION_GATEWAY_READY')) throw new Error('Real streamed output/completion was not observed.');
    console.log(JSON.stringify({ step: 'real-streamed-turn', passed: true }));
    const history = await gateway.resume(id);
    if (!JSON.stringify(history.history).includes('STATION_GATEWAY_READY')) throw new Error('Completed history could not be restored.');
    gateway.close();
    recovered = new AgentGateway({ projects: [{ id: 'verification', name: 'Isolated runtime verification', root: directory }], stateDirectory: join(directory, 'state') });
    const restarted = await recovered.resume(id);
    if (restarted.session.threadId !== result.session.threadId || !JSON.stringify(restarted.history).includes('STATION_GATEWAY_READY')) throw new Error('Real runtime history did not survive gateway restart.');
    console.log(JSON.stringify({ step: 'real-runtime-restart', passed: true }));
    const second = await recovered.turn(id, { text: 'Protocol cancellation test: write the integers from 1 to 1000 in words. Do not use tools or change files.', effort: 'low' });
    const activeDeadline = Date.now() + 10000;
    while (Date.now() < activeDeadline && !recovered.session(id).events.some(event => event.type === 'item/started' && event.params.turnId === second.turn.id)) await new Promise(resolve => setTimeout(resolve, 50));
    console.log(JSON.stringify({ step: 'interrupt-precondition', state: recovered.session(id).status, events: recovered.session(id).events.slice(-8).map(event => ({ type: event.type, status: event.params.turn?.status })) }));
    await recovered.interrupt(id, { expectedTurnId: second.turn.id });
    const stopDeadline = Date.now() + 30000;
    while (Date.now() < stopDeadline && recovered.session(id).status !== 'interrupted') await new Promise(resolve => setTimeout(resolve, 100));
    if (recovered.session(id).status !== 'interrupted') throw new Error('Runtime did not acknowledge actual interruption.');
    console.log(JSON.stringify({ step: 'real-runtime-interrupt', passed: true }));
  }
} finally { recovered?.close(); gateway.close(); rmSync(directory, { recursive: true, force: true }); }
