# 0006 — Open a native window with a separate tao + wry host

- **Status**: accepted
- **Date**: 2026-10-31

## Context

Opening another profile embeds it in the current window through a leased webview. The
requested alternative is a second **native application window** showing that profile.

The Desktop shell cannot provide it: in 0.2.1-rc.5 `lib/main.js` calls `createWindow(...)`
once for the single product window, `DESKTOP_IPC` has no window-creation channel,
`preload-app.cjs` exposes no window API, the app holds a single-instance lock, and the profile
is hard-wired to `<home>/profiles/desktop`. Host plugins run in an `ELECTRON_RUN_AS_NODE`
child and never touch Electron.

Adjacent options were rejected: a browser window is not a native window; macOS denies
AppleEvents from this app (`Info.plist` has no `NSAppleEventsUsageDescription`, so
`osascript` fails with `-10004`); a second app instance fails the single-instance lock and
would boot the hard-wired `desktop` profile anyway.

## Decision

- Ship `native-window/` in this repository: a small **tao + wry** program
  (`dsh-profile-window`) that opens one window hosting one WebView. It is a normal
  application window, not a browser.
- Keep it optional. The plugin resolves it from `config.windowShell`, then `PATH`, then the
  checkout's `native-window/target/release/`. Without a host the Client hides the action;
  the plugin ships no binary and builds none at runtime.
- Start it detached with `--title <profile>`; write the authenticated URL to **stdin**.
  `ps` shows every local process's argv, and the URL carries the target's bearer token.
- Keep the window on the target's origin: other navigations and pop-ups go to the system
  browser instead of turning the host into an unrestricted browser.
- Treat a failed start as an expected answer: `200 { opened: false, reason }`, after which
  the Client falls back to the browser handoff and says so in the top bar.

## Consequences

- Building the host needs a Rust toolchain (`cargo install --path native-window`). It is not
  part of `pnpm check`; a CI job can build and publish it later.
- The window is a separate process: its own title bar and menu, and closing it does not stop
  the target server (the embedded guest's heartbeat still does). Returning from the guest
  stops the server, which then leaves the window on an error page.
- The host is unsigned. A locally built binary runs without a Gatekeeper prompt; a downloaded
  one may need approval.
- If DSH ever exposes a window API to Host plugins, replace the host with it and delete
  `native-window/`.

## Alternatives considered

- **Desktop window API**: the right long-term shape, but it needs an upstream release.
- **Browser window (`--new-window`, `open -a`)**: not a native application window.
- **AppleScript (`make new document`)**: denied by the app's missing AppleEvents declaration.
- **Second Desktop instance**: single-instance lock, and the profile is hard-wired.
