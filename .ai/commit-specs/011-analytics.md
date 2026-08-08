# Commit 011: Analytics

## Goal

Provide trustworthy operational and content-performance insights built on stable source data.

## Scope

- Define analytics metrics, aggregation boundaries, API contracts, and dashboard visualizations.
- Establish metric definitions and time-range semantics.
- Surface actionable project, content, workflow, and scheduler information.

## Out of scope

- Predictive analytics, attribution modeling, and unrestricted custom reporting.
- Metrics without a documented source of truth.

## Deliverables

- Documented metric catalog and data ownership rules.
- Server-side aggregation/query layer that does not expose raw storage to the dashboard.
- Responsive dashboard analytics views with loading, empty, and error states.

## Acceptance criteria

- [ ] Every displayed metric has a documented definition and source.
- [ ] Authorization prevents cross-workspace data exposure.
- [ ] Empty or incomplete data is communicated honestly.
- [ ] Queries and payloads are bounded for predictable performance.

## Validation steps

1. Test metric calculations against known fixtures.
2. Verify time-range and timezone behavior.
3. Review query performance and authorization.
4. Run `pnpm build`.

## Suggested commit message

```text
feat(analytics): add operational analytics foundation
```
