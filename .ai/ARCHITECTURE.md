# ContentOS Architecture

ContentOS is a pnpm workspace managed by Turborepo. It separates product surfaces, shared models, and persistence so features can evolve without coupling the dashboard directly to database internals.

## Repository shape

```text
apps/
  api/          NestJS HTTP API
  dashboard/    Next.js 16 App Router product UI
packages/
  contracts/    Shared transport-facing TypeScript contracts
  domain/       Business entities, enums, and domain events
  storage/      Drizzle schemas, database client, repositories
  typescript-config/ Shared TypeScript presets
.ai/            Engineering workflow, ADRs, and commit specifications
```

## Package boundaries

`@content-os/contracts` contains stable data shapes used across process boundaries. It must not depend on framework, UI, database, or HTTP concerns.

`@content-os/domain` expresses business vocabulary: entities, enums, and events. It must remain portable and must not import NestJS, Next.js, or Drizzle.

`@content-os/storage` owns Drizzle schemas, database connectivity, and persistence repositories. It maps database records to storage-oriented types and must not leak database access into the dashboard.

Applications compose these packages. The API owns request validation, authorization, orchestration, and response mapping. The dashboard consumes product-facing API contracts rather than storage code.

## API layering

```text
HTTP controller → DTO validation → application service → repository → Drizzle/database
```

- Controllers translate HTTP requests and responses only.
- DTOs validate untrusted input at the boundary.
- Services coordinate domain rules and repository calls.
- Repositories own queries and persistence mechanics.
- Domain events are introduced when an action needs reliable downstream processing.

Avoid placing database queries in controllers, exposing ORM tables over HTTP, or putting UI-specific presentation logic in API services.

## Dashboard architecture

The dashboard uses Next.js 16 App Router. The root `app/layout.tsx` is the global document, metadata, and global-style boundary. The application shell belongs to `app/(app)/layout.tsx`, where the route group applies shared navigation without changing URLs.

```text
app/
  layout.tsx              Global document layout
  (app)/layout.tsx        Product shell
  (app)/page.tsx          /
  (app)/projects/page.tsx /projects
components/
  layout/                 Shell composition
  providers/              Interactive UI state boundaries
  ui/                     Reusable primitives
config/navigation.ts      Single typed navigation source
```

Route groups allow future `(auth)`, `(marketing)`, or onboarding sections to have their own layouts while retaining clean public URL paths. See [ADR 0002](ADR/0002-route-groups.md).

## Server and Client Components

Pages and layouts are Server Components by default. They can read server-side data and render static or streamed UI without adding browser JavaScript.

Use Client Components only for browser-only behavior: state, event handlers, Radix interactions, responsive drawer state, or browser APIs. Keep the `"use client"` boundary as low as possible. A client shell may receive Server Component `children`; feature pages should not become client components merely because the shell is interactive. See [ADR 0003](ADR/0003-server-components.md).

## UI system

The dashboard uses locally owned shadcn-style components backed by Radix primitives and Tailwind semantic tokens. Components under `components/ui` are reusable building blocks; `components/layout` composes them into product chrome. See [ADR 0004](ADR/0004-shadcn-ui.md).

## Dependency direction

```text
dashboard ──HTTP──> api ──> domain + storage
                    │
                    └──> contracts

dashboard ───────────────> contracts (when client-safe shared types are needed)
```

Dependencies always point inward toward stable shared abstractions. The domain package never depends on an application, and the dashboard never accesses storage directly.
