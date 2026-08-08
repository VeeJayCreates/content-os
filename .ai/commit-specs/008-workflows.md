# Commit 008: Workflows and job execution

## Goal

Make repeatable content operations visible and durable through workflows and jobs.

## Scope

- Formalize workflow and job domain models, statuses, events, storage, and API operations.
- Add dashboard workflow and job-status views.
- Define explicit retry, failure, and human-approval states.

## Out of scope

- A visual drag-and-drop workflow builder.
- All AI providers and publishing integrations.

## Deliverables

- Durable workflow/job lifecycle and validated transitions.
- Repository and API operations that are safe to retry.
- Dashboard status visibility with empty, running, failed, and completed states.

## Acceptance criteria

- [ ] Workflow execution state survives process restarts.
- [ ] Jobs cannot transition through invalid states.
- [ ] Failures are observable without exposing sensitive payloads.
- [ ] Retry behavior is explicit and idempotency is considered.

## Validation steps

1. Test status transitions, failures, and retries.
2. Verify workspace/project authorization.
3. Run persistence migration checks.
4. Run `pnpm build`.

## Suggested commit message

```text
feat(workflows): add durable workflow execution
```
