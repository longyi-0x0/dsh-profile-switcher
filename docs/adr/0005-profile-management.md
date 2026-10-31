# 0005 — Create and delete profiles from the menu

- **Status**: accepted
- **Date**: 2026-10-31

## Context

The switcher could only read the profiles that already existed. Getting a new one meant
leaving the app for a terminal (`dsh plugin --profile <name> add <package>` initializes a
profile as a side effect of installing a package), and removing one meant `rm -rf` on a
directory whose contents the user cannot see from the menu. The menu already lists every
profile grouped by home, so it is the natural place for both operations.

Deletion is destructive: the directory owns the plugin packages installed into that profile,
and nothing restores them. `desktop` is not an ordinary profile either — the Electron
application re-initializes it on launch and its bundle stack is the app's own.

## Decision

- **Write the profile directory directly.** Creation writes the same three files DSH's
  `initProfile` writes (`package.json`, `cordis.patch.yml`, `pnpm-workspace.yaml`) instead of
  spawning `dsh plugin`. Booting needs no package installation because every bundle resolves
  from the installation, so the operation is instant and offline.
- **Start new profiles as Web profiles.** `NEW_PROFILE_BUNDLES` is
  `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app`, so the switcher can embed what it
  creates. A profile with third-party plugins still needs `dsh plugin add`.
- **The Host owns the policy.** `deletable` is computed per row from the home and current
  profile; deletion refuses the running profile and the app-managed `desktop` profile of the
  served home. The UI never offers an action the Host would reject.
- **Make a failed creation invisible.** The manifest is written last and a failure removes
  the directory just created, so a half-written attempt is never listed as a profile.
- **Two-step confirmation in the menu.** The first click arms the row for five seconds; the
  second deletes. There is no OS trash and no undo.

## Consequences

- The profile layout becomes a DSH contract the plugin reads and writes; it is recorded in
  `docs/integration-contracts.md` §10 with the build it was verified against.
- A created profile contains no third-party packages until they are installed; the menu does
  not offer an install step.
- Deleting a profile deletes its installed plugins. The confirmation is the only guard, and
  an owner calling `/delete` directly gets no further prompt.
- `desktop` in another home is an ordinary profile and stays deletable; only the profile of
  the home this Host serves is protected.
- If DSH changes the layout, creation writes files the loader cannot resolve; failure shows
  up as a profile whose bundles are skipped rather than as a crash.

## Alternatives considered

- **`dsh plugin --profile <name> add <package>`:** initializes the profile only as part of a
  package operation, needs pnpm and the network, and blocks on an install; rejected for a
  menu action.
- **`dsh --profile <name> --from-default-profile web`:** copies a shipped template but boots
  the whole application and offers no delete at all; rejected.
- **Delete via trash (`trash`/`NSFileManager`):** not portable from the Host and hides a
  partially removed tree; rejected in favor of an explicit confirmation.
