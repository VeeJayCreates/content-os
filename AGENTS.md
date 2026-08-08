# ContentOS Rules

## General
- One git commit per task.
- Every commit must compile.
- Run pnpm build before completion.
- Never modify unrelated files.
- Never change package boundaries without approval.

## Dashboard
- Next.js 16 App Router only.
- Server Components by default.
- Client Components only when necessary.
- Use shared UI components.
- Mobile-first responsive design.
- Dark theme by default.
- No business logic in page components.

## API
- NestJS modules remain feature-based.
- DTOs should use shared contracts where appropriate.
- Avoid duplicating enums.

## Packages
- contracts: transport DTOs only.
- domain: business entities and rules.
- storage: persistence only.