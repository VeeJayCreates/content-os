# Commit 006: Content planning and production

## Goal

Add the first-class content records that belong to projects and move through a clear production lifecycle.

## Scope

- Define content entities, contracts, status transitions, API endpoints, and dashboard views.
- Associate content records with authorized projects.
- Support structured planning information required by later AI and scheduling work.

## Out of scope

- Automated publishing, media processing, and AI generation.
- A rich collaborative editor or real-time co-authoring.

## Deliverables

- Content model and migration with project ownership.
- Validated API operations and consistent domain statuses.
- Dashboard list/detail/create flows with usable empty and error states.

## Acceptance criteria

- [ ] Content records are visible only through their authorized project/workspace.
- [ ] Lifecycle status is validated on the server.
- [ ] The dashboard can create and inspect a content record without direct storage access.
- [ ] The model leaves room for media, scheduling, and AI metadata without speculative fields.

## Validation steps

1. Test authorization, validation, and status transitions.
2. Exercise responsive dashboard flows.
3. Run database migration checks.
4. Run `pnpm build`.

## Suggested commit message

```text
feat(content): add project content planning
```
