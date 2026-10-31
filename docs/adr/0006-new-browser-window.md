# 0006 — Ask the browser for a real window

- **Status**: accepted
- **Date**: 2026-10-31

## Context

The overlay offers "Open in browser", which hands the target's launch URL to the Desktop
shell's `window.open` path. The main process denies the window and calls
`shell.openExternal(url)`, so the default browser receives an ordinary open request and the
result is a tab (or a window, if the browser has none). Electron exposes no way to request a
window, and the Desktop shell boots one hard-wired profile in one window.

## Decision

- Add `POST /window`, served only for a **ready** target, and a second action in the overlay.
- On macOS, drive the default browser's own scripting interface instead of LaunchServices:
  resolve the default browser with `NSWorkspace`, then run a fixed AppleScript that makes a
  new Safari document or a new Chromium window.
- Pass the script through `osascript`'s **stdin**. An argv form would put the launch token in
  `ps` for every local process; the scripts are constants and the URL is escaped as an
  AppleScript string literal.
- Bound the run at 10 s and answer `200 { opened: false, reason }` for an unsupported browser
  or a failed script. This is an expected outcome, not a request error: the Client falls back
  to the ordinary browser handoff and says so in the top bar.
- Report `canOpenWindow` from `/list`; only macOS sets it.

## Consequences

- The first use triggers the macOS Automation prompt for controlling the browser. A denial is
  handled by the fallback rather than by an error card.
- Only Safari and Chromium-family browsers are supported; Firefox and others fall back.
- The token never appears in argv, logs, or the response body.
- A browser that never answers is killed after the timeout; the user still gets a tab.
- This is the only feature that depends on a browser dictionary rather than a DSH contract;
  the scripts are small, fixed, and covered by unit tests that assert their shape.

## Alternatives considered

- **Keep `shell.openExternal` only:** no window is possible; rejected by the request.
- **`open -na "<browser>" --args --new-window <url>` for Chromium:** works without AppleEvents
  but leaves the token in the browser's argv for its whole lifetime; rejected.
- **Launch a second Desktop instance with the profile:** the app holds a single-instance lock
  and boots a hard-wired profile; not possible from a plugin.
- **Ask DSH for a window API:** the right long-term shape, but it needs an upstream change;
  this ADR records the local workaround and its trigger for replacement.
