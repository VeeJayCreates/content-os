# Coding Standards

These standards apply to every ContentOS contribution, whether authored by a human or an AI assistant.

## Delivery discipline

- Complete one focused task per commit.
- Every commit must compile; run `pnpm build` before completion.
- Fix build failures caused by the change before handoff.
- Do not modify unrelated files, generated artifacts, or another task's in-progress work.
- Keep file scope minimal and explain every dependency addition.
- Do not commit secrets, local databases, build output, or machine-specific state.

## Architecture and modularity

- Preserve the boundaries described in [ARCHITECTURE.md](ARCHITECTURE.md).
- Prefer small, reusable components and functions over feature-specific duplication.
- Keep features modular: route, feature UI, API orchestration, and persistence concerns must remain separate.
- Do not put database access in controllers or dashboard components.
- Do not expose storage schemas as public API contracts.
- Promote shared behavior deliberately; avoid creating a shared abstraction for a single call site.

## Next.js and UI

- Use Server Components by default.
- Add `"use client"` only when state, event handlers, effects, or browser APIs are required.
- Keep client boundaries low in the tree and pass server-rendered children through interactive shells where appropriate.
- Use semantic Tailwind tokens such as `background`, `foreground`, `card`, `muted`, and `border`; do not scatter arbitrary visual values through feature pages.
- Build mobile-first, then enhance for larger screens.
- Use semantic HTML, visible focus styles, keyboard-operable controls, and meaningful accessible names.
- Drive repeated navigation or menu structures from typed configuration rather than duplicating arrays in components.

## TypeScript and API quality

- Keep TypeScript strict. Avoid `any`; use explicit types, `unknown`, and narrow at boundaries.
- Validate untrusted API input through DTOs.
- Return predictable error semantics and preserve backward compatibility unless a versioned change is approved.
- Keep domain enums and shared contracts aligned; do not define competing representations without an explicit migration plan.

## Dependencies

- Never add a dependency without a clear capability need, maintenance rationale, and bundle/runtime impact assessment.
- Prefer existing workspace packages and platform capabilities.
- Pin only when reproducibility or compatibility requires it; rely on the lockfile for resolved versions.
- Remove unused dependencies in the same task that makes them obsolete.

## Documentation

- Update an ADR for a durable architectural decision.
- Update the relevant commit specification when scope or acceptance criteria change.
- Document non-obvious trade-offs, external assumptions, and validation results in the pull request or handoff.
