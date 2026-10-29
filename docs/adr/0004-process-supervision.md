# 0004 — Supervise target servers with heartbeat-based idle recovery

- **Status**: accepted
- **Date**: 2026-10-30

## Context

The prototype spawned a target server and relied on the Client to stop it when the user
clicked Back. The Host had no start timeout, no concurrency limit, no idle recovery, and sent
only SIGTERM to the direct child. Consequences: a page refresh or crash leaked a server
forever; a server that never printed its URL stayed "starting"; a dsh child's workers could
survive; and repeated launches could exhaust resources.

## Decision

The Host owns every target server:

- Spawn POSIX children detached and signal the process group; on Windows use
  `taskkill /T /F` after a grace period. Escalate from SIGTERM to SIGKILL after
  `killGraceMs` and wait for exit.
- Bound startup with `startTimeoutMs`; a timeout is a readable `start-timeout` error state.
- Bound concurrency with `maxRunning`; additional opens get 429.
- Refresh `lastSeenAt` on `/open` and `/status`. The Client calls `/status` every
  `keepaliveMs` (30 s) while embedded. A sweep stops records idle for `idleStopMs`
  (default 15 min, `0` disables).
- Kill every owned process on plugin unload and, synchronously, on process exit.
- Keep the launch URL in the record but never log it; expose it only through `/status`.

## Consequences

- A closed tab or crashed page cannot leak a server beyond the idle window.
- A running target keeps its server alive even when the menu is closed, because the
  heartbeat comes from the embedded surface.
- Two pages that open the same target share one record; returning in either page stops it
  for both. That is documented as a limitation.
- A system sleep longer than the idle window can stop an on-screen server on wake; the error
  card offers Retry.
- Termination is best effort: an unkillable process is logged and its record removed, and the
  OS reclaims it when the Host exits.

## Alternatives considered

- **Stop only on Back (prototype)**: leaks on refresh/crash; rejected.
- **Stop when the guest disconnects**: not observable from the Host without a heartbeat;
  rejected.
- **Kill by process name**: unsafe with multiple profiles and unrelated processes; rejected
  in favor of recorded pids and process groups.
