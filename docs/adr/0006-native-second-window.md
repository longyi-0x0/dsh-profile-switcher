# 0006 — A second native application window is out of plugin scope

- **Status**: rejected (for this plugin); proposed upstream
- **Date**: 2026-10-31

## Context

Opening another profile currently embeds it in the current window through a leased webview,
and can hand it to the system browser. The requested alternative is a second **native**
DeepSeek Harness window showing that profile, like a second app window.

## Investigation (Desktop 0.2.1-rc.5)

- `lib/main.js` calls `createWindow(...)` exactly once, for the single product window. Every
  other `BrowserWindow` is app chrome: welcome, update overlay/dialog, policy login.
- `DESKTOP_IPC` has no window-creation channel; `lib/preload-app.cjs` exposes boot, browser
  lease, shortcuts, directory pick, device info, locale, updates, theme, and the Windows
  caption menu. Nothing creates a window.
- The app holds `requestSingleInstanceLock()`; `dsh://open` only focuses the primary window,
  and the profile is hard-wired as `<home>/profiles/desktop`.
- Host plugins run in a Node child of the app (`ELECTRON_RUN_AS_NODE`) and have no access to
  Electron APIs or the main process.

Two adjacent workarounds were also tested and rejected:

- **A browser window** is not a native application window, and macOS denies AppleEvents from
  this app anyway: `Info.plist` has no `NSAppleEventsUsageDescription`, so `osascript` fails
  with `-10004` instead of prompting.
- **A second app instance** fails the single-instance lock, and even with a separate
  `userData` directory it would boot the hard-wired `desktop` profile, not the target one.

## Decision

- Do not ship a "new window" action. The plugin keeps two surfaces: embedding in the current
  window (primary) and the browser handoff.
- Record the limitation in the README and the compatibility notes, and keep this ADR as the
  reference for the upstream change that would unblock it.

## Proposed upstream contract

A Desktop window API would be enough, for example:

```ts
// exposed on window.dshDesktop (protocolVersion bump)
windows.open(url: string): Promise<{ id: string }>
```

The main process would create a `BrowserWindow` with the same preload and isolation options
as the product window, load the URL, and own its lifetime. A Host-side variant (an IPC
message the Host may send) would work as well. Either way the URL carries the target's
bearer token, so the API must be limited to the owner session and must not log it.

## Consequences

- A native second window requires a DSH release with that API; the plugin can adopt it
  without changing its own routes.
- Until then, users have full-screen embedding (same window) and the browser handoff.
