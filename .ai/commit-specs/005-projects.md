# Commit 005: Projects

## Goal

Deliver the project management foundation that organizes ContentOS work.

## Scope

- Complete project CRUD through API, service, repository, contracts, and dashboard.
- Add project list, creation, and detail navigation patterns.
- Apply workspace authorization established in Commit 003.

## Out of scope

- Content item editing, media upload, workflow execution, and analytics.
- Cross-workspace sharing or advanced project templates.

## Deliverables

- Stable project API contracts and validated endpoints.
- Durable project persistence with appropriate migrations.
- Dashboard pages for an empty state, list, creation, and detail entry point.

## Acceptance criteria

- [ ] A user can create, list, view, update, and archive only projects in their workspace.
- [ ] Invalid input receives useful validation errors.
- [ ] Dashboard states include empty, loading, error, and populated views.
- [ ] Project status and content-type values remain aligned across domain, contracts, and storage.

## Validation steps

1. Run API tests covering authorization and validation.
2. Exercise dashboard CRUD flows at mobile and desktop widths.
3. Run migration validation where applicable.
4. Run `pnpm build`.

## Suggested commit message

```text
feat(projects): add workspace project management
```
