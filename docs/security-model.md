# Security model

The plugin starts processes and handles a bearer token, so its security posture is part of
the product. This document lists the assets, the boundaries, the threats, and where each
mitigation lives.

## Assets

| Asset                   | Why it matters                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Target launch URL       | Contains a bearer token that grants full API access to the target profile while its process lives.               |
| Owner browser session   | The cookie that authenticates every `/api` request. The plugin does not mint or store it.                        |
| Host process privileges | The Host can read the user's files and run commands; the plugin must not let a request choose a command or path. |
| Embedded guest          | Runs an untrusted external origin; it must stay inside the Desktop lease sandbox.                                |

## Boundaries

```text
untrusted page / local process
        │  HTTP
        ▼
[ /api carrier: Host/Origin fence + owner session ]   ← platform-enforced
        │  owner Peer only
        ▼
[ plugin routes: input validation ]                   ← src/host/routes.ts
        │  allow-listed home + validated name
        ▼
[ supervisor: fixed dsh command ]                     ← src/host/supervisor.ts
        │
        ▼
[ leased webview: Desktop-enforced guest sandbox ]    ← src/client/embed.ts
```

## Threats and mitigations

| Threat                                             | Mitigation                                                                                                                                                                     | Where                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Cross-site request triggers a launch               | Requests need the owner session cookie and pass the carrier's `sec-fetch-site`/Origin fence. The plugin adds no route outside `/api`.                                          | platform carrier; `src/host/routes.ts`               |
| DNS rebinding reaches a plugin route               | The carrier's Host fence requires a loopback/trusted/bind authority and a matching Origin; the plugin no longer implements its own weaker check.                               | platform carrier                                     |
| Unauthenticated local process launches a profile   | No cookie means 401; foreign Origin means 403.                                                                                                                                 | platform carrier                                     |
| Request injects a command or path                  | Only a resolved `dsh` executable is spawned; the name must match `PROFILE_NAME_PATTERN`; the home must be in the discovery/config allow-list.                                  | `src/host/launcher.ts`, `src/host/routes.ts`         |
| Token leaks through `/list`                        | `ListResponse` has no URL field; only `/status` returns the URL, to the owner session.                                                                                         | `src/shared/protocol.ts`, `src/host/routes.ts`       |
| Token leaks through logs                           | The supervisor logs the URL's origin only; error details pass through `sanitizeDetail`, which replaces URLs with origins and redacts token-shaped query values.                | `src/host/redact.ts`, `src/host/supervisor.ts`       |
| Token leaks through the DOM                        | The URL is passed only to `webview.loadURL`; no attribute, `href`, title, or dataset contains it.                                                                              | `src/client/embed.ts`                                |
| Token leaks through an error string                | Route errors carry a stable code plus optional redacted detail; unexpected errors return opaque `internal-error`.                                                              | `src/host/routes.ts`, `src/host/errors.ts`           |
| Oversized or malformed body exhausts the Host      | POST routes declare `requestBody: 'streaming'` and refuse bodies above 16 KiB; JSON errors return 400.                                                                         | `src/host/routes.ts`                                 |
| Spawn storm exhausts resources                     | `maxRunning` (default 3) rejects additional profiles with 429; duplicate opens reuse the record.                                                                               | `src/host/supervisor.ts`                             |
| Orphaned process groups                            | POSIX spawns detached and signals the process group; Windows uses `taskkill /T /F` after a grace period; plugin unload and process exit signal synchronously as a last resort. | `src/host/process.ts`, `src/host/supervisor.ts`      |
| Abandoned servers after a tab crash                | The Client heartbeats `/status` while embedded; a server with no heartbeat for `idleStopMs` is stopped.                                                                        | `src/client/controller.ts`, `src/host/supervisor.ts` |
| Guest opens arbitrary windows or navigates the app | Guest pop-ups are forwarded to the system browser; the element uses the official leased attributes and the Desktop main process owns navigation policy.                        | `src/client/embed.ts`, Desktop `will-attach-webview` |
| Plugin crash blanks the sidebar                    | Each slot entry is wrapped in an error boundary; a failing entry renders nothing and logs.                                                                                     | `src/client/ui/ErrorBoundary.tsx`                    |
| Renderer crash inside the guest                    | `render-process-gone`/`destroyed` produce a retryable error card and release the lease.                                                                                        | `src/client/embed.ts`                                |

## Secret handling rules

1. Keep launch URLs in memory only. Do not put them in `localStorage`, `sessionStorage`,
   cookies, URLs, logs, telemetry, or DOM attributes.
2. Log origins, profile names, and homes; never query strings.
3. Sanitize all child output before returning or logging it: strip ANSI, collapse control
   characters, cap the length, redact token values, replace URLs with origins.
4. Return the URL only from `/status`; `/list` must stay URL-free.
5. Treat the guest as hostile: no script injection, no Node integration, no direct IPC.

## Residual risks

- Anyone who obtains the launch URL before the target stops has the target profile's API
  authority. This is inherent to the DSH token model.
- An authenticated owner can start any discovered profile. That is the intended feature.
- Two windows can own the same target; returning in one stops the server for both.
- A guest's address bar contains the token URL; the guest is that profile's own UI.
- A system sleep longer than the idle timeout can stop an on-screen server; the Client
  offers Retry.
- The plugin runs in-process with the Host and has the user's privileges, like every DSH
  plugin. Review the source before installing; pin a version when deploying.

## Reporting

See [SECURITY.md](../SECURITY.md). Report suspected vulnerabilities through GitHub's private
vulnerability reporting, not a public issue.
