# DSH integration contracts

The plugin relies on a small number of Harness facts that are not part of a stable public
SDK. This document is the reviewable list. Each row names the DSH build it was verified
against (`0.2.1-rc.3`), where the fact comes from, how the plugin depends on it, and what
happens when it changes.

When you touch one of these contracts, update this table and add or amend an ADR.

## 1. Authenticated `/api` Fetch routes

- **Fact**: `ctx.connection.fetch.register({ path, methods, requestBody, fetch })` registers
  an exact route below `/api`. The carrier runs `connection.admit(req)` first (Host/Origin
  fence + owner session), then `createSharedFetchHandler` dispatches to the route. A
  non-owner Peer gets 403; a method miss gets 404; `requestBody: 'streaming'` hands over the
  raw body stream instead of the carrier's 300 MiB buffer.
- **Evidence**: `@deepseek-ai/dsh-client-connection` 0.2.1-rc.3, `lib/index.js`
  (`HostConnectionService.fetch`, `createSharedFetchHandler`, `apply`).
- **Plugin use**: `src/host/routes.ts`; `inject = ['connection']` in `src/host/index.ts`.
- **If it changes**: the plugin logs `ctx.connection.fetch is unavailable` and registers no
  routes; the Client shows the unsupported-host message on 404. Re-verify the route shape
  before changing the code.

## 2. `dsh web:` startup line

- **Fact**: the Web app prints `dsh web: <authenticated URL>` when `printUrl` is enabled,
  which is the default. `--no-open` suppresses the browser handoff; `--port 0` asks for an
  OS-assigned port.
- **Evidence**: `@deepseek-ai/dsh-web-app` 0.2.1-rc.3 (`announceReady`, `Config.printUrl`),
  `dsh-web-app/lib/index.js`.
- **Plugin use**: `src/host/web-url.ts`, `src/host/launcher.ts` (`--profile`, `--no-open`,
  `--port 0`).
- **If it changes**: the start timer reports `start-timeout` and the stderr tail (redacted)
  explains why. The scanner tolerates ANSI, chunk splits, and unrelated `dsh web:` lines.

## 3. Desktop CLI location and Node mode

- **Fact**: the Desktop runtime carries the CLI at
  `Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js`, and the
  Host process runs under `ELECTRON_RUN_AS_NODE=1`; spawning `process.execPath
--expose-internals <cli>` boots another profile.
- **Evidence**: Desktop 0.2.1-rc.3 `lib/main.js` (`DesktopHostProcess`), installed
  `dsh-desktop-host/lib/cli.js`.
- **Plugin use**: `src/host/launcher.ts` (`findCli`, `resolveLauncher`).
- **If it changes**: `launcher-missing` is reported, with a hint to set `config.dshPath` or
  use a `dsh` on `PATH`; `launcher: 'path'` is the fallback.

## 4. Desktop browser lease

- **Fact**: the preload exposes `window.dshDesktop` with `protocolVersion: 1` and
  `browser.acquire(workspace)` / `browser.release(lease)` / `browser.onOpenRequested()`. The
  main process only admits a `<webview>` whose `src` is `about:blank#<lease>`, whose
  partition is the reservation's, and whose name is the lease. Element attributes used by
  the shipped browser panel are `partition`, `name`, `allowpopups`, and
  `data-sidebar-browser-frame="webview"`; navigation happens through `loadURL`.
- **Evidence**: Desktop `lib/preload-app.cjs` (`browser`), `lib/main.js`
  (`will-attach-webview`, `browserGuests`), `@deepseek-ai/dsh-client-ui-sidebar-browser`
  0.2.1-rc.3 `lib/client.js` (`createElement`, `createGuest`).
- **Plugin use**: `src/client/embed.ts`; attributes are intentionally identical to the
  shipped browser so the same main-process rules accept the guest.
- **If it changes**: a protocol-version mismatch is treated as "embedding unavailable" and
  the target opens in a tab; a rejected lease surfaces as an embed error card.

## 5. Slots

- **Fact**: `sidebar.brand.name` is a `single` slot declared by the sidebar with
  `replaceRisk: "shadows-shipped-ui"`; the shipped occupant is the official wordmark.
  `shell.overlay` is a `list` slot for frame-wide floating layers. Registering with
  `locale: '<namespace>'` injects the namespace-bound `t` into the component props.
- **Evidence**: `@deepseek-ai/dsh-client-ui-sidebar` 0.2.1-rc.3 `lib/client.js`;
  `@deepseek-ai/dsh-cordis-client-runner` `CLIENT_SLOT_API`; shipped
  `dsh-client-ui-schedule` uses `locale` on a `shell.overlay` registration.
- **Plugin use**: `src/client/apply.tsx`, `src/client/ui/*`.
- **If it changes**: a renamed slot makes the trigger or overlay disappear without breaking
  the rest of the sidebar; the error boundary prevents a blank slot. See ADR 0003 for the
  brand replacement trade-off.

## 6. Locale service

- **Fact**: `ctx.locale.register(ns, { zh, en })` registers dictionaries and
  `ctx.locale.bind(ns)` returns a bound translator; dictionaries registered after mount are
  picked up without a remount.
- **Evidence**: `@deepseek-ai/dsh-client-locale` 0.2.1-rc.3 `README.md`.
- **Plugin use**: `src/client/apply.tsx`, `src/client/i18n.ts`.
- **If it changes**: the plugin falls back to its bundled English dictionary (the
  `message()` helper treats a key echo as a miss), so the UI stays readable.

## 7. Theme tokens and layout facts

- **Fact**: colors come from `--dsw-alias-*`; the Host exposes
  `--dsh-frame-top-clearance`, `document.documentElement.dataset.platform`, and
  `data-fullscreen` for window-chrome-aware positioning.
- **Evidence**: `@deepseek-ai/dsh-client-ui-layout` (`--dsh-frame-top-clearance`) and the Desktop preload
  (`markDocumentPlatform`, `syncWindowFullscreen` in `lib/preload-app.cjs`).
- **Plugin use**: `src/client/styles.ts`, `src/client/insets.ts`.
- **If it changes**: a renamed token degrades appearance but never breaks rendering; a
  missing clearance variable falls back to 48 px on macOS and 40 px on Windows.

## 8. Cordis Host/Client context

- **Fact**: Host plugins export `apply(ctx, config)` and optional `inject`; resources are
  registered through `ctx.effect(callback, label)`, and `ctx.logger(name)` returns a named
  logger. Client plugins export `apply(ctx)` and use `ctx.slots.inject` /
  `ctx.slots.register` / `ctx.effect`.
- **Evidence**: `@deepseek-ai/cordis` 4.x; shipped plugins such as
  `@deepseek-ai/dsh-host-open-in-app`.
- **Plugin use**: `src/host/context.ts`, `src/client/context.ts` (structural types, no
  runtime import).
- **If it changes**: activation either fails (the plugin is absent, as any broken plugin) or
  the structural type still matches. Keeping zero `@deepseek-ai/*` runtime imports means no
  dependency-resolution failure in a linked profile.

## 9. Baseline React modules

- **Fact**: the Client module table provides `react` and `react/jsx-runtime`; plugin bundles
  must not ship another React copy.
- **Evidence**: the Web shell boot module table in `@deepseek-ai/dsh-web-frontend` 0.2.1-rc.3.
- **Plugin use**: `scripts/build.mjs` marks both as external; the client bundle requires
  only these two modules (verified by the smoke test).
- **If it changes**: the bundle fails to materialize and the slot entries stay empty; the
  smoke test reports any unexpected module request before release.
