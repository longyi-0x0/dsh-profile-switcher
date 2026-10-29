# Security policy

## Supported versions

Security fixes are released for the latest 1.x version. The plugin is tested against
DeepSeek Harness Desktop/runtime 0.2.x; older Harness releases that lack
`ctx.connection.fetch` are unsupported and the plugin refuses to register routes.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting on the repository
(`Security` → `Report a vulnerability`). Do not open a public issue for a suspected
vulnerability. Include the DSH version, the plugin version, the operating system, and a
minimal reproduction. We aim to acknowledge reports within a few days.

## What the plugin protects

- **Launch URL.** A target profile's URL carries a bearer token. It is memory-only, returned
  only by `/status` to the authenticated owner session, and stripped from logs and error
  details.
- **Plugin routes.** They are registered on the platform's authenticated `/api` carrier, so
  the Host/Origin fence and owner-session authentication run before any plugin code.
- **Process launching.** Only a resolved `dsh` executable is spawned, with a validated
  profile name and a home from the allow-list. A request cannot inject a command or path.
- **Guest isolation.** The embedded page is an untrusted external origin in a leased
  webview. The Desktop main process admits only leases it issued; the plugin never enables
  Node integration or injects code into the guest.

## In scope

- Bypassing authentication or the Host/Origin fence on plugin routes.
- Leaking a launch token through `/list`, `/status`, logs, error messages, telemetry, or
  the DOM.
- Spawning an arbitrary command, path, or profile name from a request.
- Cross-profile or cross-origin access caused by the lease/webview lifecycle.
- Denial of service that a remote page or an unauthenticated local process can trigger
  (for example unbounded body buffering or process spawning).

## Out of scope

- An authenticated owner choosing to launch a profile; that is the feature.
- Malicious behaviour of the target profile itself, or of a plugin installed in it.
- A local process that already has the owner's session cookie or filesystem access.
- The launch token being visible in the guest's own address bar: DSH's token model puts it
  there, and the guest is the profile's own UI.

## Residual risks

- The launch URL grants the target profile's API authority to anyone who obtains it; the
  plugin removes the usual leak paths but cannot change the DSH token model.
- Two browser windows can open the same profile; returning in one stops the server for both.
- A system sleep longer than the idle timeout can stop a server that is still on screen.
  The Client shows a retryable error.
- The plugin runs in the Host process with the user's privileges, like any DSH plugin.

See [docs/security-model.md](docs/security-model.md) for the threat model and the mapping to
code.
