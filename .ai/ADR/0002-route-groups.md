# ADR 0002: Use an App Router route group for product routes

Status: accepted

## Context

The root path and all current dashboard pages share a product shell, but future authentication or public pages should not inherit it. URL paths must remain clean.

## Decision

Place product routes in `apps/dashboard/app/(app)/`. The group layout provides the shell; parenthesized group names do not appear in URLs.

## Consequences

- `/`, `/projects`, and other product paths remain stable and readable.
- A future `(auth)` or `(marketing)` group can use a different nested layout without restructuring product routes.
- The root `app/layout.tsx` remains the required document layout and avoids product navigation concerns.
- Route groups must not define duplicate resolved paths.
