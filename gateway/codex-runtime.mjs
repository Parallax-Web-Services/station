import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

// The only provider-specific component. No arbitrary JSON-RPC proxy is exposed.
export class CodexRuntime {
  constructor({ command = 'codex', args = [], cwd, onEvent, onRequest, onExit }) {
    this.pending = new Map(); this.counter = 0; this.closed = false;
    this.process = spawn(command, [...args, 'app-server'], { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.lines = createInterface({ input: this.process.stdout });
    this.lines.on('line', line => {
      if (this.closed) return;
      if (Buffer.byteLength(line) > 2_000_000) { this.close(); return; }
      let message; try { message = JSON.parse(line); } catch { return; }
      if (message.method) {
        if (message.id !== undefined) onRequest(message, this);
        else onEvent(message);
      } else if (message.id !== undefined) {
        const pending = this.pending.get(String(message.id));
        if (!pending) return;
        this.pending.delete(String(message.id)); clearTimeout(pending.timer);
        if (message.error) pending.reject(Object.assign(new Error(message.error.message || 'Runtime request failed.'), { runtimeCode: message.error.code }));
        else pending.resolve(message.result);
      }
    });
    // Runtime diagnostics may contain account/host details; never return or log them.
    this.process.stderr.resume();
    this.process.on('error', () => this.fail('The agent runtime could not start. Install Codex on this host and check its PATH.'));
    this.process.on('exit', () => { this.fail('The agent runtime disconnected. Resume the session to reconnect.'); onExit?.(); });
    this.process.stdin.on('error', () => this.fail('The agent runtime connection closed.'));
  }
  send(message) {
    if (this.closed || !this.process.stdin.writable) throw new Error('The agent runtime is disconnected.');
    this.process.stdin.write(JSON.stringify(message) + '\n');
  }
  request(method, params = {}, timeout = 45000) {
    const id = String(++this.counter);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Runtime response timed out. Check session state before retrying an action.')); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ id, method, params }); } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  respond(id, result) { this.send({ id, result }); }
  reject(id, message = 'This client does not support that runtime request.') { this.send({ id, error: { code: -32601, message } }); }
  async initialize() {
    await this.request('initialize', { clientInfo: { name: 'parallax_station', title: 'PARALLAX STATION', version: '0.2.0' } });
    this.send({ method: 'initialized', params: {} });
  }
  fail(message) {
    this.closed = true;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(message)); }
    this.pending.clear();
  }
  close() { if (!this.closed) { this.process.stdin.end(); this.process.kill(); } this.fail('Runtime closed.'); this.lines.close(); }
}
