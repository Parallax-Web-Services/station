// Owner-run outbound SSH link. Both endpoints remain loopback; no client chooses a target.
import { readFileSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
const file = process.argv[2];
if (!file || (process.platform !== 'win32' && (statSync(file).mode & 0o077))) throw new Error('Provide an owner-only host-link configuration.');
const { sshTarget, localPort, remotePort } = JSON.parse(readFileSync(file, 'utf8'));
if (typeof sshTarget !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._@-]{0,200}$/.test(sshTarget) || ![localPort, remotePort].every(port => Number.isInteger(port) && port >= 1024 && port <= 65535)) throw new Error('Invalid owner-configured SSH link.');
let child, timer, stopping = false, failures = 0;
function connect() {
  const started = Date.now();
  child = spawn('ssh', ['-N', '-T', '-o', 'BatchMode=yes', '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3', '-R', `127.0.0.1:${remotePort}:127.0.0.1:${localPort}`, sshTarget], { stdio: 'ignore', windowsHide: true });
  let finished = false;
  const reconnect = () => {
    if (finished) return; finished = true;
    if (stopping) return;
    failures = Date.now() - started > 60000 ? 0 : Math.min(failures + 1, 5);
    timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** failures));
  };
  child.on('error', reconnect); child.on('exit', reconnect);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopping = true; clearTimeout(timer); child?.kill('SIGTERM'); });
connect();
