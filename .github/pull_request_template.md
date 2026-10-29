## Summary

<!-- What changed and why. Link the issue if there is one. -->

## Type of change

- [ ] Bug fix
- [ ] Refactor without behavior change
- [ ] Feature
- [ ] Documentation
- [ ] Tooling / CI

## Checklist

- [ ] `pnpm check` passes locally.
- [ ] New behavior has a test; a bug fix has a regression test.
- [ ] Both `en` and `zh` strings were updated for user-visible text.
- [ ] `pnpm build` was run and `lib/index.js` / `lib/client.js` are committed with the source change.
- [ ] No launch URL, token, or unredacted child output is logged or returned by `/list`.
- [ ] Routes stay on `ctx.connection.fetch`; no raw `webServer` route with a custom fence was added.
- [ ] New resource (timer, listener, child, lease) has an owner and a cleanup path.
- [ ] DSH internal contracts changed? Update `docs/integration-contracts.md` and add an ADR.
- [ ] Desktop-only behavior was checked manually, or the gap is stated below.

## Manual verification

<!-- DSH version, OS, and what you exercised. Write "not applicable" for docs-only changes. -->
