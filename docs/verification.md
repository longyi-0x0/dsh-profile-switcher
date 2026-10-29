# Verification

CI covers unit logic, component behavior, the built artifacts, and the package contract. It
cannot drive an Electron `<webview>`, so the Desktop matrix below is a manual release gate.
Record the DSH version and OS with every run.

## Automated

```bash
pnpm install --frozen-lockfile
pnpm check     # typecheck + lint + Vitest + build + artifact smoke + package check
git diff --exit-code -- lib
npm pack --dry-run
```

| Area            | What it proves                                                                                      | Where                                |
| --------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Config          | Defaults, clamping, unknown keys, frozen result                                                     | `tests/shared/config.test.ts`        |
| Discovery       | Current/extra/sibling homes, ordering, unreadable directories, labels                               | `tests/host/homes.test.ts`           |
| Profile listing | Manifest bundles, malformed manifest, invalid names, mtime                                          | `tests/host/profiles.test.ts`        |
| Current profile | Every detection source and failure                                                                  | `tests/host/current-profile.test.ts` |
| Launcher        | Desktop CLI, explicit path, PATH, Windows PATHEXT, env scrub                                        | `tests/host/launcher.test.ts`        |
| URL parsing     | Chunk splits, ANSI, invalid scheme/credentials, notices                                             | `tests/host/web-url.test.ts`         |
| Redaction       | ANSI, tokens, URL origins, bounded details                                                          | `tests/host/redact.test.ts`          |
| Process         | Graceful exit, SIGKILL escalation, taskkill, missing pid                                            | `tests/host/process.test.ts`         |
| Supervisor      | Start/ready/exit/timeout/spawn error, reuse, maxRunning, stop, idle, heartbeats, dispose            | `tests/host/supervisor.test.ts`      |
| Routes          | Four routes, no URL in `/list`, URL in `/status`, 400/404/409/413/429/500, missing registry         | `tests/host/routes.test.ts`          |
| Client API      | Methods, query encoding, status-to-code mapping, aborts, transport errors                           | `tests/client/api.test.ts`           |
| Store           | Snapshot identity, notifications, no-op updates                                                     | `tests/client/store.test.ts`         |
| Controller      | Embed, polling, errors, timeout, cancel, retry, web fallback, popup block, heartbeat, dispose       | `tests/client/controller.test.ts`    |
| Guest           | Official attributes, one navigation, error paths, aborted retry, exactly-once release, late release | `tests/client/embed.test.ts`         |
| UI              | Menu grouping/state/focus/keys/outside click, trigger, error card, guest mount                      | `tests/client/*.test.tsx`            |
| i18n            | Key and placeholder parity, fallback, every error code                                              | `tests/client/i18n.test.ts`          |
| Artifact        | Loader id, module requests, three registrations, Host exports                                       | `scripts/smoke-client.mjs`           |
| Package         | Manifest, exports, files, patch row, locale metadata, icon, wrapper id                              | `scripts/check-package.mjs`          |

## Manual Desktop matrix

Environment: DSH Desktop 0.2.1-rc.3 (record the exact build), macOS; repeat the window-chrome
rows on Windows when available. Use two profiles, one of them in a sibling home.

### Core flow

- [ ] Brand row shows the official wordmark plus the active profile; the current profile is
      disabled with a **Current** badge.
- [ ] Menu opens below the trigger, groups by home, marks running profiles.
- [ ] Arrow keys, Home/End, Enter/Space, Escape, and Tab behave; Escape returns focus to the
      trigger; an outside click closes without stealing focus.
- [ ] Near the bottom of the window the menu flips above the trigger and stays on screen.
- [ ] Selecting a profile shows the starting card immediately, then the target UI.
- [ ] Keyboard input, scrolling, charts, and links work inside the guest.
- [ ] **Open in new tab** opens the system browser and keeps the guest usable.
- [ ] **Back to default** destroys the guest, releases the lease, restores focus, and the host
      session (scroll position, open panel) is intact.
- [ ] Repeat select/back three times; each run acquires a new lease and leaves no duplicate
      server.

### Lifecycle and failure

- [ ] After Back, `ps -o pid,ppid,pgid,command -g <pgid>` shows no target CLI or workers.
- [ ] Quit the app while embedded: no target process survives.
- [ ] Disable and re-enable the plugin: overlay and guest are removed; re-enabling works.
- [ ] With `idleStopMs: 60000` and a 30 s keepalive, leaving the target open keeps it alive;
      closing the page stops it within the sweep interval.
- [ ] Start a profile whose directory was deleted → 404 handled with a localized error.
- [ ] Target missing `dsh-web-app` → start error card with a retryable message.
- [ ] Kill the target server while embedded → heartbeat turns the surface into a retryable
      error card.
- [ ] Launch with `logLevel: debug`; the log contains origins but no `token=` or full URL.
- [ ] macOS traffic lights and Windows titlebar buttons remain usable; the overlay bar is
      draggable and its buttons are not.
- [ ] Fullscreen toggling (green button) updates the top inset without a reload.
- [ ] Light and dark themes; sidebar expanded; rail hides the brand slot as documented.

### Browser fallback (`dsh web`)

- [ ] Selecting a profile opens a new tab, the menu closes, and the notice is announced.
- [ ] If the browser blocks the popup, the error card offers Retry.
- [ ] The host page does not navigate away.

### Security probes

```bash
# Unauthenticated request (replace the port): expect 401.
curl -i http://127.0.0.1:<port>/api/profile-switcher/list

# Foreign Origin with a valid cookie is rejected by the carrier: expect 403.
curl -i -H 'Origin: https://evil.example' \
  -H 'Cookie: <owner cookie>' http://127.0.0.1:<port>/api/profile-switcher/list

# The list must never contain a launch URL or token.
curl -s -H 'Cookie: <owner cookie>' \
  http://127.0.0.1:<port>/api/profile-switcher/list | grep -E 'token=|https?://127' && echo LEAK

# Logs must not contain token-bearing URLs.
grep -R 'token=' "$DSH_HOME"/*.log 2>/dev/null && echo LEAK
```

Record the results in the release issue.

### Package install

```bash
npm pack
dsh plugin --profile <scratch> add ./dsh-profile-switcher-1.0.0.tgz
# reload the profile; verify the trigger, one launch/back, then remove the bundle
```

## Release gate

1. `pnpm check` green on the release commit.
2. Manual matrix completed for the recorded DSH versions.
3. Security probes clean.
4. `npm pack --dry-run` file list reviewed.
5. Tag pushed; workflow publishes with provenance; install from npm into a fresh profile
   succeeds.
