# ADR 0001: Establish a shared dashboard shell

Status: accepted

## Context

ContentOS needs a consistent product frame before feature pages are implemented. Repeating navigation and responsive layout logic in each route would create drift and make later authentication work harder.

## Decision

Use a shared dashboard shell composed from a desktop collapsible sidebar, fixed top navigation, and mobile drawer. Place shell composition under `apps/dashboard/components/layout` and shared interactive state under `components/providers`.

The root Next layout remains a document-level concern. The product shell is applied by the application route group layout.

## Consequences

- All product routes receive consistent responsive behavior and navigation.
- Feature pages stay independent of shell implementation details.
- The shell is an intentional client boundary, while route pages remain server-rendered by default.
- Authentication and workspace controls can be added to one shared location later.
