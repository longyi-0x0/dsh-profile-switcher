# 0001 — Embed the target UI in a leased webview

- **Status**: accepted
- **Date**: 2026-10-30

## Context

The plugin's purpose is to show another profile's complete Harness UI without leaving the
current window. A profile is a full Web application with its own session, theme, locale,
sidebar, and cookies. The Desktop main process only admits a `<webview>` that was reserved
through the preload browser bridge (`about:blank#<lease>`, matching partition and name);
a bare `<webview src="http://…">` is rejected. The shipped right-sidebar browser uses
exactly this mechanism.

## Decision

Use the Desktop lease bridge:

1. `window.dshDesktop.browser.acquire('profile-switcher')` returns `{ lease, partition }`.
2. Create a `<webview>` with the official attribute set and `src=about:blank#<lease>`.
3. After `dom-ready`, call `loadURL` with the target's authenticated URL. The URL is never
   written to an attribute.
4. Listen for `did-navigate`, `did-stop-loading`, `did-fail-load`,
   `render-process-gone`, and `destroyed`; treat `ERR_ABORTED (-3)` as the expected token
   redirect.
5. Release the lease exactly once on unmount, failure, return, or plugin unload.
6. When the bridge is absent (`dsh web`), open the URL in a new tab instead.

## Consequences

- The guest is a real, sandboxed external origin with its own cookies and UI, which is what
  "use the other profile" means.
- The plugin depends on a versioned Desktop preload contract and on the official element
  attributes. Both are documented in `docs/integration-contracts.md` and verified manually.
- The guest has no Desktop preload, so desktop-only capabilities fall back to Web behavior
  inside it.
- Leases must be released on every path; the lifecycle is tested with abort, late
  acquisition, failure, and unmount cases.

## Alternatives considered

- **An `<iframe>`**: rejected. The target answers its own auth flow, sets its own cookies,
  and is a different origin; framing is not a supported embedding contract, and the Desktop
  browser bridge would be bypassed.
- **Rendering the target in the host React tree**: rejected. The target is a separate
  application with its own store, router, and session; importing its client bundle would
  couple the plugin to its internals.
- **A separate desktop window**: rejected. The product requirement is in-place switching
  with one-click return.
