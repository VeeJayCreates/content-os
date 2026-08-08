# Commit Review Checklist

Use this checklist before approving every ContentOS commit.

## Scope and architecture

- [ ] The change has one clear goal and matches its commit specification.
- [ ] Only files required for that goal changed.
- [ ] Package boundaries and dependency direction are preserved.
- [ ] No business logic was added to presentation-only code.
- [ ] Shared abstractions are justified and avoid duplicate implementations.
- [ ] Architectural decisions are documented when the change establishes a lasting pattern.

## Build and correctness

- [ ] `pnpm build` succeeds from the repository root.
- [ ] Relevant lint, type, unit, and integration checks pass.
- [ ] Error states and boundary validation are handled where applicable.
- [ ] Existing public API behavior remains compatible or has an approved migration path.

## UI and accessibility

- [ ] New UI is responsive at mobile, tablet, and desktop widths.
- [ ] Keyboard navigation, focus visibility, labels, and semantic elements are correct.
- [ ] Interactive controls have accessible names and usable touch targets.
- [ ] Loading, empty, error, and disabled states are considered when relevant.
- [ ] Client Components are limited to code that genuinely needs browser interactivity.

## Performance and dependencies

- [ ] Server rendering is retained by default.
- [ ] New client JavaScript, images, and data fetching are proportionate to the feature.
- [ ] No unnecessary dependency was added.
- [ ] New dependencies are maintained, compatible with the workspace, and locked.

## Security and operations

- [ ] Authorization and data ownership are enforced at the API boundary.
- [ ] No secret, token, local database, or sensitive log output was introduced.
- [ ] User-controlled input is validated and safely rendered.
- [ ] Database changes include a safe migration and rollback consideration where applicable.

## Documentation and handoff

- [ ] Documentation, ADRs, and commit specs reflect the delivered behavior.
- [ ] The handoff records validation performed and assumptions made.
- [ ] Suggested commit message accurately describes the change.
