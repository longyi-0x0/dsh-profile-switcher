# Architecture

The plugin has two halves that ship in one package:

- the **Host half** runs in the Harness Host process (`lib/index.js`, Node ESM) and owns
  discovery, process supervision, and the authenticated HTTP routes;
- the **Client half** runs in the Web page (`lib/client.js`, a lazy module-loader factory)
  and owns the sidebar trigger, menu, and the leased-webview surface.

They share only `src/shared/protocol.ts` (wire types and constants) and
`src/shared/config.ts` (Host configuration). Both halves are bundled from TypeScript into
committed artifacts.

```text
Browser page (dsh-app://app or http://127.0.0.1:<port>)
  │  fetch('/api/profile-switcher/...', credentials: same-origin)
  ▼
DSH /api carrier (owned by @deepseek-ai/dsh-client-connection)
  │  connection.admit(req): Host/Origin fence + owner session (401/403)
  │  owner Peer → shared Fetch handler → exact plugin route
  ▼
src/host/routes.ts (Request → Response)
  │  home allow-list / name pattern / current profile / running limit
  ▼
src/host/supervisor.ts
  ├─ launcher.ts: resolve the dsh CLI (Desktop CLI or PATH)
  ├─ spawn(dsh --profile <name> --no-open --port 0, DSH_HOME=<home>)
  ├─ web-url.ts: parse `dsh web: <url>` from stdout (token stays in memory)
  ├─ process.ts: SIGTERM → grace → SIGKILL on the process group / taskkill
  └─ idle sweep: lastSeenAt + idleStopMs
  ▼
Client controller: open → poll status → lease webview → loadURL(token URL)
```

## Host modules

| Module               | Responsibility                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`           | Composition only: read env, discover homes, resolve launcher, create supervisor and routes, register effects.                                |
| `context.ts`         | Minimal structural Cordis types (`logger`, `effect`, `connection.fetch`) so no `@deepseek-ai/*` runtime import is required.                  |
| `config.ts` (shared) | `normalizeConfig`: defaults, ranges, unknown-key warnings.                                                                                   |
| `homes.ts`           | Current home + configured extra homes + `~/.dsh-*` siblings that own `profiles/`. Stable code-point ordering.                                |
| `current-profile.ts` | `DSH_PROFILE` → `DSH_PROFILE_DIR` → `--profile` → Desktop argv layout.                                                                       |
| `profiles.ts`        | Lists profile directories with manifest bundle count and mtime; skips names the API cannot launch.                                           |
| `profile-admin.ts`   | Creates and deletes profile directories in the Harness profile layout; owns the reserved/current-profile policy.                             |
| `launcher.ts`        | Resolves the Desktop CLI inside `app.asar` under `ELECTRON_RUN_AS_NODE`, or `dsh` on `PATH` (Windows PATHEXT). Builds the child environment. |
| `web-url.ts`         | Incremental line scanner for `dsh web: <url>`; validates HTTP(S), no credentials, handles ANSI and chunk splits.                             |
| `process.ts`         | Process-group termination and bounded `waitForExit`.                                                                                         |
| `supervisor.ts`      | One record per target: state machine, start timeout, max running, heartbeats, idle sweep, exit handling, summaries, diagnostics.             |
| `routes.ts`          | Six exact Fetch routes, JSON helpers, 16 KiB streamed body reader, error-to-status mapping.                                                  |
| `redact.ts`          | ANSI stripping, token/URL redaction, bounded details.                                                                                        |
| `errors.ts`          | `ApiError` carrying a stable code and HTTP status.                                                                                           |

## Client modules

| Module                       | Responsibility                                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `apply.tsx`                  | Creates the store/controller, registers locale, styles, controller lifetime, and four slots.                                        |
| `store.ts`                   | Immutable snapshot store with `useStoreValue` (`useSyncExternalStore`).                                                             |
| `controller.ts`              | Menu and overlay state machine; abortable start/poll; heartbeats; retry/return; web fallback.                                       |
| `api.ts`                     | Typed fetch client: same-origin credentials, no-store, abort support, error-code mapping.                                           |
| `embed.ts`                   | Leased `<webview>` lifecycle: official attributes, `loadURL` after `dom-ready`, timeouts, aborted-load retry, exactly-once release. |
| `insets.ts`                  | Reads the Host top clearance, computes platform insets for the overlay bar.                                                         |
| `ui/menu-position.ts`        | Anchored placement with flipping and viewport clamping.                                                                             |
| `ui/BrandTrigger.tsx`        | Brand slot occupant: wordmark + active profile; menu toggle and keyboard entry.                                                     |
| `ui/ProfileMenu.tsx`         | Grouped rows, diagnostics, states, roving focus, outside-click close, two-step delete.                                              |
| `ui/CreateProfileDialog.tsx` | Centered modal with the name field, validation, failure text, focus trap, and Escape/backdrop cancel.                               |
| `ui/EmbedSurface.tsx`        | Full-screen surface: top bar, guest host, loading/error cards, inset observation.                                                   |
| `ui/Wordmark.tsx`            | Official wordmark geometry copied from the MIT-licensed Host primitive.                                                             |
| `ui/ErrorBoundary.tsx`       | Keeps a crashing slot entry from blanking the Host slot.                                                                            |
| `i18n.ts`                    | `en`/`zh` dictionaries, typed keys, interpolation, error and diagnostic mapping.                                                    |
| `styles.ts`                  | Theme-token-only CSS, prefixed classes.                                                                                             |

## Startup sequence

1. `/open` validates the home, profile name, existence, and current-profile rule.
2. The supervisor reuses a live record or enforces `maxRunning`.
3. It spawns the launcher with `--profile <name> --no-open --port 0` and
   `DSH_HOME=<home>`; profile-scoped DSH variables are scrubbed.
4. A start timer bounds the wait for `dsh web: <url>`. The URL is validated, stored in
   memory, and only its origin is logged.
5. The Client polls `/status` with backoff until `ready`, `error`, or its own deadline.
6. The Client acquires a lease, creates the webview with `about:blank#<lease>`, navigates
   after `dom-ready`, and reports ready once the committed URL is HTTP(S).

## Supervisor state machine

```text
(start) → starting ──url──▶ ready ──exit──▶ error(exited)
              │                 │
              ├─timeout────────▶ error(start-timeout)  (process discarded)
              └─spawn error────▶ error(spawn-failed)
error ──open──▶ starting (old record discarded)
any ──stop──▶ stopping ──exit/timeout──▶ (record removed)
```

`lastSeenAt` is refreshed by `/open` and `/status`. The Client polls `/status` every
`keepaliveMs` while embedded, so an on-screen guest keeps its server alive. When the page
closes, heartbeats stop and the idle sweep stops the server after `idleStopMs`.

## Profile management

The menu can create and delete profiles without invoking `dsh` or pnpm: a profile is a
directory with a manifest, a user patch layer, and pnpm workspace settings, and the bundles a
new profile declares resolve from the installation.

- `POST /create` writes `cordis.patch.yml`, `pnpm-workspace.yaml`, and finally
  `package.json` (the manifest marks a directory as a profile, so it goes last). A failure
  removes the directory it just created.
- A new profile starts with `@deepseek-ai/dsh-base` plus `@deepseek-ai/dsh-web-app`, the
  same stack the Desktop shell boots, so the switcher can embed it immediately.
- `POST /delete` stops the profile's server first, then removes the directory tree. The
  running profile and the app-managed `desktop` profile in the served home are refused; the
  listing publishes `deletable` per row so the menu never offers a refused action.
- Creation opens a modal dialog; deletion arms a confirmation on the first row click.

Deletion is irreversible and owns the plugin packages installed into that profile.

## Lease lifecycle

- `bridge.acquire('profile-switcher')` returns `{ lease, partition }`.
- The element gets the official attribute set (`about:blank#<lease>`, partition, name,
  `allowpopups`, `data-sidebar-browser-frame`). The token URL is passed only to
  `loadURL`, never written to an attribute.
- An outer `AbortSignal` owns the lifetime. Aborting tears down listeners, removes the
  element, and releases the lease exactly once; a cancelled acquisition still releases the
  late reservation.
- `onOpenRequested` forwards guest pop-ups to the system browser.
- `ERR_ABORTED (-3)` during the token redirect is ignored; one `src` retry covers a stuck
  aborted navigation. Real failures and crashed guests produce a retryable error card.

## Build and artifacts

`scripts/build.mjs` runs two esbuild builds:

- Host: `src/host/index.ts` → `lib/index.js` (ESM, Node 20, bare imports external).
- Client: `src/client/index.tsx` → CJS → wrapped in
  `window.__ModuleLoader__.load({ id: <package name>, factory(require) { ... } })`.
  `react` and `react/jsx-runtime` stay external and resolve from the Host's baseline module
  table.

The wrapper id is read from `package.json`, so it cannot drift from the package name. CI
rebuilds and fails if `lib/` differs from the committed artifacts.

## Failure handling

- All route handlers are wrapped: `ApiError` becomes its status/code, anything else becomes
  an opaque `internal-error` with the original logged (redacted).
- The Client drops responses from superseded flows (monotonic token plus abort).
- A missing launcher disables the feature with a diagnostic instead of failing activation.
- A missing `ctx.connection.fetch` logs an error and registers no routes.
- Every user-visible failure is localized; optional details are shown separately in
  monospace.
