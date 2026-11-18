# Optional Windows desktop view prototype

This companion proves authenticated, selected-monitor viewing from an interactive Windows session. It is not a remote-control implementation or an unattended desktop service. The normal Station client does not depend on it.

## Build and run

On Windows with the .NET 8 SDK:

```powershell
./windows/DesktopViewHost/build.ps1
./artifacts/desktop-view-host/Parallax.Station.DesktopViewHost.exe
```

The framework-dependent executable needs the .NET 8 Windows Desktop and ASP.NET Core runtimes. It opens a minimized status window; closing it or choosing Stop ends viewing. It does not install a service, enable startup, change firewall rules, enable RDP, or modify Chrome Remote Desktop.

The companion listens only on Windows loopback port 8760. A dedicated credential is kept in Windows Credential Manager. Private connection information is written to `%LOCALAPPDATA%\Parallax\Station\DesktopView\pairing.json`, inside a directory restricted to the current Windows user. Treat that file as a secret. Never commit it, send it to telemetry, or reuse a coding or workspace authentication token.

## Read-only API

Except for `GET /health`, requests require `Authorization: Bearer <dedicated credential>`.

- `GET /v1/desktop`: host identity, layout revision, monitor identities, physical bounds and scale; explicit capability flags.
- `GET /v1/frame?monitorId=...&revision=...&maxWidth=960`: a selected-monitor JPEG data URL with physical bounds and capture time. Width is limited to 320–1920.

Refresh inventory on HTTP 409 (changed layout). HTTP 423 means the interactive desktop is unavailable; do not imply access to a locked or secure desktop. Capture concurrency is bounded; 429 means try a later frame. Responses are not cached. No frame files or request logs are written. The API has no input, clipboard, file-transfer or arbitrary proxy endpoint.

## Development phone transport from WSL

When an existing trusted Android ADB connection runs inside WSL, its reverse port targets WSL loopback rather than Windows loopback. The optional relay bridges that boundary over a child PowerShell process's standard input/output; it opens no Windows network listener beyond the companion's loopback listener.

Copy the private connection JSON into an owner-only WSL file (mode 600), then run:

```sh
node desktop/loopback-relay.mjs /private/path/desktop-view-connection.json 'D:\path\to\station\desktop\windows-loopback-bridge.ps1'
```

The relay listens on WSL `127.0.0.1:8760`. The Android client must use the loopback family actually served by its ADB reverse listener. On the tested Pixel, `http://[::1]:8760` worked while `http://127.0.0.1:8760` timed out before reaching WSL. This does not require changing the WSL listener to IPv6 or exposing it to the network. The mobile development build must explicitly permit that loopback HTTP origin; do not broaden production cleartext policy. The device owner can configure `adb reverse tcp:8760 tcp:8760` over their already authorized ADB connection. This is a development transport, not production pairing or cross-network access. Client storage must protect the dedicated credential. Do not place credentials in URLs.

The relay authenticates the client and permits only the view routes. Its bridge compares the configured credential fingerprint against the current Windows credential before forwarding; an old connection file cannot silently acquire a rotated credential. Restart the relay with an updated private connection file after rotation. No credential rotation UI is supplied yet.

## Verified scope and remaining work

Native checks verified actual JPEG frames from two monitors, including a negative desktop origin and mixed 100%/125% scaling; unauthorized, stale-layout, unknown-monitor, invalid-size and non-GET requests were rejected. A real companion restart preserved the host identity, monitor identities and credential. Both monitor frames remained accessible through the WSL relay afterward. Frames were inspected in memory without saving customer screenshots.

These checks do not establish phone UI acceptance, two separate hosts, low-latency streaming, keyboard or pointer control, secure-desktop access, clipboard transfer, unattended access, production pairing, credential revocation UI, or cloud continuity. A second computer's identity and authorized access still need verification. See [the remote desktop contract](REMOTE-DESKTOP-CONTRACT.md) for the intended session and authorization model.

## Repeatable transport check

Run `node scripts/check-desktop-view.mjs /private/path/desktop-view-connection.json` against an already running companion. For the WSL relay, optionally pass `http://127.0.0.1:8760` as the second argument. The check fetches every available monitor into memory, verifies JPEG framing and host/monitor/layout association, and checks authentication, origin rejection, stale geometry and the absence of input methods. It prints only dimensions, scaling and pass/fail results. It does not save screenshots or prove phone UI acceptance, lock-screen behavior or interactive control.
