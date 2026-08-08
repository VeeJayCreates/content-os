# ADR 0004: Adopt locally owned shadcn-style UI primitives with Radix

Status: accepted

## Context

The dashboard needs accessible, composable foundations for controls, overlays, tooltips, and navigation. A large opaque component-library dependency would limit product-specific design while hand-building every accessibility behavior would be costly.

## Decision

Use shadcn-style components stored in the dashboard repository and backed by Radix primitives. Maintain reusable building blocks in `apps/dashboard/components/ui`, shell composition in `components/layout`, and semantic visual tokens in `app/globals.css`.

## Consequences

- ContentOS owns the component source and can tailor it without waiting on a library release.
- Radix provides accessible primitive behavior for overlays, slots, separators, and tooltips.
- Dependency additions remain component-driven and minimal.
- The design system must be maintained as product code: changes require accessibility, responsive, and build validation.
