# Commit 010: AI Studio

## Goal

Introduce AI-assisted content creation as an observable, human-controlled workflow.

## Scope

- Add AI Studio request, result, and approval concepts.
- Integrate model calls behind an application service boundary.
- Associate generated artifacts with projects and content records.
- Expose dashboard UI for starting, reviewing, and applying AI output.

## Out of scope

- Autonomous publishing, unbounded agent execution, and provider-specific lock-in across the codebase.
- Training proprietary models.

## Deliverables

- Provider abstraction, validated request schema, and audit-friendly result storage.
- Cost, model, and execution metadata sufficient for operational review.
- Dashboard review flow with clear human approval before a result affects canonical content.

## Acceptance criteria

- [ ] AI provider credentials remain server-side.
- [ ] Requests are authorized and scoped to the active workspace/project.
- [ ] Generated output is distinguishable from approved canonical content.
- [ ] Failures, retryability, and estimated/actual cost are observable where available.

## Validation steps

1. Test provider abstraction with deterministic mocks.
2. Review prompt/input handling for sensitive data exposure.
3. Test approval and failure states in the dashboard.
4. Run `pnpm build`.

## Suggested commit message

```text
feat(ai-studio): add reviewed AI generation workflow
```
