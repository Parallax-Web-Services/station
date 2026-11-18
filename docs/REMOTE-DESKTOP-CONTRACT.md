# Remote desktop host and monitor contract

Status: host-side discovery and shared input geometry; no screen transport, unattended pairing service or input injection is implemented by this document/module. This capability is separate from the coding gateway. It must not inherit a coding token's permissions to control a whole desktop.

## Product behavior

Save named, authorized hosts and their last selected monitors. One tap resumes a permitted host; opening a second pane retains the first host's connection. Two panes can mean two computers or two monitors on one computer. Store these as different concepts:

- `hostId`: persistent identity of one enrolled computer.
- `monitorId`: stable monitor identity within that host, not the position of a pane.
- `sessionId`: current authenticated host connection; one host may supply multiple monitor streams.
- `layoutRevision`: current physical display geometry and orientation revision.
- `paneId`: client presentation state, bound to a host/session/monitor tuple.

On one host, two monitors should share a host connection rather than creating competing OS logins. In two-host mode, switching input focus must never broadcast keys/clicks to both machines. A pane can expand full screen and return without re-pairing or losing the other pane. Remember the layout, but show actual offline/reconnecting state instead of a stale frame presented as live.

## Host discovery and pairing

Only an authenticated device may enumerate hosts authorized for it. DNS resolution is not proof of host identity, ownership, availability or desktop access. Existing host enrollment and remote-access setup must be discovered before provisioning a replacement.

Pair once using an explicit host-owner flow, store the device secret in the native vault, and obtain short-lived session grants for allowed capabilities. Keep long-lived host credentials out of the web shell, URLs, clipboard and logs. Forgetting a local saved tile is distinct from revoking the device on the host. Reconnection can renew a valid grant without repeating the entire sign-in/click sequence; revoked authorization must fail closed.

The host reports `view`, `control`, `clipboard`, `audio`, `fileTransfer`, `secureDesktop` and `unattended` as individually supported/authorized capabilities, not a universal administrator grant. Do not advertise lock-screen or unattended access based only on a running process.

## Monitor and frame metadata

A host inventory contains a monotonic or content-derived `layoutRevision` and monitor records:

```json
{
  "hostId": "enrolled-host-id",
  "layoutRevision": "current-layout-version",
  "monitors": [{
    "id": "stable-monitor-id",
    "enabled": true,
    "bounds": {"x": 0, "y": 0, "width": 1600, "height": 900},
    "scale": 1.25,
    "rotation": 0
  }]
}
```

Bounds use **physical desktop pixels**, including negative virtual-desktop origins. Device-independent UI dimensions must not be substituted. Each frame identifies its host/session/monitor/layout, encoded size, timestamp and crop/rotation contract. Normalize rotation in the host's output so the client sees display-oriented frames. Encoding may downscale a monitor; do not multiply pointer coordinates by UI DPI again.

`desktop/coordinates.mjs` supplies the pure mapping shared by host/client implementations. It rejects stale/wrong host layouts, missing/disabled monitors, nonfinite points, touches outside the selected pane and letterboxing. It handles image fit, zoom/pan and negative origins, and produces physical coordinates plus Windows absolute coordinates. No capture or input side effects occur in this module.

Windows absolute input must use the virtual desktop coordinate space and the corresponding native flags. [Microsoft SendInput mouse coordinates](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-mouseinput). A desktop capture/control host must run with correct DPI awareness and verify its actual frame coordinate space. The local read-only discovery pass demonstrated that DPI-unaware monitor APIs can return logical dimensions that differ from the capture pixels.

## Session and reconnect operations

The eventual desktop capability should expose authenticated host inventory, monitor inventory, create/resume/close session, transport signaling and independently authorized input channels. These are not existing coding-gateway endpoints.

Every input packet binds `hostId`, `sessionId`, `monitorId`, `layoutRevision`, device authorization, a fresh control lease and an input sequence. Reject stale geometry/leases and wrong-host packets. Do not replay buffered clicks or keys after reconnect. Release held modifiers/buttons on focus transfer, disconnect and control-lease expiry; acquiring another pane does not authorize input to the previous host.

For a stream interruption, keep the host tile and selected monitor, show reconnecting, reauthenticate/renegotiate the transport, refetch monitor geometry and restore the pane. A monitor reconfiguration invalidates old input transforms immediately. Losing one host must not tear down the other pane.

## Existing transport boundary and implementation options

Chrome Remote Desktop documents its own encrypted web/Android access flow and host enrollment. The audited documentation does not establish a public embeddable Google-hosted session SDK. Chromium's remoting source exists, but source licensing alone is not a guarantee that Google's hosted authentication/signaling service is available to another application. Preserve the existing setup as a fallback rather than copying browser cookies, embedding login pages or promising a supported in-app integration. [Google access documentation](https://support.google.com/chrome/answer/1649523?co=GENIE.Platform%3DAndroid), [Chromium remoting client source](https://chromium.googlesource.com/chromium/src/+/HEAD/remoting/client/), [Chromium license](https://chromium.googlesource.com/chromium/src/+/HEAD/LICENSE).

Technical integration candidates require a real host protocol and separate validation:

| Component | Documented integration boundary | Current gate |
| --- | --- | --- |
| Apache Guacamole common-js | JavaScript client and input/tunnel API; upstream Apache 2.0 license | Needs a server/tunnel and functioning RDP/VNC host; not an installed solution merely by adding a JS view. |
| FreeRDP | Native RDP implementation under Apache 2.0 | Needs an authorized enabled RDP host; confirm interactive-console/session behavior and monitor negotiation. |
| noVNC | Browser VNC client; core MPL 2.0 with separate asset licenses | Needs a secured VNC host and WebSocket transport; keep original license obligations. |

[Guacamole JavaScript API](https://guacamole.apache.org/doc/gug/guacamole-common-js.html), [Guacamole license](https://raw.githubusercontent.com/apache/guacamole-client/main/LICENSE), [FreeRDP](https://www.freerdp.com/), [FreeRDP license](https://raw.githubusercontent.com/FreeRDP/FreeRDP/master/LICENSE), [noVNC license](https://raw.githubusercontent.com/novnc/noVNC/master/LICENSE.txt).

No new host service, RDP enablement, firewall rule, paid service or broad network exposure was performed during this discovery pass. Enabling a new access method is a host security change, not ordinary client navigation. A default-browser handoff to an existing remote service can be a temporary convenience, but does not meet the in-app two-pane acceptance criteria.

## Earliest testable milestones

1. Identify and authenticate one existing enrolled host without repeating its setup; report actual monitor capabilities and host availability.
2. View both monitors through a supported transport, select a monitor and validate input against visible landmarks at physical pixel coordinates. Cover mixed DPI, a negative-origin monitor, orientation, fit/zoom/pan and keyboard focus.
3. Interrupt the network, resume the same named host/monitor without re-pairing and verify that buffered input is discarded.
4. Verify the second actual computer and its independent enrollment. Connect both hosts in two panes, switch focused input and expand/restore one pane while the other remains live.
5. Validate host sleep, lock/secure desktop, revocation, restart and unattended behavior explicitly. Do not extrapolate them from a successful foreground stream.

Current proof is limited to read-only host/monitor discovery and four geometry checks. Pixel installation, two-host video, actual input routing and secure unattended reconnection require their own acceptance evidence.
