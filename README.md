# PARALLAX STATION

An open-source workspace client for **PARALLAX**, the Business Operations AI.

One workspace for organizations, projects, workstreams, applications and execution environments. A workstream has a durable service identity; a tab is its presentation surface.

The current implementation runs on **Windows**, using a native .NET/WPF host and a packaged React interface. WebView2 hosts the local shell and independently isolated application surfaces. Native ConPTY sessions provide WSL, PowerShell and Command Prompt terminals. This is an evolving operational client, not a completed cross-platform release.

## Build on Windows

Requirements: Node.js 22 or newer with npm, the .NET 8 Windows desktop SDK, and Microsoft Edge WebView2 Runtime. WSL is optional for everyday use, but required by the full native smoke suite.

```powershell
git clone git@github.com:Parallax-Web-Services/station.git
cd station
npm ci
npm run check:source
npm run build:shell
.\windows\build.ps1 -Run
```

The executable is written to `artifacts\app\Parallax.Station.exe`. Register the current user's Start menu shortcut with:

```powershell
.\windows\register-start-menu.ps1
```

The committed shell assets also allow a native-only build with `windows\build.ps1` when Node is unavailable. Rebuild the shell after changing React, shared UI sources, catalog or styling.

## Connect

Use **Connect SLIPSTREAM** to open sign-in in your default browser. Paste the one-use device code into Station. Device credentials stay in Windows Credential Manager; remote pages receive no native terminal, credential or operating-system bridge.

The public source does not grant access to hosted PARALLAX services. Organizational access and execution permissions are enforced by the connected services. Shared app sign-in requires compatible NEXUS/SLIPSTREAM services; see [the sign-in contract](windows/SHARED-SIGN-IN.md).

## Available today

- Organization folders containing projects, tasks and subtasks exposed by the connected service.
- Real SLIPSTREAM workstreams, activity, attention items and approval flows.
- Context-isolated tabs, pop-out windows, favicons and browser handoff preferences.
- WSL by default, with Ubuntu presentation, PowerShell and independent terminal tabs.
- Infrastructure surface for local telemetry and NEBULA/NUCLEUS entry points.
- Local pins, recency and review markers; encrypted device-local workstream drafts.
- Existing shared Core application grid and Helm shell, included as auditable source snapshots.

## Current limits

See the [Codex Desktop feature parity audit](docs/CODEX-DESKTOP-PARITY.md) for the capability matrix, missing workflows and acceptance criteria.

Windows is the only implemented desktop host. Mobile/web continuity, aggregated cloud resources, general CONTINUUM conversation, broad workspace search, provider/model integration, installer signing and automatic updates remain incomplete. Project task/subtask creation requires the corresponding service hierarchy API. Local terminals close with Station; cloud execution is owned by the execution service. Drafts do not sync between devices.

## Connected-host coding gateway

An optional [shared agent gateway](docs/AGENT-GATEWAY.md) exposes configured project roots, persisted runtime sessions, live replayable activity, steering, interruption, one-use decisions and read-only Git diffs. It uses a replaceable Codex App Server adapter; the existing SLIPSTREAM service remains the business workstream authority.

Run `npm run test:gateway` for isolated protocol/security checks. `node scripts/check-gateway-runtime.mjs` checks the installed host runtime without starting a model turn; add `--turn` only to explicitly run bounded provider-backed stream/restart/interrupt verification using the host's supported sign-in.

The gateway requires its own private bearer credential and a host-owner root allowlist. It is loopback-only without TLS; Android can use an explicitly configured ADB reverse tunnel. See the contract for setup and security boundaries. Running it independently keeps execution alive when a UI closes, but the host must stay awake. This is not proof that a local session continues after the host stops, or that a signed desktop/mobile release has shipped.

## Structure

| Path | Purpose |
| --- | --- |
| `windows/` | Native host, service adapter, packaged React shell, runtime assets and diagnostic checks |
| `shared/core/` | Extracted shared catalog, launcher and approved artwork |
| `shared/helm/` | Extracted Helm shell and design tokens |
| `shared/ecosystem/` | Packaged ecosystem reference surface |
| `scripts/` | Standalone frontend build and publication checks |
| `docs/` | Architecture and validation boundaries |

These shared sources are snapshots, not alternative workspace or execution backends. No sibling repository, private npm registry, production credential or local account state is needed to compile Station. [Source provenance](shared/PROVENANCE.json) records the extraction; rebuild provenance and dependency notices ship with the app.

## Validation

```powershell
npm run check:source
npm run build:shell
.\windows\build.ps1 -SmokeTest
```

The native suite uses isolated local state and synthetic contract data, exercises real Windows terminals and WebViews, and verifies restart persistence. Its evidence is generated under `artifacts\evidence` and excluded from Git. It is not proof of a live cloud executor or phone handoff. Production account diagnostics are opt-in and must never be attached publicly without review.

## License and contributions

Station-authored code is [MIT licensed](LICENSE). Included dependencies retain their licenses under `windows/ThirdParty`. Product artwork and trademarks have [separate branding terms](BRANDING.md). The extracted Core code files in this repository are released under MIT; this does not change licensing of the rest of the Core repository.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). This is source availability for an actively developed client; no signed stable binary release is promised yet.

## Optional desktop viewing prototype

The separate [Windows desktop view companion](docs/DESKTOP-VIEW-PROTOTYPE.md) provides authenticated, loopback-only selected-monitor JPEG frames. Native two-monitor capture and reconnect were verified. The accepted transport is view-only. A separate disabled-by-default control-lease prototype is documented, with inconsistent native input delivery still unresolved; unattended access and a second host remain unverified.
