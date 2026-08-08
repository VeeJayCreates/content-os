# Commit 009: Scheduler

## Goal

Enable teams to plan when approved content should be published or processed.

## Scope

- Add scheduled actions associated with authorized content and projects.
- Define timezone, status, cancellation, and rescheduling semantics.
- Add dashboard calendar/list planning views.

## Out of scope

- Social-network publishing adapters and billing-based publishing limits.
- Full calendar collaboration or external calendar synchronization.

## Deliverables

- Scheduler domain model, API contract, persistence migration, and worker-facing trigger contract.
- Dashboard routes for viewing and managing planned activity.
- Explicit timezone and execution-state documentation.

## Acceptance criteria

- [ ] Scheduling uses an unambiguous stored time representation.
- [ ] Users can only manage schedules for authorized content.
- [ ] Rescheduling and cancellation are auditable state changes.
- [ ] The UI communicates pending, completed, and failed execution clearly.

## Validation steps

1. Test timezone conversion and boundary cases.
2. Test schedule authorization and cancellation.
3. Exercise mobile and desktop planning views.
4. Run `pnpm build`.

## Suggested commit message

```text
feat(scheduler): add content scheduling foundation
```
