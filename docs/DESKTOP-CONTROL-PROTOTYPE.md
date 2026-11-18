# Experimental interactive control

The optional Windows desktop host now contains a bounded control-lease prototype. This is an implementation increment, not a claim of a working unattended or mobile remote-desktop release. It does not install a service or change existing Chrome Remote Desktop enrollment.

## Explicit host permission

Control starts **off on every normal host launch**. The native host window has an “Allow paired device to control this desktop” checkbox and a live lease-status label. Unchecking it immediately revokes the lease, releases keys/buttons held by that lease, and rejects new leases. Closing the host ends capture and control. Existing monitor viewing remains compatible: `viewOnly: true` still describes the view routes, while `capabilities.control` reports whether the native host currently allows a separate control lease. A viewer does not gain control automatically.

The dedicated desktop bearer credential authenticates every control request. Workspace/provider/coding credentials are not substitutes. There is one lease per host, bound to one host ID, monitor ID and layout revision. No input is queued or retried by the host. Lease secrets, packets, screenshots and credentials must not be logged.

## Wire contract

All operations are authenticated JSON POST requests. Every body includes `hostId`, `monitorId` and `layoutRevision` from the latest desktop inventory.

- `/v1/control/lease`: explicitly acquire control. Returns `leaseId`, `expiresAt`, `heartbeatMilliseconds: 1500`, and `leaseMilliseconds: 5000`.
- `/v1/control/renew`: include `leaseId`; renew while the client remains foreground and the same pane owns control.
- `/v1/control/release`: include `leaseId`; release immediately before switching monitor, host or pane, leaving the screen, backgrounding or disconnecting.
- `/v1/control/input`: include `leaseId`, a strictly increasing safe-integer `sequence` starting at 1, and `type`.

Pointer types are `pointerMove`, `pointerDown`, and `pointerUp`. Include normalized `u` and `v` in [0,1] inside the selected physical monitor, plus `button: left|right|middle` for down/up. Use the shared display geometry to exclude letterboxing and undo zoom/pan. Native mapping accounts for negative virtual origins and mixed DPI without multiplying UI scale twice.

Keyboard types are `keyDown` and `keyUp`, with a Windows virtual-key integer `key`. The initial allowlist covers ordinary Latin typing, common navigation, modifiers and function keys; Windows keys, Unicode/IME text injection and secure-attention sequences are not supported. Keyboard focus must belong to a foreground window centered on the selected monitor.

HTTP 403 means disabled, expired, revoked or wrong host/lease; 409 means stale geometry, repeated sequence or conflicting ownership/state. Other responses include 400 invalid input, 404 missing monitor, 423 unavailable/rejected Windows input, and 429 excess event rate. The local relay may return 503 when busy: coalesce/drop pointer moves, never blindly replay an uncertain click or keystroke. It does not queue control behind frame requests. The relay allows only the four named POST routes, with bounded JSON bodies, through the existing authenticated standard-I/O bridge.

Leases expire after five seconds without renewal using a monotonic clock. Expiry, layout change, host revoke and shutdown release the lease's held keys/buttons. Focus transfer while an input is held also revokes control. No buffered down/click/key packet survives reconnect. A new explicit lease is required after interruption.

## Actual acceptance boundary

An isolated `--control-test` host uses a separate profile/credential and port 8762, and rejects input outside its own foreground test window. It is not an unattended shortcut or a production enable-control endpoint.

An initial native acceptance run delivered actual clicks and typing to that window on both 100% and 125% monitors, including the negative-origin monitor. Duplicate sequences, wrong-host requests, stale-layout revocation and five-second expiry releasing a held modifier passed. A separate visible-native-checkbox check confirmed that disabling control rejects new leases with 403.

A later focused check was inconsistent: Windows reported successful `SendInput` submission, but the visible test button did not receive the click and the absolute pointer did not move. A separate native PowerShell caller reproduced that boundary, while direct cursor positioning worked. The precise Windows/input-delivery cause is not established. The prototype therefore remains disabled by default, and mobile control readiness is **not accepted**. Existing view-only viewing remains available. Do not substitute API acceptance for evidence that the user's intended action reached the desktop.

The current increment does not prove a second authenticated host, phone control, low-latency streaming, elevated windows, secure desktop, lock-screen control, credential revocation UI or unattended access. Those remain distinct from the existing authenticated view transport and durable coding sessions.
