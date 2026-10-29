# 0002 — Register routes on the authenticated `/api` carrier

- **Status**: accepted
- **Date**: 2026-10-30

## Context

The prototype registered exact `webServer` routes and implemented a small origin check.
`@deepseek-ai/dsh-host-webserver` explicitly has no server-wide authentication or origin
policy: each route owner enforces its own. The prototype's check compared Origin with Host
and ignored `sec-fetch-site`; it did not require the owner session and did not validate the
Host authority, so a DNS-rebinding page or an unauthenticated local process could reach
routes that start processes and return launch tokens.

The Host connection service provides two documented options:

1. register on `webServer` and call `ctx.connection.requestRejection(req)` yourself;
2. register an exact Fetch route on `ctx.connection.fetch`.

The second option runs inside the `/api` carrier, which calls `connection.admit(req)` before
dispatching: Host/Origin fence, owner session, owner Peer, then the route. It also supports
`requestBody: 'streaming'` so a route can bound its own body instead of inheriting the
carrier's 300 MiB buffer. Routes must live under `/api`.

## Decision

Register all four routes through `ctx.connection.fetch`, sink the plugin's `inject` to
`['connection']`, and delete the hand-written fence, request parser, and response writer.
Use streaming bodies for POST routes with a 16 KiB cap.

## Consequences

- Authentication and origin policy are platform-owned; the plugin has no fence to drift.
- Handlers are plain `Request → Response` functions, tested without a node server.
- A transport failure or an older Harness without `ctx.connection.fetch` is reported as a
  clear diagnostic and the plugin registers no routes.
- Method mismatches return the carrier's 404 instead of a hand-built 405; this is documented
  in the API table.

## Alternatives considered

- **Keep `webServer` and call `requestRejection`**: viable and used by
  `dsh-host-open-in-app`, but it keeps a hand-written node HTTP layer (bodies, JSON, 405)
  that the Fetch registry already provides.
- **Copy the platform fence into the plugin**: rejected. A copied security check silently
  drifts from the platform; the point is to use the platform's boundary, not reproduce it.
- **Dual path with a legacy fallback**: rejected. Two trust paths double the review surface
  and the failure modes for narrow backwards compatibility.
