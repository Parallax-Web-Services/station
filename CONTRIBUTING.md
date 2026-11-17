# Contributing

Discuss significant workflow, security-boundary or service-contract changes in an issue before implementation. Preserve approved visual assets and existing native capabilities. Prefer a small end-to-end improvement over a parallel subsystem or shell rewrite.

Use Node 22+ and the .NET 8 Windows desktop SDK. Run `npm ci`, `npm run check:source`, `npm run build:shell`, and `windows\build.ps1`. Run `-SmokeTest` on Windows with WSL for native behavior changes. Include visible UI evidence for interaction/layout changes using synthetic or redacted data.

Keep generated shell assets, source provenance and dependency notices in sync. Shared Core/Helm snapshots live under `shared/`; document substantive changes there so they can be reconciled with their upstream repositories. Do not add hidden dependencies on neighboring checkouts.

Never commit credentials, device codes, browser profiles, environment backups, real workspace journals, customer activity, terminal output or live-account captures. Test fixtures must be visibly isolated from normal operation. Service writes and consequential actions require the existing authorization and approval boundaries; no remote app may receive the native bridge.

Contributions to Station code are made under the repository's MIT license. Third-party licenses and brand ownership must be preserved. This repository's origin is `git@github.com:Parallax-Web-Services/station.git`.
