# ContentOS Roadmap

This roadmap sequences work so the platform becomes useful without prematurely coupling the dashboard, API, workflows, and persistence layers.

## Phase 0 — Foundation

Status: complete.

- Establish the pnpm workspace and Turborepo build pipeline.
- Create the NestJS API and Next.js dashboard applications.
- Define shared contracts, domain models, and Drizzle storage foundations.
- Add the responsive dashboard shell, application route group, dark visual tokens, and navigation structure.

## Phase 1 — Identity and design system

Status: planned. See [Commit 003](commit-specs/003-authentication.md) and [Commit 004](commit-specs/004-design-system.md).

- Add authenticated workspace access and session boundaries.
- Formalize dashboard UI primitives, semantic tokens, and interaction patterns.
- Ensure all product routes operate within a consistent authenticated shell.

## Phase 2 — Content operations core

Status: planned. See [Commits 005–007](commit-specs/005-projects.md).

- Deliver project management as the primary organizational unit.
- Add content planning and production records.
- Add a managed media library and asset references.

## Phase 3 — Automation and publishing operations

Status: planned. See [Commits 008–009](commit-specs/008-workflows.md).

- Define durable workflow execution and job visibility.
- Add scheduling concepts for planned publishing activity.
- Keep execution state observable and safe to retry.

## Phase 4 — AI-assisted creation

Status: planned. See [Commit 010](commit-specs/010-ai-studio.md).

- Add AI-assisted research, ideation, and generation workflows.
- Make model operations explicit, attributable, and reviewable.
- Preserve human approval points before publication-affecting actions.

## Phase 5 — Measurement and optimization

Status: planned. See [Commit 011](commit-specs/011-analytics.md).

- Expose useful operational and content-performance analytics.
- Build reporting from stable domain events and durable data contracts.
- Use analytics to improve planning and workflows rather than add isolated dashboards.

## Delivery principles

- Each milestone must leave the repository buildable and deployable.
- New capabilities extend existing boundaries rather than bypassing them.
- Authentication, observability, security, and accessibility are requirements of each phase, not deferred cleanup work.
- Commit specifications are implementation contracts; update them and the relevant ADR when a decision changes.
