# Shared agent session gateway

Implementation owner: Station thread. Mobile owns `parallax-mobile`; this gateway lives in standalone `station/gateway` and has no mobile source edits. Contract version: 1. This is a local/connected-host execution adapter, not a replacement SLIPSTREAM workstream service or a cloud executor.

## Connection

Default origin `http://127.0.0.1:8754`. Android may reach it through an explicitly configured ADB reverse tunnel; LAN/public listeners require TLS. No unauthenticated agent operation is allowed. Use a separate random `STATION_GATEWAY_TOKEN` (32+ characters) in `Authorization: Bearer …`; never reuse or forward a NEXUS/SLIPSTREAM credential. It authorizes only roots explicitly configured by the host owner. Each configured root has a stable `projectId`; any SLIPSTREAM workspace/project/workstream reference is correlation metadata, not an authorization claim.

## HTTP contract

JSON request/response. Errors use `{message, code?}` with HTTP status. All routes below require the bearer token except `GET /health` (version/availability only). Writes are not retried automatically. Session IDs identify gateway-owned runtime sessions; the gateway persists mappings to the runtime thread, not a new task hierarchy.

| Method | Path | Input / output |
| --- | --- | --- |
| GET | `/health` | `{name,version}` |
| GET | `/v1/projects` | `{projects:[{id,name,root,target:"host",correlation?}]}` |
| GET | `/v1/models` | `{models:[{id,name,defaultReasoningEffort,supportedReasoningEfforts}]}` |
| GET | `/v1/auth` | `{authenticated,provider:"codex",type?}`; never credentials |
| GET | `/v1/sessions` | `{sessions:[{id,projectId,threadId,status,activeTurnId,lastSequence,turnReady,pendingRequestIds,createdAt,updatedAt}]}` |
| POST | `/v1/sessions` | `{projectId}` → `{session}`; creates the runtime thread but does not start a paid/model turn |
| POST | `/v1/sessions/:id/resume` | `{}` → `{session,history}`; history is the current paginated runtime items response |
| GET | `/v1/sessions/:id/history?cursor=…` | `{session,history,pendingRequests}`; paginated read-only history and currently actionable requests, including during an active turn |
| POST | `/v1/sessions/:id/turn` | `{text,model?,effort?}` → `{session,turn}`; explicit run |
| POST | `/v1/sessions/:id/steer` | `{text,expectedTurnId}` → `{accepted:true,turnId}` |
| POST | `/v1/sessions/:id/interrupt` | `{expectedTurnId}` → `{accepted:true}`; wait for terminal event before presenting stopped |
| GET | `/v1/sessions/:id/events?after=0&wait=25000` | `{events:[{sequence,time,type,params}],lastSequence,resetRequired,session}`; long-poll up to 25 seconds, authenticated, replay cursor |
| POST | `/v1/sessions/:id/approvals/:requestId` | `{decision:"accept"\|"decline"\|"cancel"}` → `{accepted:true}`; one-use request bound to session/turn |
| POST | `/v1/sessions/:id/questions/:requestId` | `{answers:{questionId:{answers:["text"]}}}` → `{accepted:true}` |
| GET | `/v1/sessions/:id/diff` | `{branch,status,diff,truncated}`; read-only Git inspection, no external diff/textconv commands |

## Events and reconnect

`type` preserves the runtime method, including `turn/started`, `turn/completed`, `item/started`, `item/completed`, `item/agentMessage/delta`, `item/commandExecution/outputDelta`, `turn/diff/updated`, `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `item/tool/requestUserInput`, and `serverRequest/resolved`. Server requests add `requestId` to params. Render unknown event types safely as activity, not executable HTML. Render approval command/cwd/reason and network target when present. Unsupported server requests fail closed.

Store each session ID and replay cursor in the client's private state. Poll from the last committed sequence. A rolled-off cursor sets `resetRequired`; fetch `/history` and reconcile current pending requests instead of silently pretending the log is complete. A network error does not imply cancellation. A successful interrupt receipt means requested, not completed; show the acknowledged runtime terminal status.

The session snapshot includes `pendingRequestIds`; only those IDs may remain actionable after replay or reconnect. Empty runtime threads may be recreated before their first turn because Codex persists rollouts lazily; the gateway session ID remains stable.

Clients must disable stale approval controls after `serverRequest/resolved`, completion, disconnect or turn mismatch. Never auto-accept. No permanent permission amendments or accept-for-session decision are exposed by this first adapter. The runtime starts with workspace-write sandbox and on-request approvals; host managed requirements remain authoritative.

## Host lifetime and ownership

The gateway runs independently of either UI. Closing a Station window or Android screen does not stop its host process. If the host sleeps or stops, local execution cannot continue; this must not be labeled cloud execution. Host/root identity and active target must be visible. SLIPSTREAM retains authoritative business workstream identity; this adapter only supplies a correlated runtime session.

## Remote desktop boundary

Remote desktop is a separate capability. Named hosts and per-host monitor IDs must not be conflated with agent sessions. No RDP/VNC/Chrome Remote Desktop credential or arbitrary screen-control bridge is added by this coding gateway. Existing host pairing/configuration must be discovered before provisioning another remote-desktop system.

## Host setup

Use Node.js 22+ and an installed, signed-in Codex CLI on the execution host. The adapter was verified against local Codex 0.169.0; protocol changes require revalidation. The gateway never copies provider credentials to clients.

Configure `STATION_GATEWAY_TOKEN` with a separate random secret, `STATION_GATEWAY_PROJECTS` with a JSON array of `{id,name,root}` authorized by the host owner, and `STATION_GATEWAY_STATE` with a private directory outside source checkouts. Then run `npm run gateway`. Never put these values in a public repository. `STATION_GATEWAY_HOST` defaults to loopback and `STATION_GATEWAY_PORT` to 8754; other listeners require `STATION_GATEWAY_TLS_CERT` and `STATION_GATEWAY_TLS_KEY`.

Alternatively, `node gateway/host.mjs /path/to/private-config.json` reads `{host,port,token,stateDirectory,projects,command?}`. Its launcher is loopback-only; on POSIX the config must have owner-only permissions. Run it as the intended unprivileged execution user, not root. Protect configuration/state with host OS permissions and run one process per state directory.

For Android development, the device owner can configure `adb reverse tcp:8754 tcp:8754` over an existing trusted ADB connection and verify host-localhost forwarding first. The app then uses `http://127.0.0.1:8754` and stores the separate token in its native secret vault. This is a development transport, not unattended remote access over the internet. Public/remote use needs a supported authenticated TLS transport and explicit device/root authorization.

The Git diff endpoint reports tracked changes against HEAD and lists untracked paths in status; it does not pretend untracked file contents are included. Provider errors are redacted at the HTTP boundary. Gateway journals contain private prompts/tool output and must not be attached to public issues without review. Default replay is bounded; use the history endpoint and its pagination cursor when `resetRequired` is returned.

## Verification status

On 17 November 2026, the local Codex 0.169.0 adapter completed an authenticated handshake, an actual streamed no-tools response, history recovery through a newly started gateway/runtime, and an acknowledged real interruption. Seven isolated checks cover configured-root scope, fixed sandbox policy, no duplicate active turns, scoped one-use decisions, private journal persistence, replay/long-poll cancellation, HTTP authentication/origin restrictions, account-data redaction, active history/pending-decision recovery and immediate-stop readiness.

Those checks do not establish Android device acceptance, a Windows gateway consumer, arbitrary provider compatibility, agent file editing, cloud execution after host shutdown or remote-desktop capabilities. Phone/device workflow validation is a separate acceptance step. Provider-backed smoke checks require explicit `--turn`; CI uses only synthetic protocol checks and does not access any provider account.

When the runtime rejects history pagination as not yet supported during a live turn, `GET history` returns a bounded replay fallback with `replayOnly: true`, `historyIncomplete: true`, and `replayAfter: 0`, alongside the current session and scoped pending requests. Reconnect to events from zero and reconcile by item ID; the history array is not evidence of a complete empty conversation. This fallback applies only to the specific runtime unsupported-method response on the current live page. Transport failures, explicit older-page requests and completed-history failures remain errors.

## Repository inspection capability

`GET /v1/projects/:id/inspection` runs only the existing fixed Git status/branch/diff operations and reads HEAD. It returns the configured project ID, observation time, `readOnly: true`, and a SHA-256 digest of the returned diff. It does not start an agent turn or accept a command, filesystem path or destination URL. A digest identifies returned evidence; it is not a signature or a guarantee that a changing checkout is atomically snapshotted.

The optional private configuration fields `inspectionToken` and `inspectionProjects` issue a separate credential limited to GET inspections of explicitly listed project IDs. That credential cannot list sessions, start turns, access provider identity, or change files. Do not give the full coding credential to an inspection consumer.

`node gateway/host-link.mjs /private/host-link.json` maintains an owner-configured outbound SSH link using the existing SSH account. The owner-only JSON selects `sshTarget`, `localPort`, and `remotePort`; both forwarded TCP endpoints bind loopback. It reconnects with bounded backoff and stops on SIGTERM. An independently authenticated owned HTTPS service can consume that private endpoint; this is not public ingress, general host enrollment, or proof of operation after the execution host shuts down.

## Explicitly approved builds

The optional private launcher fields `buildToken` and `buildProjects` register a
separate purpose credential and an explicit configured-project allowlist. This
credential can access only `/v1/builds` operations; it cannot read provider identity,
list ordinary sessions, or use the inspection credential. No build capability is
enabled by default. The cloud consumer remains bound to its authorized user,
workspace and resource; a project name or URL alone is not authorization.

`POST /v1/builds` accepts `{reference, projectId, approvedPlan, planSha256}`. The UUID
and SHA-256 of the exact UTF-8 approved plan identify one execution. A new execution
creates a Git worktree at the configured repository's HEAD and reuses the existing
AgentGateway runtime with workspace-write sandbox and on-request approvals. Local
source changes are not copied into the worktree. Repeating a reference returns the
saved execution rather than starting a second model turn. A lost turn receipt is
unknown, never permission to submit another turn automatically.

`GET /v1/builds/{reference}?diff=1` returns `{build}` with status, runtime session,
actual pending requests, command outcomes, branch/base, and bounded diff evidence.
Untracked text files are included where supported; omitted or oversized material
sets `truncated`. SHA-256 identifies the returned excerpt, not a signature or proof
that a mutable checkout is atomically snapshotted. An over-limit Git operation
fails instead of reporting fabricated completion.

Explicit POST controls use `/{reference}/resume`, `/interrupt`, `/steer`,
`/approvals/{requestId}` and `/questions/{requestId}`, with the same current-turn and
one-use request checks as ordinary sessions. No decision is automatically accepted.
The adapter has no merge or publication operation; plan approval does not authorize
publishing, deployment, paid provisioning, or changes to external systems. Changes
remain in the isolated checkout for review. Runtime activity is not a guarantee of
correctness; inspect the actual diff and command results.

CONTINUUM owns the durable scoping meeting and exact plan approval. SLIPSTREAM owns
the actual workstream/task and execution receipt. STATION supplies only the approved
host checkout and existing runtime. A host restart can restore receipts and session
references; an uncertain active run needs explicit recovery. The connected host must
remain available. Closing a client does not stop it; shutting down the host does.

On 19 November 2026, one operator-initiated real CONTINUUM plan and exact approval
produced an actual STATION code change through SLIPSTREAM and the existing signed-in
Codex runtime. The returned diff hash matched, the requested syntax check passed,
and the primary checkout remained clean. The real result also rendered in the
mobile UI using read-only requests. This establishes the bounded backend workflow,
not native spoken dictation, phone-initiated approval, arbitrary project enrollment,
unattended permissions, or execution after host shutdown.
