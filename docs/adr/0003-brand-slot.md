# 0003 — Replace the sidebar brand-name slot

- **Status**: accepted
- **Date**: 2026-10-30

## Context

The requested UX puts the profile switcher in the sidebar brand area, next to the official
wordmark. The sidebar declares `sidebar.brand.name` as a `single` slot and ships the official
wordmark as its occupant. The slot catalog marks replacing it with
`replaceRisk: "shadows-shipped-ui"`.

`sidebar.brand.name` is the only brand-adjacent name slot; `sidebar.brand.mark` holds the
fish logo, and `sidebar.footer.action` is an unrelated location at the foot of the sidebar.
The Host does not export a stable plugin module for the wordmark; the plugin skill says not
to import the primitives package because it changes without notice.

## Decision

- Occupy `sidebar.brand.name` at priority `-1000001` so the trigger replaces the plain
  wordmark occupant.
- Reproduce the official wordmark geometry locally in `src/client/ui/Wordmark.tsx`, copied
  from the MIT-licensed primitive with attribution in `NOTICE`. This is the documented
  practice: copy markup/CSS from the primitive, do not import it.
- Render the active profile name after the wordmark and keep the fish logo slot untouched.
- Wrap the entry in an error boundary so a failure hides only this slot.
- Document the trade-off here and in the integration contracts.

## Consequences

- The brand area matches the Host visually while gaining the profile control.
- If the Host updates its wordmark, the copy goes stale. Regenerate the component and check it
  against the running sidebar.
- Another plugin that also replaces the same slot at a lower priority wins; the trigger
  disappears rather than breaking the page.
- The rest of the sidebar and the Host remain functional if this registration fails.

## Alternatives considered

- **`sidebar.footer.action`**: additive and no shadowing, but it moves the trigger away from
  the brand position the UX requires and competes with footer actions.
- **Import `@deepseek-ai/dsh-client-ui-primitives`**: rejected. It is an internal baseline
  module, not a plugin API, and it can change without notice.
- **Plain-text product name**: rejected. The prototype shipped this; it duplicates the brand
  with different typography and hardcodes a product name that is not part of the slot
  contract.
