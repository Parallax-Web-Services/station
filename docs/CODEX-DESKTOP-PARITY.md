# Station feature parity with Codex Desktop

Station has a credible Windows workspace foundation, but it is not yet a replacement for the daily coding-agent workflow. The largest gaps are the agent runtime/control loop, repository binding and diffs, execution trust, and reliable live continuity. More launcher polish will not close those gaps.

Audit date: **17 November 2026 UTC**. Station baseline: [`b0d8a58`](https://github.com/Parallax-Web-Services/station/commit/b0d8a58c855d5be697278bddfdfe62444a0a80d0). The baseline passed an independent Windows native smoke/restart build and [fresh-clone Windows CI](https://github.com/Parallax-Web-Services/station/actions/runs/44000888097). Those checks validate the existing client; they do not establish features marked missing below.

## Target and status

Documented Codex mode in the current desktop app, plus explicitly separated broader desktop capabilities. Official legacy Codex app links now redirect to ChatGPT desktop documentation. Availability varies by plan, rollout, permissions and OS; no exact installed desktop version is asserted.

This is a documented-capability comparison, not a hands-on certification of every Codex plan or platform. Local Codex CLI 0.169.0 was detected; that is not the desktop version. Related PARALLAX services were inspected to distinguish missing Station integrations from already existing backend concepts.

The inventory contains **38 capabilities: 1 present, 13 partial and 24 missing**. These are deliberately unweighted labels, not a completion percentage or schedule estimate.

P0 means required for a trustworthy first coding replacement; P1 means required for a useful daily desktop; P2 broadens operation; P3 is optional companion parity. Present means the bounded capability named in that row exists, not complete parity for its entire category. Partial and Missing always refer to Station, even when an existing service can supply part of the implementation.

## Recommended first coding replacement

Choose an authorized project checkout and execution target; start/resume one durable workstream; watch streamed messages, tools, changed files and tests; steer or stop it; inspect and approve a diff; create a commit/PR; close the UI; reconnect to the same execution state. This is the replacement gate. The cloud/phone demonstration adds a second gate once the first flow is reliable.

## Capability matrix

| Capability | Station | Priority | What is missing |
| --- | --- | --- | --- |
| [PARITY-01 Create and resume a coding session](#parity-01) | Partial | P0 | Session creation and a stable mapping among workstream, runtime session, checkout and target. |
| [PARITY-02 Live conversation and tool activity](#parity-02) | Missing | P0 | Typed event stream, reconnection/replay, command and file-change cards, visible run state. |
| [PARITY-03 Steer, queue and stop active work](#parity-03) | Missing | P0 | Service-level semantics for steering versus queued follow-up, acknowledged cancellation and child-process cleanup. |
| [PARITY-04 Local coding tools and verification loop](#parity-04) | Missing | P0 | Authorized local worker/runtime integration with durable command and file-change records. |
| [PARITY-05 Planning and goal lifecycle](#parity-05) | Missing | P1 | Goal-to-workstream contract, visible completion criteria, explicit pause/resume/blocked states. |
| [PARITY-06 Subagents and parallel agent runs](#parity-06) | Missing | P1 | Stable delegation relationships, activity aggregation, inherited permissions and conflict-aware execution isolation. |
| [PARITY-07 Open and bind a local repository](#parity-07) | Missing | P0 | Attach a trusted local root to a project/target, distinguish Windows versus WSL paths and persist that association. |
| [PARITY-08 Worktree isolation and handoff](#parity-08) | Missing | P1 | Worktree lifecycle tied to workstreams, dirty-tree protection and explicit merge/handoff recovery. |
| [PARITY-09 Review local diffs and files](#parity-09) | Missing | P0 | Contextual Changes surface with read-only diffs first, then reversible hunk operations and feedback. |
| [PARITY-10 Stage, commit, push and pull request](#parity-10) | Missing | P1 | Branch/change summary, stage/revert controls, commit and explicit consequential push/PR actions. |
| [PARITY-11 Pull request/code review workflow](#parity-11) | Missing | P1 | Reusable review capability with revision-qualified file and comment references. |
| [PARITY-12 Project setup and reusable actions](#parity-12) | Missing | P1 | Project-scoped actions with explicit target, working directory, permissions and failure output. |
| [PARITY-13 Agent sandbox and command approval](#parity-13) | Missing | P0 | OS-enforced agent filesystem/network/process policy plus scoped command approval and audit records. |
| [PARITY-14 Business-task decisions](#parity-14) | Partial | P0 | Generalize presentation to typed command/file/network decisions without weakening existing task approval. |
| [PARITY-15 Local, worktree and cloud target selection](#parity-15) | Partial | P0 | Explicit target capabilities, availability, workload/status and selected execution scope. |
| [PARITY-16 SSH and connected-host operation](#parity-16) | Missing | P2 | Authenticated host identity, target-specific permissions, connection lifecycle and auditable remote operations. |
| [PARITY-17 Provider sign-in and model selection](#parity-17) | Missing | P0 | Provider/runtime adapter with dedicated supported authentication, model discovery, reasoning settings and provenance. |
| [PARITY-18 Usage, context and cost visibility](#parity-18) | Missing | P1 | Expose measured usage and limits, distinguish estimates from billed data and persist execution budgets. |
| [PARITY-19 Project instructions and durable context](#parity-19) | Partial | P1 | Display loaded instructions, attached sources, provenance and user-editable durable context. |
| [PARITY-20 Attachments, file context and images](#parity-20) | Missing | P1 | Scoped attachment upload/selection, size/type limits, provenance and model-visible attachment receipts. |
| [PARITY-21 Context portability and migration](#parity-21) | Partial | P1 | User-controlled portable context import/export with completeness report, citations and account isolation. |
| [PARITY-22 Skills and MCP tools](#parity-22) | Missing | P1 | Capability discovery, explicit tool authorization, source/skill inspection, lifecycle and per-workspace configuration. |
| [PARITY-23 Resume server workstreams after restart](#parity-23) | Partial | P0 | Restore recent work with last-seen cursor, unsent drafts, active runs and recoverable presentation state. |
| [PARITY-24 Search, fork, archive and manage conversations](#parity-24) | Missing | P1 | Search across permitted conversations/resources, explicit zero-result/command help, thread operations and readable history. |
| [PARITY-25 Cloud and phone continuation](#parity-25) | Partial | P1 | Shared authorized workstream contract plus reconnect/notification/action semantics across Windows/web/mobile. |
| [PARITY-26 Notifications and activity inbox](#parity-26) | Missing | P1 | Event-backed unread state, scoped notifications, deep links and user preferences. |
| [PARITY-27 Scheduled recurring work](#parity-27) | Missing | P2 | Service-owned schedules with explicit target/lifetime, permissions, next run, failures and review. |
| [PARITY-28 WSL, PowerShell and terminal tabs](#parity-28) | Present | P1 | Broader terminal preference polish remains; existing native sessions should be preserved. |
| [PARITY-29 Project terminal context and agent access](#parity-29) | Partial | P0 | Verified working directory, target/session association and an explicit consented read/execute capability for agents. |
| [PARITY-30 Tabs, windows and keyboard workflow](#parity-30) | Partial | P1 | Consistent host-level navigation, history, shortcut settings and accessible focus restoration. |
| [PARITY-31 Side-by-side work and artifact review](#parity-31) | Missing | P1 | Split workstream/resource view with scoped previews and annotation-to-agent context. |
| [PARITY-32 Browser navigation and shared app sign-in](#parity-32) | Partial | P1 | Keep conventional browsing; add separately authorized agent browsing/inspection and scoped browser context. |
| [PARITY-33 Local computer-use and browser automation](#parity-33) | Missing | P2 | Explicitly approved app/browser automation with input/observation auditing, cancel and takeover controls. |
| [PARITY-34 Appearance, accessibility and preferences](#parity-34) | Partial | P2 | Readable contrast/scale controls, accessible composition surfaces and stable focus/menus. |
| [PARITY-35 Supported desktop operating systems](#parity-35) | Partial | P2 | Reuse contracts and packaged UI in platform-appropriate hosts; validate rather than rewrite the Windows shell. |
| [PARITY-36 Installer, updates and operational diagnostics](#parity-36) | Partial | P1 | Signed reproducible release pipeline, safe upgrades/rollback, version visibility and redacted diagnostic export. |
| [PARITY-37 Voice conversation and dictation](#parity-37) | Missing | P3 | Voice capability over existing workstreams with the same authorization, interruption and transcript provenance. |
| [PARITY-38 Companion features and rich creation tools](#parity-38) | Missing | P3 | Treat each as an optional capability; coding replacement should not depend on matching every companion feature. |

## Architecture and reuse

Keep Station as the client shell and SLIPSTREAM as the durable execution/workstream authority. Define a shared run/session event contract that Windows, web and mobile consume. Map workstreams to runtime sessions, targets, checkout/worktree roots, event cursors and approval receipts. Local tab IDs must never become run IDs.

For the quickest experimental coding adapter, evaluate the open-source **Codex App Server**, which exposes authentication, history, approvals and streamed events for custom clients. A plain model API alone does not supply the surrounding execution lifecycle. Put this behind a replaceable execution adapter so PARALLAX providers and workers remain viable. This is a proposed path, not an implemented integration. [Official custom-client interface](https://learn.chatgpt.com/docs/app-server), [open-source components](https://learn.chatgpt.com/docs/open-source).

Keep provider authentication separate from PARALLAX sign-in and use supported flows; a SLIPSTREAM device token is not a provider credential or subscription entitlement. [Authentication boundaries](https://learn.chatgpt.com/docs/auth).

Reuse audited SLIPSTREAM workstreams, cycles, conversations, worker events and task authorization; its model catalog, RepoContext and KitContext already cover some backend concerns. POSITRONIC has local archive/portable-context code, but Station does not expose it and deployment must be verified separately. NEBULA/NUCLEUS should supply authorized infrastructure discovery; ARCHER/FREIGHTER should supply installation/distribution. Do not build parallel task, context, machine or package databases simply to fill UI gaps.

General local agent access must remain separate from human terminals and embedded pages. Add enforced execution policy and typed tool approvals before exposing local tools to a model. A remote app gaining a native bridge would weaken the existing isolation. [Sandbox and approval separation](https://learn.chatgpt.com/docs/agent-approvals-security).

## Recommended delivery order

1. **Execution contract and trustworthy run view:** local repository/target binding, session creation/resume, streamed events with replay, steer/queue/stop, typed tool approvals and sandbox boundaries. Keep server-owned workstream identity.
2. **Review and delivery:** project-root terminals, changed files, contextual previews/diffs, tests, Git actions and explicit commit/push/PR workflow. Preserve the decision against a standalone Files app.
3. **Concurrent and continuous work:** isolated worktrees, conflict-aware handoff, recoverable layouts, attention inbox, notifications, goals/budgets and real cross-device continuation.
4. **Reusable ecosystem:** context provenance and portable imports, skills/MCP, configured project actions, authorized cloud/SSH targets, package installation and signed desktop releases.
5. **Broader parity:** alternate desktop hosts, computer use, voice, rich creation tools and optional companion experiences. Availability and user value should govern these, not a blanket copy of every desktop feature.

Avoid a calendar estimate until the worker/service contracts, supported provider/runtime adapter and ownership of each change are agreed. The client streaming/review work is substantial; execution semantics and sandboxing cannot be solved with frontend controls alone.

## Feature details and acceptance criteria

<a id="parity-01"></a>
### PARITY-01 Create and resume a coding session

**Partial · P0 · Agent workflow**

**Codex:** Project chats preserve ongoing work. [Official reference](https://learn.chatgpt.com/docs/projects).

**Station:** Can inspect existing SLIPSTREAM workstreams and send a direction; cannot start a general local coding session or bind one to an authorized checkout. [Client source](../windows/StationRuntime.cs#L195).

**Build next:** Session creation and a stable mapping among workstream, runtime session, checkout and target.

**Reuse:** SLIPSTREAM workstream/cycle/conversation identities; Station resource references.

**Acceptance:** Start from an authorized repository, close its tab, reopen and recover the same session.

<a id="parity-02"></a>
### PARITY-02 Live conversation and tool activity

**Missing · P0 · Agent workflow**

**Codex:** Runtime events support incremental agent and tool output. [Official reference](https://learn.chatgpt.com/docs/app-server).

**Station:** Conversation is rendered from fetched payloads; no streamed turn/item event consumer or replay cursor. [Client source](../windows/Assets/Shell/entry.jsx#L317).

**Build next:** Typed event stream, reconnection/replay, command and file-change cards, visible run state.

**Reuse:** SLIPSTREAM cycles, prompts, responses and worker events already exist.

**Acceptance:** See a real command start, output and finish without manual Refresh; reconnect without duplicated items.

<a id="parity-03"></a>
### PARITY-03 Steer, queue and stop active work

**Missing · P0 · Agent workflow**

**Codex:** Running work supports follow-up direction and interruption. [Official reference](https://learn.chatgpt.com/docs/app-server).

**Station:** Station only submits /agent; audited SLIPSTREAM askAgent rejects another prompt while a reply is in flight. No Station stop/steer transport. [Client source](../windows/StationRuntime.cs#L203).

**Build next:** Service-level semantics for steering versus queued follow-up, acknowledged cancellation and child-process cleanup.

**Reuse:** Extend existing workstream/cycle state rather than treating Send direction as a stop/steer operation.

**Acceptance:** Send a correction during an active command; receive an explicit steering receipt; stop and confirm execution actually ends.

<a id="parity-04"></a>
### PARITY-04 Local coding tools and verification loop

**Missing · P0 · Agent workflow**

**Codex:** Codex can operate in a selected local project. [Official reference](https://learn.chatgpt.com/docs/environments/modes).

**Station:** Human terminals run locally, while agent messages go to SLIPSTREAM. No agent tool host can safely read, patch, run and verify an authorized local checkout through Station. [Client source](../windows/StationRuntime.cs#L235).

**Build next:** Authorized local worker/runtime integration with durable command and file-change records.

**Reuse:** ConPTY is reusable for human terminals; audit existing SLIPSTREAM worker and sandbox contracts before extending execution.

**Acceptance:** An agent fixes a bounded local bug, runs the relevant check and presents the actual changed files.

<a id="parity-05"></a>
### PARITY-05 Planning and goal lifecycle

**Missing · P1 · Agent workflow**

**Codex:** Goal mode exposes persistent progress and pause/resume controls. [Official reference](https://learn.chatgpt.com/docs/long-running-work).

**Station:** Tasks/statuses are visible, but no plan/goal editor, goal budget or goal lifecycle in Station. [Client source](../windows/Assets/Shell/entry.jsx#L317).

**Build next:** Goal-to-workstream contract, visible completion criteria, explicit pause/resume/blocked states.

**Reuse:** SLIPSTREAM projects, tasks and cycles; CONTINUUM coordination.

**Acceptance:** Define a goal, inspect its plan, pause/resume and recover its state in another client.

<a id="parity-06"></a>
### PARITY-06 Subagents and parallel agent runs

**Missing · P1 · Agent workflow**

**Codex:** Subagent activity and conversations can be inspected. [Official reference](https://learn.chatgpt.com/docs/agent-configuration/subagents).

**Station:** Multiple workstreams can be opened, but there is no parent/child agent view or child steering controls. [Client source](../windows/Assets/Shell/entry.jsx#L345).

**Build next:** Stable delegation relationships, activity aggregation, inherited permissions and conflict-aware execution isolation.

**Reuse:** Audit SLIPSTREAM agent-session and workstream relationships.

**Acceptance:** Run two isolated subtasks, inspect each result and permissions, and return to their parent workstream.

<a id="parity-07"></a>
### PARITY-07 Open and bind a local repository

**Missing · P0 · Repositories**

**Codex:** Local projects attach to folders. [Official reference](https://learn.chatgpt.com/docs/projects).

**Station:** Projects are service records; repository URLs are links. No local root picker, clone flow or verified path binding. [Client source](../windows/Assets/Shell/entry.jsx#L346).

**Build next:** Attach a trusted local root to a project/target, distinguish Windows versus WSL paths and persist that association.

**Reuse:** Existing project repository metadata and qualified resource identity.

**Acceptance:** Open a project and identify the exact checkout/branch/root before any local agent operation.

<a id="parity-08"></a>
### PARITY-08 Worktree isolation and handoff

**Missing · P1 · Repositories**

**Codex:** Parallel chats can use isolated Git worktrees and hand work back to Local. [Official reference](https://learn.chatgpt.com/docs/environments/git-worktrees).

**Station:** No worktree creation, branch selection, cleanup or handoff implementation. [Client source](../windows/StationRuntime.cs).

**Build next:** Worktree lifecycle tied to workstreams, dirty-tree protection and explicit merge/handoff recovery.

**Reuse:** Use Git and the existing execution target; do not create a second task database.

**Acceptance:** Run two changes in one repository without collisions and safely hand one back to the main checkout.

<a id="parity-09"></a>
### PARITY-09 Review local diffs and files

**Missing · P0 · Repositories**

**Codex:** Built-in Git controls include a diff pane and inline feedback. [Official reference](https://learn.chatgpt.com/docs/environments/local-environment).

**Station:** No changed-file list, text/code viewer, hunk diff or inline review comments. [Client source](../windows/Assets/Shell/entry.jsx#L346).

**Build next:** Contextual Changes surface with read-only diffs first, then reversible hunk operations and feedback.

**Reuse:** Workstream resources and repository metadata; preserve the decision to avoid a standalone Files app.

**Acceptance:** Select a changed file, inspect its diff, cite a line and request a targeted correction without opening another app.

<a id="parity-10"></a>
### PARITY-10 Stage, commit, push and pull request

**Missing · P1 · Repositories**

**Codex:** Desktop Git actions cover staging/reverting, commits, pushes and PR creation. [Official reference](https://learn.chatgpt.com/docs/environments/local-environment).

**Station:** A user can type Git commands in a terminal; Station has no Git state/actions or remote-provider integration. [Client source](../windows/Assets/Shell/entry.jsx#L348).

**Build next:** Branch/change summary, stage/revert controls, commit and explicit consequential push/PR actions.

**Reuse:** Git CLI/library and existing GitHub/GitLab account contracts.

**Acceptance:** Review, stage and commit selected changes, then explicitly push and open a PR with correct repository context.

<a id="parity-11"></a>
### PARITY-11 Pull request/code review workflow

**Missing · P1 · Repositories**

**Codex:** Code Review surfaces PR changes, feedback and checks. [Official reference](https://learn.chatgpt.com/docs/code-review).

**Station:** Repository URLs open as websites; no native PR/MR details, findings, comment resolution or checks. [Client source](../windows/Assets/Shell/entry.jsx#L346).

**Build next:** Reusable review capability with revision-qualified file and comment references.

**Reuse:** Existing source-host integrations in the ecosystem, after contract audit.

**Acceptance:** Open an authorized PR, inspect a finding against the right revision and navigate to its changed file.

<a id="parity-12"></a>
### PARITY-12 Project setup and reusable actions

**Missing · P1 · Repositories**

**Codex:** Local environments define worktree setup and terminal actions. [Official reference](https://learn.chatgpt.com/docs/environments/local-environment).

**Station:** No project action registry, setup lifecycle, environment selection or run/build shortcuts. [Client source](../windows/StationRuntime.cs#L308).

**Build next:** Project-scoped actions with explicit target, working directory, permissions and failure output.

**Reuse:** Existing repository definitions and ARCHER installation/preflight contracts.

**Acceptance:** Run a declared build in the correct checkout; new worktrees receive their required setup.

<a id="parity-13"></a>
### PARITY-13 Agent sandbox and command approval

**Missing · P0 · Execution and trust**

**Codex:** Agent execution separates enforced sandbox boundaries from approval policy. [Official reference](https://learn.chatgpt.com/docs/agent-approvals-security).

**Station:** Remote pages lack the native bridge and service approvals exist, but human ConPTY sessions are not an agent sandbox. [Client source](../windows/PtySession.cs).

**Build next:** OS-enforced agent filesystem/network/process policy plus scoped command approval and audit records.

**Reuse:** Existing worker isolation and, optionally, an established agent runtime sandbox.

**Acceptance:** A local agent can edit its authorized checkout but a denied outside write/network request remains blocked.

<a id="parity-14"></a>
### PARITY-14 Business-task decisions

**Partial · P0 · Execution and trust**

**Codex:** Agent workflows expose explicit approvals. [Official reference](https://learn.chatgpt.com/docs/agent-approvals-security).

**Station:** Station has one-use confirmation challenges for SLIPSTREAM task approve/reject, with service authorization. [Client source](../windows/StationRuntime.cs#L217).

**Build next:** Generalize presentation to typed command/file/network decisions without weakening existing task approval.

**Reuse:** Existing approval.prepare/commit and service task authorization.

**Acceptance:** A decision shows exact resource, target and consequence, can be denied and cannot be replayed.

<a id="parity-15"></a>
### PARITY-15 Local, worktree and cloud target selection

**Partial · P0 · Execution and trust**

**Codex:** Codex distinguishes Local, Worktree and Cloud execution. [Official reference](https://learn.chatgpt.com/docs/environments/modes).

**Station:** Local human shells and service cycles are distinguished, but Infrastructure has no authorized target selector or resource inventory. [Client source](../windows/Assets/Shell/entry.jsx#L439).

**Build next:** Explicit target capabilities, availability, workload/status and selected execution scope.

**Reuse:** NEBULA/NUCLEUS inventory and SLIPSTREAM execution targets; no inferred remote shell from a URL.

**Acceptance:** Choose a permitted target before running; an unavailable cloud target cannot silently become local execution.

<a id="parity-16"></a>
### PARITY-16 SSH and connected-host operation

**Missing · P2 · Execution and trust**

**Codex:** Desktop projects can use SSH hosts; remote clients can reach connected computers. [Official reference](https://learn.chatgpt.com/docs/remote-connections).

**Station:** No SSH connection management, host trust/pairing, remote file/command transport or disconnect recovery. [Client source](../windows/Assets/Shell/entry.jsx#L445).

**Build next:** Authenticated host identity, target-specific permissions, connection lifecycle and auditable remote operations.

**Reuse:** Existing machine/fabric contracts in NUCLEUS and network identity in NEBULA.

**Acceptance:** Reconnect to an authorized host and resume the same workstream without copying broad credentials into the shell.

<a id="parity-17"></a>
### PARITY-17 Provider sign-in and model selection

**Missing · P0 · Models and context**

**Codex:** Codex supports ChatGPT/API-key sign-in and model-dependent settings. [Official reference](https://learn.chatgpt.com/docs/auth).

**Station:** Station authenticates PARALLAX services, not an AI provider. Model choice is not exposed in Station; SLIPSTREAM already resolves a team model on the server. [Client source](../windows/StationRuntime.cs#L128).

**Build next:** Provider/runtime adapter with dedicated supported authentication, model discovery, reasoning settings and provenance.

**Reuse:** SLIPSTREAM AiModelCatalog; never pass NEXUS/device credentials to model providers.

**Acceptance:** Choose an available model/runtime, see which account funds execution and preserve that choice with the session.

<a id="parity-18"></a>
### PARITY-18 Usage, context and cost visibility

**Missing · P1 · Models and context**

**Codex:** Desktop settings provide token activity; model limits/settings vary. [Official reference](https://learn.chatgpt.com/docs/reference/settings).

**Station:** No token/context meter, rate-limit state, estimated cost or enforceable workstream budget UI. [Client source](../windows/Assets/Shell/entry.jsx#L345).

**Build next:** Expose measured usage and limits, distinguish estimates from billed data and persist execution budgets.

**Reuse:** Existing cycle/driver identity; audit provider usage and QUARK financial contracts before adding accounting.

**Acceptance:** A run reports measured usage and a budget stop is enforced by execution infrastructure.

<a id="parity-19"></a>
### PARITY-19 Project instructions and durable context

**Partial · P1 · Models and context**

**Codex:** Project guidance, memories and skills carry reusable context. [Official reference](https://learn.chatgpt.com/docs/customization/overview).

**Station:** Stable service workstreams exist, but Station has no instruction source viewer, AGENTS hierarchy, context-source selection or memory controls. [Client source](../windows/Assets/Shell/entry.jsx#L317).

**Build next:** Display loaded instructions, attached sources, provenance and user-editable durable context.

**Reuse:** POSITRONIC Context Kits; existing SLIPSTREAM RepoContext, KitContext and discovery readers.

**Acceptance:** Inspect exactly which instructions/context sources a run used; update project guidance without losing workstream identity.

<a id="parity-20"></a>
### PARITY-20 Attachments, file context and images

**Missing · P1 · Models and context**

**Codex:** Desktop workflows accept files and expose generated-file review. [Official reference](https://learn.chatgpt.com/docs/artifacts-viewer).

**Station:** Direction input accepts text only; no authorized attachment/source-picker pipeline. [Client source](../windows/Assets/Shell/entry.jsx#L343).

**Build next:** Scoped attachment upload/selection, size/type limits, provenance and model-visible attachment receipts.

**Reuse:** POSITRONIC sources and workstream resource contracts.

**Acceptance:** Attach an authorized image/document and confirm it is available to the correct run without exposing another workspace.

<a id="parity-21"></a>
### PARITY-21 Context portability and migration

**Partial · P1 · Models and context**

**Codex:** Stored runtime threads can be resumed and forked. [Official reference](https://learn.chatgpt.com/docs/app-server).

**Station:** No Station import/export UI. Related POSITRONIC archive/portable-bundle and SLIPSTREAM Context Kit code exists locally, but this client does not integrate it. [Client source](../windows/Assets/Shell/entry.jsx#L317).

**Build next:** User-controlled portable context import/export with completeness report, citations and account isolation.

**Reuse:** POSITRONIC ArchiveVault/PortableBundle/ChatGptArchive and SLIPSTREAM KitContext; deployment remains separate.

**Acceptance:** Import a supported user-owned export, inspect what was/was not included, attach a Kit and re-export visible context. Hidden reasoning and inaccessible provider state are not exportable guarantees.

<a id="parity-22"></a>
### PARITY-22 Skills and MCP tools

**Missing · P1 · Extensibility**

**Codex:** Skills and MCP connections extend agent capabilities. [Official reference](https://learn.chatgpt.com/docs/extend/mcp).

**Station:** App catalog links are navigation contributions, not an installed agent-tool/skill registry. [Client source](../shared/core/resources/ecosystem.json).

**Build next:** Capability discovery, explicit tool authorization, source/skill inspection, lifecycle and per-workspace configuration.

**Reuse:** ARCHER/FREIGHTER installation/distribution and existing runtime tool contracts; reuse established MCP protocols.

**Acceptance:** Install a scoped capability, invoke an authorized tool, inspect its result and revoke it without affecting other workspaces.

<a id="parity-23"></a>
### PARITY-23 Resume server workstreams after restart

**Partial · P0 · Continuity**

**Codex:** Projects/chats support ongoing work and history. [Official reference](https://learn.chatgpt.com/docs/projects).

**Station:** Workstreams use stable server IDs; local visits and encrypted drafts persist. Open tab layout/history is not restored, and event freshness/replay is incomplete. [Client source](../windows/WorkspaceContext.cs).

**Build next:** Restore recent work with last-seen cursor, unsent drafts, active runs and recoverable presentation state.

**Reuse:** WorkspaceStore visits/review markers, WorkstreamDrafts and service cycle/event history.

**Acceptance:** Restart the client during a remote run and see current progress plus what changed since the previous session.

<a id="parity-24"></a>
### PARITY-24 Search, fork, archive and manage conversations

**Missing · P1 · Continuity**

**Codex:** Desktop commands expose chat search, archive, rename and side chats. [Official reference](https://learn.chatgpt.com/docs/reference/commands).

**Station:** Home filters current workstream names and handles a small command set. No conversation search/history management or branch-from-turn UI. [Client source](../windows/Assets/Shell/entry.jsx#L264).

**Build next:** Search across permitted conversations/resources, explicit zero-result/command help, thread operations and readable history.

**Reuse:** Service workstream/conversation ownership and permission scopes.

**Acceptance:** Find an old conversation, inspect it, branch with explicit context and archive a client-visible item safely.

<a id="parity-25"></a>
### PARITY-25 Cloud and phone continuation

**Partial · P1 · Continuity**

**Codex:** Cloud tasks and connected-host mobile control have distinct lifetimes. [Official reference](https://learn.chatgpt.com/docs/remote-connections).

**Station:** SLIPSTREAM owns durable work; Station does not cancel cloud work on close. Full close-desktop/reopen-phone/action acceptance is not complete; no Station phone client is shipped here. [Client source](../windows/StationRuntime.cs#L203).

**Build next:** Shared authorized workstream contract plus reconnect/notification/action semantics across Windows/web/mobile.

**Reuse:** Existing SLIPSTREAM APIs/mobile clients and execution workers.

**Acceptance:** Close Station while cloud work runs, open that workstream from a phone and take the next permitted action; local shells must not be presented as cloud-resident.

<a id="parity-26"></a>
### PARITY-26 Notifications and activity inbox

**Missing · P1 · Continuity**

**Codex:** Desktop notifications distinguish completion, permissions and questions; Activity tracks attention. [Official reference](https://learn.chatgpt.com/docs/notifications).

**Station:** Home attention cards require visiting/refetching; no Windows toast channel or persistent cross-workstream unread inbox. [Client source](../windows/Assets/Shell/entry.jsx#L270).

**Build next:** Event-backed unread state, scoped notifications, deep links and user preferences.

**Reuse:** SLIPSTREAM attention/events; PLEXUS/KLAXON contracts where available.

**Acceptance:** A background decision produces one notification that opens the exact workstream and is marked read consistently.

<a id="parity-27"></a>
### PARITY-27 Scheduled recurring work

**Missing · P2 · Continuity**

**Codex:** Scheduled tasks expose runs and pause/resume; local tasks need an awake app/host. [Official reference](https://learn.chatgpt.com/docs/automations).

**Station:** No schedule editor, scheduler capability or recent scheduled-run view in Station. [Client source](../windows/StationRuntime.cs).

**Build next:** Service-owned schedules with explicit target/lifetime, permissions, next run, failures and review.

**Reuse:** Audit SLIPSTREAM scheduling/execution and CONTINUUM coordination before adding a new scheduler.

**Acceptance:** Schedule on cloud infrastructure, close the client and later inspect the resulting run and its permissions.

<a id="parity-28"></a>
### PARITY-28 WSL, PowerShell and terminal tabs

**Present · P1 · Native workspace**

**Codex:** Windows desktop supports selectable terminal profiles. [Official reference](https://learn.chatgpt.com/docs/windows/windows-app).

**Station:** Real ConPTY sessions, WSL default, PowerShell/CMD, independent tabs, Ubuntu styling and process-preserving pop-out. [Client source](../windows/TerminalProfile.cs).

**Build next:** Broader terminal preference polish remains; existing native sessions should be preserved.

**Reuse:** Current terminal host and xterm assets.

**Acceptance:** Create both WSL and PowerShell sessions; switch and detach without changing process, working directory or output.

<a id="parity-29"></a>
### PARITY-29 Project terminal context and agent access

**Partial · P0 · Native workspace**

**Codex:** Chat terminals are project/worktree scoped and their output can inform the agent. [Official reference](https://learn.chatgpt.com/docs/integrated-terminal).

**Station:** Station terminals are scoped to an organization, start at home and are not bound to a project/workstream or authorized as agent tools. [Client source](../windows/Assets/Shell/entry.jsx#L358).

**Build next:** Verified working directory, target/session association and an explicit consented read/execute capability for agents.

**Reuse:** Existing ConPTY sessions and workstream resource identity.

**Acceptance:** A project terminal starts in its authorized root, shows the exact target and contributes output only to the permitted agent session.

<a id="parity-30"></a>
### PARITY-30 Tabs, windows and keyboard workflow

**Partial · P1 · Native workspace**

**Codex:** Desktop commands cover tab recovery, navigation, layouts and configurable bindings. [Official reference](https://learn.chatgpt.com/docs/reference/commands).

**Station:** Station has tabs, middle-click close, detach and some shortcuts. No reopen-closed tab, layout restoration, general palette or customizable bindings; embedded-focus keyboard parity needs validation. [Client source](../windows/StationWebHost.cs#L161).

**Build next:** Consistent host-level navigation, history, shortcut settings and accessible focus restoration.

**Reuse:** Existing shell tab model and native shortcut boundary.

**Acceptance:** Navigate between chat/diff/terminal with keyboard from any surface, recover a closed tab and reopen the previous layout.

<a id="parity-31"></a>
### PARITY-31 Side-by-side work and artifact review

**Missing · P1 · Native workspace**

**Codex:** Desktop previews files alongside chat and supports annotations. [Official reference](https://learn.chatgpt.com/docs/artifacts-viewer).

**Station:** One main active surface at a time; no contextual code/document/PDF/image inspector or visual annotation channel. [Client source](../windows/Assets/Shell/entry.jsx).

**Build next:** Split workstream/resource view with scoped previews and annotation-to-agent context.

**Reuse:** Existing tab host and resource references. Do not recreate a standalone Files launcher.

**Acceptance:** Review a diff or deliverable beside the conversation and send selected lines/regions as a precise request.

<a id="parity-32"></a>
### PARITY-32 Browser navigation and shared app sign-in

**Partial · P1 · Native workspace**

**Codex:** Desktop browser has shared-view workflows and browser preferences. [Official reference](https://learn.chatgpt.com/docs/browser).

**Station:** Back/forward/reload, favicons, popups, per-context profiles, default-browser handoff and first-party sign-in work. No agent browser-control protocol or annotation/history-search UI. [Client source](../windows/StationWebHost.cs).

**Build next:** Keep conventional browsing; add separately authorized agent browsing/inspection and scoped browser context.

**Reuse:** Current WebView2 isolation and browser preference contracts.

**Acceptance:** A user can inspect a page with an agent while a remote site remains unable to access native tools.

<a id="parity-33"></a>
### PARITY-33 Local computer-use and browser automation

**Missing · P2 · Native workspace**

**Codex:** Supported desktop clients can control explicitly approved graphical applications. [Official reference](https://learn.chatgpt.com/docs/computer-use).

**Station:** QA automation used during development is external tooling, not a shipped Station capability. No agent computer-use consent/driver or browser extension exists. [Client source](../windows/StationWebHost.cs).

**Build next:** Explicitly approved app/browser automation with input/observation auditing, cancel and takeover controls.

**Reuse:** Audit existing machine/agent capabilities; do not expose arbitrary OS control to embedded pages.

**Acceptance:** Approve one app, reproduce a bounded UI flow, cancel it and demonstrate another app remains inaccessible.

<a id="parity-34"></a>
### PARITY-34 Appearance, accessibility and preferences

**Partial · P2 · Native workspace**

**Codex:** Desktop settings include themes, fonts and shortcut preferences. [Official reference](https://learn.chatgpt.com/docs/reference/settings).

**Station:** Approved theme, resizable sidebar and browser settings exist. Broad theming, font scaling and accessibility/screen-reader verification are incomplete. [Client source](../windows/Assets/Shell/station.css).

**Build next:** Readable contrast/scale controls, accessible composition surfaces and stable focus/menus.

**Reuse:** Existing Helm tokens and WPF DPI handling.

**Acceptance:** Operate essential workflows by keyboard/screen reader and at 100/125/150/200 percent scaling without clipped actions.

<a id="parity-35"></a>
### PARITY-35 Supported desktop operating systems

**Partial · P2 · Distribution**

**Codex:** Current desktop documentation includes macOS, Windows and Linux. [Official reference](https://learn.chatgpt.com/docs/app).

**Station:** The shipped host is Windows-only; shared service/client architecture is a foundation, not implemented alternate native hosts. [Client source](../windows/Parallax.Station.Windows.csproj).

**Build next:** Reuse contracts and packaged UI in platform-appropriate hosts; validate rather than rewrite the Windows shell.

**Reuse:** React presentation and separable StationRuntime/service contracts.

**Acceptance:** Build/install and complete the same core workstream workflow on each declared supported OS.

<a id="parity-36"></a>
### PARITY-36 Installer, updates and operational diagnostics

**Partial · P1 · Distribution**

**Codex:** Codex desktop has documented installation and managed deployment paths. [Official reference](https://learn.chatgpt.com/docs/windows/windows-app).

**Station:** Public source, locked build, CI and Start menu script exist. No signed installer, automatic updater, release channel or end-user recovery/support bundle. [Client source](../windows/build.ps1).

**Build next:** Signed reproducible release pipeline, safe upgrades/rollback, version visibility and redacted diagnostic export.

**Reuse:** Existing native build, diagnostic checks and FREIGHTER/ARCHER contracts.

**Acceptance:** Install on a clean machine, update without losing state, verify publisher and export diagnostics without credentials.

<a id="parity-37"></a>
### PARITY-37 Voice conversation and dictation

**Missing · P3 · Broader desktop**

**Codex:** Voice can coordinate tasks where supported, with rollout/plan/platform conditions. [Official reference](https://learn.chatgpt.com/docs/features/voice).

**Station:** No microphone/transcription/live voice session or speech-driven workstream control. [Client source](../windows/Assets/Shell/entry.jsx#L343).

**Build next:** Voice capability over existing workstreams with the same authorization, interruption and transcript provenance.

**Reuse:** Future CONTINUUM coordination and supported speech-provider contracts.

**Acceptance:** Talk to an existing workstream, inspect the resulting direction and interrupt speech/execution predictably.

<a id="parity-38"></a>
### PARITY-38 Companion features and rich creation tools

**Missing · P3 · Broader desktop**

**Codex:** Optional desktop capabilities include pets, interactive visuals and image workflows. [Official reference](https://learn.chatgpt.com/docs/features).

**Station:** No pet/companion, image generation, composer prediction or interactive artifact generation capability is shipped. [Client source](../shared/core/resources/ecosystem.json).

**Build next:** Treat each as an optional capability; coding replacement should not depend on matching every companion feature.

**Reuse:** Consistent capability model and existing PARALLAX products as their integrations mature.

**Acceptance:** Install a separately scoped capability and produce a reviewable artifact without bloating the default shell.

## Product boundaries to preserve

- Keep organizations as folders and workstreams durable; tabs remain presentation.
- Keep approved logos and uppercase product display names.
- Keep WSL as the default human terminal and retain PowerShell.
- Keep authentication in the default browser and first-party shared sign-in scoped by organization.
- Add contextual project/resource review rather than resurrecting a standalone Files launcher.
- Agent access to local tools, accounts and remote targets must be explicit and auditable.
- Context export can cover accessible user data and declared instructions, not inaccessible provider state or hidden reasoning.
- Cloud execution must not rely on a desktop window remaining open; a local terminal naturally depends on its host.

## Source scope

Official references were opened on the audit date, including the desktop overview, Windows guide, environment/worktree documentation, app-server protocol and current changelog. Sources describe supported surfaces with rollout/plan conditions. The comparison does not infer a desktop feature merely because a similarly named CLI flag exists.

The structured matrix is available as [CODEX-DESKTOP-PARITY.json](CODEX-DESKTOP-PARITY.json). No private workspace captures, credentials or production customer content are included.
