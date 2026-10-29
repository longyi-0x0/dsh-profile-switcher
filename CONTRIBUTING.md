# Contributing

Thanks for taking the time to improve the project. This plugin runs inside user profiles
and can start processes, so changes are reviewed for security and for the DSH contracts
they rely on, not only for the feature they add.

## Setup

```bash
pnpm install --frozen-lockfile
pnpm check
```

Requirements: Node.js ≥ 20 and pnpm 10. CI runs the same `pnpm check` on Linux, macOS, and
Windows with Node 20, 22, and 24.

## Layout

| Path                                            | Contents                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| `src/host/`                                     | Host half: discovery, launcher, supervisor, authenticated routes, redaction.   |
| `src/client/`                                   | Client half: store, controller, API, guest lifecycle, UI, i18n, styles.        |
| `src/shared/`                                   | Wire protocol and configuration shared by both halves (type-checked together). |
| `tests/host/`, `tests/client/`, `tests/shared/` | Vitest suites.                                                                 |
| `scripts/build.mjs`                             | esbuild build that writes the committed `lib/` artifacts.                      |
| `scripts/check-package.mjs`                     | Release contract checks.                                                       |
| `scripts/smoke-client.mjs`                      | Loads the built client bundle in a VM and runs `apply`.                        |
| `docs/`                                         | Architecture, DSH integration contracts, security model, verification, ADRs.   |

## Rules

1. **No runtime dependencies.** The Host uses `node:*` only; the Client uses the React
   modules already provided by the Host module table. A dependency needs an ADR and a good
   reason, because a linked profile does not install a linked package's dependencies.
2. **One wire contract.** Change `src/shared/protocol.ts` first; both halves must compile.
   The API is internal, but it is versioned (`apiVersion`) and documented in the README.
3. **Respect the trust boundary.** Plugin routes live under `ctx.connection.fetch`. Do not
   add raw `webServer` routes with a home-made origin check. The launch URL is a bearer
   token: never log it, return it from `/list`, or write it to an attribute.
4. **Validate inputs at the edge.** Homes must come from discovery/config; names must match
   `PROFILE_NAME_PATTERN`; bodies are capped at 16 KiB.
5. **Every lifecycle path has an owner.** Register timers, listeners, leases, and children
   with an effect or an abort signal, and prove disposal with a test.
6. **Both languages.** Add every user-visible string to `src/client/i18n.ts` for `en` and
   `zh`; the parity test requires matching keys and placeholders. Locale display metadata
   lives in `locale/*.json`.
7. **Accessibility is part of the UI.** Keyboard navigation, focus restoration, labels, and
   `prefers-reduced-motion` are required; `eslint-plugin-jsx-a11y` runs in CI.
8. **Rebuild the artifacts.** Run `pnpm build` and commit `lib/index.js` and
   `lib/client.js` with the source change; CI fails if they are stale.
9. **Update the contracts doc.** A change that touches DSH internals (route registry,
   slots, preload bridge, CLI output, theme variables) must update
   `docs/integration-contracts.md` and, if the decision is new, add an ADR.

## Tests

- Unit-test pure logic (discovery, parsing, config, supervisor) with injected seams.
- Test routes with real `Request`/`Response` objects, not a fake node server.
- Test the Client controller and guest lifecycle with fake timers, a fake API, and a fake
  bridge element.
- Add a manual note to the PR for anything only observable in Electron; see
  `docs/verification.md`.

## Commits and pull requests

Use Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`). Keep a
change reviewable: refactors that preserve behavior come before behavior changes. The PR
template lists the checks; a PR without tests for new logic is not merged.

## Release checklist

1. `pnpm check` is green locally.
2. `CHANGELOG.md` has an entry for the version.
3. `npm pack --dry-run` contains `lib/`, locales, icon, patch, READMEs, LICENSE, NOTICE, and
   CHANGELOG only.
4. Complete the manual Desktop matrix in `docs/verification.md` and record the DSH version.
5. Tag `v<version>` and push; the release workflow publishes with npm provenance.
6. Verify `dsh plugin --profile <scratch> add dsh-profile-switcher@<version>` in a fresh
   profile.

The npm release requires an `NPM_TOKEN` repository secret and a public repository (npm
provenance uses GitHub OIDC).
