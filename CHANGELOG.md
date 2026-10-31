# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Profile creation from the sidebar menu: an inline name field writes a Web profile
  (`@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app`) into the home this Host serves,
  ready to open immediately.
- Profile deletion from the sidebar menu: a two-step confirmation stops the profile's server
  and removes its directory. The running profile and the app-managed `desktop` profile are
  refused, and `/list` publishes `deletable` per row.
- `POST /api/profile-switcher/create` and `POST /api/profile-switcher/delete` on the
  authenticated carrier, with `profile-exists`, `profile-reserved`, `profile-create-failed`,
  and `profile-delete-failed` error codes.
- **Open in new window**: a native window host (`native-window/`, tao + wry) shows a ready
  target in a real application window. The built host ships in the package for the publishing
  platform, so an update brings it along; `config.windowShell`, `~/.cargo/bin`, `~/.local/bin`,
  and `PATH` are the fallbacks. The URL travels on stdin; without a host the action is hidden.
- The sidebar brand row is now the wordmark on the left and a profile dropdown pill after a
  spacer; the wordmark renders at 20 px.
- Creating a profile uses a centered modal dialog with validation, focus trapping, and
  Escape/backdrop cancel; the menu no longer carries an inline form or a hint line.

### Changed

- The overlay's external action is one **Open in browser** button: Desktop routes
  `window.open` through `shell.openExternal`, so a tab and a window cannot be distinguished
  there.
- The brand trigger reads the listing at startup instead of waiting for the first menu open.

### Fixed

- The sidebar brand slot showed the fallback label until the menu was opened, because the
  active profile name only arrived with the menu's `/list` request.

### Security

- Deletion requires the owner session, stops the profile's server first, and refuses the
  running profile and the app-managed `desktop` profile of the served home.

## [1.0.0] - 2026-10-30

First public release. The plugin is a complete rewrite of the private prototype; the
user-facing feature set is unchanged.

### Added

- Sidebar profile switcher with the official DeepSeek Harness wordmark and the active
  profile name.
- On-demand launch of another profile with `dsh --profile <name> --no-open --port 0` and
  full-screen embedding through the Desktop leased-webview bridge.
- Browser fallback (`dsh web`) that opens the target in a new tab.
- Plugin configuration for extra homes, launcher selection, start timeout, idle recovery,
  concurrency limit, kill grace, and log level.
- Idle recovery: a target server stops after `idleStopMs` without a client heartbeat.
- English and Chinese READMEs, architecture/contracts/security/verification documents, and
  four architecture decision records.
- Unit and component tests (Host and Client), an artifact-level smoke test, and a package
  contract check.
- GitHub Actions CI (Linux/macOS/Windows × Node 20/22/24) and a tag-triggered npm release
  workflow with provenance.
- Issue and pull-request templates, Dependabot, SECURITY, CONTRIBUTING, LICENSE, and
  NOTICE.

### Changed

- Host and Client sources are TypeScript modules bundled into committed `lib/index.js` and
  `lib/client.js` artifacts.
- All plugin routes are registered on the platform's authenticated `ctx.connection.fetch`
  registry instead of raw `webServer` exact routes.
- The Client uses an immutable snapshot store, an abortable controller, and `t` injected by
  the slot locale registration.
- The brand slot renders the official wordmark artwork; the previous plain-text product
  name is gone.
- Stop escalates from SIGTERM to SIGKILL and signals the POSIX process group (or
  `taskkill /T` on Windows), so descendants cannot survive.

### Security

- Removed the hand-rolled origin check that bypassed the authenticated `/api` carrier.
- `/list` no longer exposes launch URLs; `/status` returns them only to the authenticated
  owner.
- Launch URLs are stripped from logs and error details; child output is sanitized.
- Request bodies are bounded at 16 KiB and streamed through the carrier without the
  300 MiB default buffer.
- Only a resolved `dsh` executable with an allow-listed home and a validated profile name
  can be spawned.

### Fixed

- Opening a target in a new tab no longer navigates the whole app away when popups are
  allowed (`noopener` had made `window.open` return null).
- The menu flips above the trigger near the bottom of the viewport and repositions on
  resize/scroll.
- Escape and Tab restore focus to the trigger; outside clicks no longer steal focus.
- Guest failures and server stops show a retryable error card instead of a blank surface.
- Malformed bodies, oversized bodies, and unexpected failures return 400/413/500 instead
  of a generic internal error.
- Target servers are no longer leaked after a page refresh or crash; idle recovery stops
  them.
