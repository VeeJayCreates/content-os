# Commit 003: Authentication and workspace access

## Goal

Introduce a secure authentication boundary so ContentOS routes and API operations can identify a user and workspace.

## Scope

- Add an authentication approach compatible with the Next.js dashboard and NestJS API.
- Protect product routes and API operations that require identity.
- Define workspace membership and authorization boundaries before feature ownership is introduced.

## Out of scope

- Billing, invitations, advanced role management, and SSO.
- Changes to content production features.

## Deliverables

- Authenticated dashboard route boundary and unauthenticated entry experience.
- API identity propagation and authorization guard pattern.
- Workspace/member model or contract sufficient for future ownership checks.
- Documentation of session, token, and environment-variable expectations.

## Acceptance criteria

- [ ] Unauthenticated visitors cannot access product routes or protected API operations.
- [ ] Authenticated requests have a verified identity and workspace context.
- [ ] Authorization is enforced server-side, not only hidden in the UI.
- [ ] No credentials or secrets are exposed to the browser or committed.

## Validation steps

1. Test authenticated and unauthenticated dashboard/API paths.
2. Run relevant unit or integration tests.
3. Run `pnpm build`.
4. Review authorization and secret-handling changes against [REVIEW_CHECKLIST.md](../REVIEW_CHECKLIST.md).

## Suggested commit message

```text
feat(auth): add workspace authentication boundary
```
