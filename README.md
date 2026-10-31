# dsh-profile-switcher

[![CI](https://github.com/longyi-0x0/dsh-profile-switcher/actions/workflows/ci.yml/badge.svg)](https://github.com/longyi-0x0/dsh-profile-switcher/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Switch between DeepSeek Harness profiles from the sidebar and open another profile's
complete Web UI **inside the current window**, without reloading or losing the host
session.

English | [中文](README.zh.md)

![UI design mockup](https://raw.githubusercontent.com/longyi-0x0/dsh-profile-switcher/main/docs/design/mockup.png)

> The image is a design mockup, not a screenshot. Replace it with a real capture before
> announcing the release.

## Why

The Desktop shell boots exactly one hard-wired profile. A profile can only run as its own
Harness, which normally means another browser tab, another window, and re-authenticating.
This plugin starts the target profile on demand, authenticates to it, and embeds it in a
full-screen leased webview with one-click return to the default profile.

- Sidebar trigger shows the active profile next to the official DeepSeek Harness wordmark.
- Profiles are grouped by DSH home (`~/.dsh`, `~/.dsh-trading`, …).
- One click starts the target Harness (`dsh --profile <name> --no-open --port 0`).
- The target UI runs full-screen; the top-left button returns instantly.
- Returning stops the target server immediately; idle servers stop themselves.
- In a plain browser (`dsh web` without the Desktop preload) the target opens in the system
  browser.
- Profiles can be created and deleted from the menu itself; a new profile is a Web profile
  that can be opened immediately.

## Requirements

| Requirement            | Notes                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| DeepSeek Harness 0.2.x | Tested with Desktop/runtime `0.2.1-rc.5`. Requires the authenticated `ctx.connection.fetch` route registry.            |
| Desktop app            | Full-screen embedding uses the Desktop browser-lease bridge. `dsh web` degrades to the system browser.                 |
| Node.js ≥ 20           | Only needed when the plugin launches a `dsh` executable discovered on `PATH`.                                          |
| Target profile         | Must include `@deepseek-ai/dsh-web-app`; third-party bundles with peer dependencies must be installed in that profile. |

## Install

### From GitHub

```bash
dsh plugin --profile desktop add github:longyi-0x0/dsh-profile-switcher
```

Restart or reload the profile. The sidebar shows the active profile next to the wordmark.

### From a local checkout

```bash
pnpm install
pnpm build              # writes the committed artifacts in lib/
dsh plugin --profile desktop add /absolute/path/to/dsh-profile-switcher
```

A `link:` install uses the directory as-is, so `lib/` must be built before installing or
after changing sources.

### From npm

The package is publish-ready but not published yet; use GitHub or a local checkout until
the first npm release:

```bash
dsh plugin --profile desktop add dsh-profile-switcher
```

## Use

1. Click the profile button in the sidebar brand area.
2. Pick a profile (the current one is disabled; running profiles are marked).
3. The menu closes and the target starts full-screen.
4. When it is ready, the target UI takes over; the top bar keeps **Back to default** and
   **Open in browser**.
5. **Back** releases the guest and stops the target server.

### Create and delete profiles

- **New profile** at the foot of the menu opens an inline name field. The new profile is a
  Web profile (`@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app`) in the home this Host
  serves, so it can be opened immediately. Install plugins into it with
  `dsh plugin --profile <name> add <package>`.
- A row's delete action arms a confirmation; a second click removes the profile directory
  together with the packages installed into it. The running profile and the app-managed
  `desktop` profile offer no delete action.

**Open in browser** hands the target to the default browser. Desktop routes `window.open`
through `shell.openExternal`, so whether that becomes a tab or a window is the browser's
choice, not the plugin's.

If the menu reports _No dsh launcher was found_, set `config.dshPath` or install `dsh` on
`PATH` (see Configuration). Unauthenticated or cross-site requests to the plugin routes
are rejected with 401/403 by the platform's `/api` fence.

## Configuration

Add `config` to the plugin row in your profile patch:

```yaml
- insert:
    - id: profile-switcher
      name: dsh-profile-switcher
      config:
        idleStopMs: 900000
        maxRunning: 3
```

| Field                  | Default  | Meaning                                                                                                 |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `additionalHomes`      | `[]`     | Extra DSH homes to list, in addition to the current home and `~/.dsh-*` siblings.                       |
| `discoverSiblingHomes` | `true`   | Scan `~/.dsh-*` and `~/.dsh_*` sibling homes.                                                           |
| `launcher`             | `auto`   | `auto`, `desktop-cli`, or `path`. `auto` prefers the CLI shipped with Desktop and then `dsh` on `PATH`. |
| `dshPath`              | unset    | Explicit CLI path; disables discovery.                                                                  |
| `startTimeoutMs`       | `120000` | How long a target may take to print its URL (5s–600s).                                                  |
| `idleStopMs`           | `900000` | Stop a target after this long without a client heartbeat (60s–24h); `0` disables idle recovery.         |
| `maxRunning`           | `3`      | Maximum concurrent target servers (1–10).                                                               |
| `killGraceMs`          | `5000`   | Grace period between SIGTERM and SIGKILL (100ms–60s).                                                   |
| `logLevel`             | `warn`   | `debug`, `info`, `warn`, or `error`.                                                                    |

Invalid values are reported in the plugin log and replaced with defaults; a typo never
prevents the sidebar from loading.

## Security

- Every route lives under the platform's authenticated `/api` carrier. Requests need the
  owner browser session; the carrier's Host/Origin fence rejects cross-site and
  DNS-rebinding attempts (401/403).
- The launch URL contains a bearer token for the target profile. It is kept in memory,
  returned only by `/status` to the authenticated owner, and never logged, listed by
  `/list`, or written to a DOM attribute.
- The only spawn target is a resolved `dsh` executable with a validated profile name and
  an allow-listed home. No request can supply a command or an arbitrary path.
- The guest is an untrusted external origin in a leased, sandboxed webview. The Desktop
  main process admits only leases it issued; the plugin never injects code into the guest.

See [docs/security-model.md](docs/security-model.md) for the threat model.

## Compatibility and limitations

- Requires `ctx.connection.fetch`. Older DSH releases without it are unsupported and the
  plugin logs a clear diagnostic.
- Full-screen embedding is Desktop-only; `dsh web` opens the target in the system browser.
- Deleting a profile is irreversible and removes the plugins installed into it; the menu
  asks for a second click first.
- Newly created profiles contain no third-party packages until they are installed with
  `dsh plugin`.
- The sidebar rail does not render the brand slot, so expand the sidebar first.
- The guest has no Desktop preload: native-only features (for example the native directory
  picker) fall back to their Web behaviour inside the embedded profile.
- One page owns a target server. If two windows open the same profile, returning in one
  window stops the server for both.
- A system sleep longer than `idleStopMs` can stop a server that is still on screen; the
  error card offers Retry.
- Electron may report `ERR_ABORTED (-3)` while the token URL redirects. That is expected
  and ignored; only genuine failures show an error card.
- The current profile is detected from `DSH_PROFILE`, `DSH_PROFILE_DIR`, `--profile`, or
  the Desktop argv layout. If detection fails, the menu still works but cannot mark the
  current row.

## Troubleshooting

| Symptom                                            | Fix                                                                                                                                                   |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Menu says no launcher was found                    | Set `config.dshPath` to the CLI, or install `dsh` on `PATH`. Desktop auto-detects its bundled CLI.                                                    |
| `Session expired` / 401 in the console             | Reload the Harness page; the browser session cookie is required.                                                                                      |
| `This Harness version does not support the plugin` | Upgrade DSH to a 0.2.x build with `ctx.connection.fetch`.                                                                                             |
| Target starts then the error card says it exited   | Open the target profile directly (`dsh --profile <name>`) to see its startup error; often a missing `dsh-web-app` bundle or a plugin peer dependency. |
| Server disappeared after leaving the window open   | `idleStopMs` elapsed without a heartbeat. Reopen the profile; increase or disable idle recovery in the config.                                        |
| Embedded page shows a login or connection error    | The target profile's own server rejected the session; check its logs.                                                                                 |

Use `logLevel: debug` for lifecycle diagnostics. Launch URLs are redacted from logs.

## Development

```bash
pnpm install
pnpm check          # typecheck + lint + tests + build + artifact smoke + package check
pnpm dev            # rebuild lib/ on change
```

| Script                            | Purpose                                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------------- |
| `pnpm build`                      | Bundle `src/host` → `lib/index.js` and `src/client` → `lib/client.js`.                             |
| `pnpm typecheck`                  | Type-check the Host and Client projects separately (Node vs DOM libs).                             |
| `pnpm lint` / `pnpm format:check` | ESLint (including hooks and jsx-a11y) and Prettier.                                                |
| `pnpm test`                       | Vitest: Host unit tests and Client jsdom tests.                                                    |
| `pnpm smoke`                      | Loads the built client bundle in a VM, runs `apply`, and checks the loader id/registrations.       |
| `pnpm check:package`              | Verifies the manifest, exports, published files, patch row, locale metadata, icon, and wrapper id. |

The built artifacts in `lib/` are committed so `link:`, GitHub, and npm installs work
without a build. CI rebuilds and fails if `lib/` is stale. Changes that touch DSH internal
contracts must update [docs/integration-contracts.md](docs/integration-contracts.md).

Manual Desktop verification is documented in [docs/verification.md](docs/verification.md);
CI cannot drive Electron webviews.

## Uninstall and rollback

```bash
dsh plugin --profile desktop remove dsh-profile-switcher
```

Or disable the bundle in Plugin Manager. The plugin stores no state and changes no DSH
files; removing it also stops any servers it started. To roll back a version:

```bash
dsh plugin --profile desktop add dsh-profile-switcher@<previous-version>
```

## Documentation

- [Architecture](docs/architecture.md)
- [Integration contracts](docs/integration-contracts.md)
- [Security model](docs/security-model.md)
- [Verification](docs/verification.md)
- [ADRs](docs/adr/)

## License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE) (the wordmark SVG is copied from the
MIT-licensed DeepSeek Harness client primitives).
