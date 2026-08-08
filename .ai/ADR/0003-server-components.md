# ADR 0003: Default to Server Components

Status: accepted

## Context

ContentOS will contain data-rich routes, but most page composition does not require browser-side state. Making pages client-rendered by default would increase JavaScript, blur data boundaries, and make secure server access less direct.

## Decision

Use Server Components for pages, layouts, data loading, and static presentation by default. Introduce Client Components only for interactions that require browser capabilities, including sidebar state, mobile navigation, Radix primitives, local UI state, effects, and event handlers.

## Consequences

- Product pages can fetch server-side data without exposing storage or credentials to the browser.
- Client bundles remain focused on actual interactions.
- Interactive shells may receive server-rendered `children` instead of forcing all descendants to be client components.
- New `"use client"` directives require a concrete justification during review.
