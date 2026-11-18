import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, realpathSync, appendFileSync, chmodSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CodexRuntime } from './codex-runtime.mjs';
const execute = promisify(execFile);
const failure = (status, message) => Object.assign(new Error(message), { status });
const requests = new Set(['item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'item/tool/requestUserInput']);
const live = new Set(['starting', 'running', 'waiting']);
const now = () => new Date().toISOString();
const text = (value, max = 32000) => { if (typeof value !== 'string' || !value.trim() || value.length > max) throw failure(422, 'Provide nonempty text within the allowed length.'); return value; };
const idText = value => text(value, 256);

export class AgentGateway {
  constructor({ projects, stateDirectory, runtimeFactory, command, args = [] }) {
    this.directory = resolve(stateDirectory); mkdirSync(this.directory, { recursive: true, mode: 0o700 }); chmodSync(this.directory, 0o700);
    this.projects = projects.map(project => ({ ...project, id: idText(project.id), name: text(project.name, 120), root: realpathSync(project.root), target: 'host' }));
    if (!this.projects.length || new Set(this.projects.map(p => p.id)).size !== this.projects.length) throw new Error('Configure distinct authorized project roots.');
    this.loadedThreads = new Set(); this.closing = false; this.sessions = new Map(); this.runtimes = new Map(); this.initializing = new Map(); this.waiters = new Map(); this.pendingApprovals = new Map(); this.operations = new Set(); this.runtimeFactory = runtimeFactory;
    this.command = command; this.args = args;
    const file = join(this.directory, 'sessions.json');
    if (existsSync(file)) for (const item of JSON.parse(readFileSync(file, 'utf8')).sessions || []) {
      const project = this.projects.find(p => p.id === item.projectId);
      if (!project || item.rootHash !== this.rootHash(project)) continue;
      const journal = join(this.directory, item.id + '.events.jsonl');
      const events = existsSync(journal) ? readFileSync(journal, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)).slice(-1000) : [];
      this.sessions.set(item.id, { ...item, status: 'disconnected', activeTurnId: null, turnReady: false, events, lastSequence: Math.max(item.lastSequence || 0, events.at(-1)?.sequence || 0) });
    }
  }
  rootHash(project) { return createHash('sha256').update(project.root).digest('hex'); }
  project(id) { const project = this.projects.find(p => p.id === id); if (!project) throw failure(404, 'This host has not authorized that project.'); return project; }
  session(id) { const session = this.sessions.get(id); if (!session) throw failure(404, 'Session not found.'); this.project(session.projectId); return session; }
  view(session) { const { events, rootHash, ...view } = session; return { ...view, pendingRequestIds: [...this.pendingApprovals].filter(([, request]) => request.sessionId === session.id).map(([id]) => id) }; }
  save() {
    const file = join(this.directory, 'sessions.json'), temporary = file + '.' + randomUUID() + '.tmp';
    writeFileSync(temporary, JSON.stringify({ version: 1, sessions: [...this.sessions.values()].map(({ events, ...session }) => session) }), { mode: 0o600 }); renameSync(temporary, file);
  }
  emit(session, type, params) {
    if (JSON.stringify(params).length > 65536) params = { threadId: params.threadId, turnId: params.turnId, itemId: params.itemId || params.item?.id, gatewayTruncated: true, message: 'Large activity item omitted; inspect runtime history or the project diff.' };
    const event = { sequence: ++session.lastSequence, time: now(), type, params };
    session.updatedAt = event.time; session.events.push(event); session.events = session.events.slice(-1000);
    // Per-session bounded private journal supports replay across gateway restart.
    const file = join(this.directory, session.id + '.events.jsonl');
    if (session.lastSequence % 1000 === 0) writeFileSync(file, session.events.map(item => JSON.stringify(item)).join('\n') + '\n', { mode: 0o600 });
    else appendFileSync(file, JSON.stringify(event) + '\n', { mode: 0o600 });
    for (const wake of this.waiters.get(session.id) || []) wake();
    this.waiters.delete(session.id);
    return event;
  }
  notification(message) {
    let params = message.params || {}; const threadId = params.threadId || params.thread?.id;
    const session = [...this.sessions.values()].find(item => item.threadId === threadId);
    if (!session || !/^(thread|turn|item|serverRequest)\//.test(message.method)) return;
    if (message.method === 'turn/started') { session.activeTurnId = params.turn.id; session.turnReady = false; session.status = 'running'; }
    if (message.method === 'item/started' && params.turnId === session.activeTurnId) session.turnReady = true;
    if (message.method === 'turn/completed') {
      if (params.turn.id !== session.activeTurnId && session.activeTurnId) return;
      session.activeTurnId = null; session.turnReady = false; session.status = params.turn.status || 'completed'; this.clearRequests(session);
    }
    if (message.method === 'serverRequest/resolved') {
      const pending = [...this.pendingApprovals].find(([, request]) => request.sessionId === session.id && String(request.runtimeId) === String(params.requestId));
      if (!pending) return;
      this.pendingApprovals.delete(pending[0]); params = { ...params, requestId: pending[0] };
      session.status = [...this.pendingApprovals.values()].some(request => request.sessionId === session.id) ? 'waiting' : 'running';
    }
    this.emit(session, message.method, params); this.save();
  }
  serverRequest(message, runtime) {
    const session = [...this.sessions.values()].find(item => item.threadId === message.params?.threadId);
    if (JSON.stringify(message.params || {}).length > 65536 || !session || !requests.has(message.method) || !live.has(session.status) || (session.activeTurnId && session.activeTurnId !== message.params.turnId)) { runtime.reject(message.id); return; }
    session.activeTurnId ||= message.params.turnId; session.turnReady = true;
    const key = randomUUID();
    this.pendingApprovals.set(key, { sessionId: session.id, turnId: message.params.turnId, method: message.method, params: message.params, allowedDecisions: Array.isArray(message.params.availableDecisions) ? message.params.availableDecisions.filter(value => typeof value === 'string') : ['accept', 'decline', 'cancel'], questionIds: (message.params.questions || []).map(question => question.id), runtime, runtimeId: message.id, answering: false });
    session.status = 'waiting';
    this.emit(session, message.method, { ...message.params, requestId: key }); this.save();
  }
  clearRequests(session) { for (const [key, approval] of this.pendingApprovals) if (approval.sessionId === session.id) this.pendingApprovals.delete(key); }
  async runtime(project) {
    if (this.runtimes.has(project.id)) return this.runtimes.get(project.id);
    if (this.initializing.has(project.id)) return this.initializing.get(project.id);
    const pending = (async () => {
      const options = { command: this.command, args: this.args, cwd: project.root, onEvent: message => this.notification(message), onRequest: (message, runtime) => this.serverRequest(message, runtime), onExit: () => {
        if (this.closing) return;
        this.runtimes.delete(project.id);
        for (const session of this.sessions.values()) if (session.projectId === project.id) { session.status = 'disconnected'; session.activeTurnId = null; this.clearRequests(session); this.emit(session, 'gateway/disconnected', {}); }
        this.save();
      } };
      const runtime = this.runtimeFactory ? this.runtimeFactory(options) : new CodexRuntime(options);
      try { await runtime.initialize(); this.runtimes.set(project.id, runtime); return runtime; } catch (error) { runtime.close(); throw error; }
    })();
    this.initializing.set(project.id, pending);
    try { return await pending; } finally { this.initializing.delete(project.id); }
  }
  async exclusive(session, operation) {
    if (this.operations.has(session.id)) throw failure(409, 'Another session action is awaiting acknowledgment.');
    this.operations.add(session.id); try { return await operation(); } finally { this.operations.delete(session.id); }
  }
  async create(projectId) {
    if (this.sessions.size >= 100) throw failure(409, 'This gateway has reached its session limit.');
    const project = this.project(projectId), runtime = await this.runtime(project);
    const result = await runtime.request('thread/start', { cwd: project.root, approvalPolicy: 'on-request', sandbox: 'workspace-write', serviceName: 'parallax-station' });
    const session = { id: randomUUID(), projectId: project.id, rootHash: this.rootHash(project), threadId: result.thread.id, hasTurns: false, status: 'idle', activeTurnId: null, turnReady: false, lastSequence: 0, createdAt: now(), updatedAt: now(), events: [] };
    this.loadedThreads.add(session.threadId); this.sessions.set(session.id, session); this.emit(session, 'gateway/session', { threadId: session.threadId }); this.save(); return { session: this.view(session) };
  }
  async resume(id) {
    const session = this.session(id);
    return this.exclusive(session, async () => {
      if (live.has(session.status)) throw failure(409, 'This session is already active; reconnect to its event stream.');
      const project = this.project(session.projectId), runtime = await this.runtime(project);
      let history = { data: [], nextCursor: null };
      if (!session.hasTurns) {
        // Codex materializes its rollout on the first turn, not thread/start.
        // Empty conversations keep the gateway identity across a host restart.
        if (!this.loadedThreads.has(session.threadId)) {
          const fresh = await runtime.request('thread/start', { cwd: project.root, approvalPolicy: 'on-request', sandbox: 'workspace-write', serviceName: 'parallax-station' });
          session.threadId = fresh.thread.id;
        }
      } else {
        const resumed = await runtime.request('thread/resume', { threadId: session.threadId, cwd: project.root, approvalPolicy: 'on-request', sandbox: 'workspace-write', excludeTurns: true });
        history = await runtime.request('thread/items/list', { threadId: session.threadId, limit: 100, sortDirection: 'desc' });
        if (resumed.thread?.status?.type === 'active' || resumed.thread?.status === 'active') {
          const turns = await runtime.request('thread/turns/list', { threadId: session.threadId, limit: 1, sortDirection: 'desc', itemsView: 'summary' });
          const active = turns.data?.find(turn => turn.status === 'inProgress');
          session.status = active ? 'running' : 'unknown'; session.activeTurnId = active?.id || null; session.turnReady = !!active;
          this.emit(session, 'gateway/resumed', {}); this.save(); return { session: this.view(session), history };
        }
      }
      this.loadedThreads.add(session.threadId);
      session.status = 'idle'; session.activeTurnId = null; this.emit(session, 'gateway/resumed', {}); this.save(); return { session: this.view(session), history };
    });
  }
  async history(id, cursor) {
    const session = this.session(id), runtime = await this.runtime(this.project(session.projectId));
    const params = { threadId: session.threadId, limit: 100, sortDirection: 'desc' };
    if (cursor) params.cursor = text(cursor, 1000);
    let history = { data: [], nextCursor: null }, replayOnly = false;
    const readingActiveTurn = live.has(session.status);
    if (session.hasTurns) {
      try { history = await runtime.request('thread/items/list', params); }
      catch (error) {
        // Codex can expose the pagination method in its schema but reject it for
        // a first live turn before durable history exists. Keep live replay and
        // scoped pending decisions available; never turn this into an empty,
        // supposedly complete transcript or mask unrelated runtime failures.
        if (!readingActiveTurn || cursor || error.runtimeCode !== -32601 || !/not supported yet/i.test(error.message)) throw error;
        replayOnly = true;
      }
    }
    const pendingRequests = [...this.pendingApprovals].filter(([, item]) => item.sessionId === id).map(([requestId, item]) => ({ type: item.method, params: { ...item.params, requestId } }));
    return { session: this.view(session), history, pendingRequests, ...(replayOnly ? { replayOnly: true, replayAfter: 0, historyIncomplete: true } : {}) };
  }
  async turn(id, input) {
    const session = this.session(id); text(input.text);
    return this.exclusive(session, async () => {
      if (live.has(session.status)) throw failure(409, 'The session is active. Steer it or wait for completion.');
      if (['disconnected', 'unknown'].includes(session.status)) throw failure(409, 'Resume the session before starting another turn.');
      const project = this.project(session.projectId), runtime = await this.runtime(project);
      const params = { threadId: session.threadId, cwd: project.root, approvalPolicy: 'on-request', input: [{ type: 'text', text: input.text }] };
      if (input.model) params.model = text(input.model, 128);
      if (input.effort) params.effort = text(input.effort, 32);
      session.status = 'starting'; session.turnReady = false; session.hasTurns = true; this.save();
      try {
        const result = await runtime.request('turn/start', params);
        // A very short turn can complete before its request receipt arrives.
        if (session.status === 'starting' || session.status === 'running') { session.activeTurnId = result.turn.id; session.status = 'running'; }
        this.save(); return { session: this.view(session), turn: result.turn };
      } catch (error) { session.status = 'unknown'; this.save(); throw error; }
    });
  }
  active(session, turnId) { if (!live.has(session.status) || !session.activeTurnId || turnId !== session.activeTurnId) throw failure(409, 'The active turn changed. Refresh before acting.'); }
  async ready(session, turnId) {
    this.active(session, turnId);
    const deadline = Date.now() + 2000;
    while (!session.turnReady && Date.now() < deadline && live.has(session.status)) await new Promise(resolve => setTimeout(resolve, 25));
    this.active(session, turnId);
    if (!session.turnReady) throw failure(409, 'The runtime is still starting this turn. Wait for activity before controlling it.');
  }
  async steer(id, input) {
    const session = this.session(id); await this.ready(session, input.expectedTurnId); text(input.text);
    const runtime = await this.runtime(this.project(session.projectId));
    const result = await runtime.request('turn/steer', { threadId: session.threadId, expectedTurnId: session.activeTurnId, input: [{ type: 'text', text: input.text }] });
    return { accepted: true, turnId: result.turnId };
  }
  async interrupt(id, input) {
    const session = this.session(id); await this.ready(session, input.expectedTurnId);
    const runtime = await this.runtime(this.project(session.projectId));
    await runtime.request('turn/interrupt', { threadId: session.threadId, turnId: session.activeTurnId }); return { accepted: true };
  }
  async answer(id, requestId, input, question = false) {
    const session = this.session(id), approval = this.pendingApprovals.get(requestId);
    if (!approval || approval.sessionId !== session.id || approval.answering || approval.turnId !== session.activeTurnId || (approval.method === 'item/tool/requestUserInput') !== question) throw failure(409, 'This request expired or belongs to another session.');
    let result;
    if (question) {
      if (!input.answers || typeof input.answers !== 'object' || Array.isArray(input.answers) || JSON.stringify(input.answers).length > 16000) throw failure(422, 'Provide question answers.');
      if (Object.keys(input.answers).some(key => !approval.questionIds.includes(key))) throw failure(422, 'This answer does not belong to the pending question.');
      for (const entry of Object.values(input.answers)) if (!Array.isArray(entry?.answers) || entry.answers.some(value => typeof value !== 'string' || value.length > 4000)) throw failure(422, 'Invalid question answer.');
      result = { answers: input.answers };
    } else { if (!['accept', 'decline', 'cancel'].includes(input.decision) || !approval.allowedDecisions.includes(input.decision)) throw failure(422, 'Choose accept, decline or cancel.'); result = { decision: input.decision }; }
    approval.answering = true;
    try { approval.runtime.respond(approval.runtimeId, result); this.pendingApprovals.delete(requestId); session.status = [...this.pendingApprovals.values()].some(request => request.sessionId === session.id) ? 'waiting' : 'running'; this.emit(session, 'serverRequest/resolved', { requestId }); this.save(); return { accepted: true }; }
    catch (error) { approval.answering = false; throw error; }
  }
  async events(id, after = 0, wait = 0, signal) {
    const session = this.session(id);
    if (!Number.isSafeInteger(after) || after < 0 || after > session.lastSequence) throw failure(422, 'Invalid event cursor.');
    if (!session.events.some(event => event.sequence > after) && wait > 0) await new Promise(resolve => {
      let timer;
      const wake = () => { clearTimeout(timer); this.waiters.get(id)?.delete(wake); signal?.removeEventListener('abort', wake); resolve(); };
      if (!this.waiters.has(id)) this.waiters.set(id, new Set()); this.waiters.get(id).add(wake);
      timer = setTimeout(wake, Math.min(wait, 25000)); signal?.addEventListener('abort', wake, { once: true }); if (signal?.aborted) wake();
    });
    const events = session.events.filter(event => event.sequence > after).slice(0, 200);
    return { events, lastSequence: events.at(-1)?.sequence ?? after, resetRequired: after < (session.events[0]?.sequence || 1) - 1, session: this.view(session) };
  }
  async diff(id) { return this.inspectProject(this.project(this.session(id).projectId)); }
  async inspection(projectId) { return this.inspectProject(this.project(projectId)); }
  async inspectProject(project) {
    const git = async args => {
      try { return (await execute('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.pager=cat', '-C', project.root, ...args], { encoding: 'utf8', timeout: 15000, maxBuffer: 512000, windowsHide: true })).stdout; }
      catch { throw failure(422, 'Could not inspect Git changes in this authorized project.'); }
    };
    const status = await git(['status', '--porcelain=v1', '--branch', '--ignore-submodules=all']);
    const branch = await git(['branch', '--show-current']);
    const diff = await git(['diff', 'HEAD', '--no-ext-diff', '--no-textconv', '--ignore-submodules=all', '--']);
    const head = (await git(['rev-parse', 'HEAD'])).trim();
    const excerpt = diff.slice(0, 256000);
    return { projectId: project.id, readOnly: true, head, observedAt: now(), branch: branch.trim(), status, diff: excerpt, truncated: diff.length > 256000,
      diffSha256: createHash('sha256').update(excerpt).digest('hex') };
  }
  async models() {
    const runtime = await this.runtime(this.projects[0]), result = await runtime.request('model/list', {});
    return { models: (result.data || []).map(model => ({ id: model.id, name: model.displayName || model.id, defaultReasoningEffort: model.defaultReasoningEffort, supportedReasoningEfforts: model.supportedReasoningEfforts })) };
  }
  async auth() {
    const runtime = await this.runtime(this.projects[0]), result = await runtime.request('account/read', { refreshToken: false });
    return { authenticated: !!result.account, provider: 'codex', type: result.account?.type || null };
  }
  close() { this.closing = true; for (const runtime of this.runtimes.values()) runtime.close(); for (const wakes of this.waiters.values()) for (const wake of wakes) wake(); }
}
