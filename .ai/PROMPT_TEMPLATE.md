# ContentOS Implementation Prompt Template

Use this template when asking Codex or another AI assistant to implement a focused ContentOS task.

```md
Implement Commit <number>: <title> for ContentOS.

Context
- Read `.ai/ARCHITECTURE.md`, `.ai/CODING_STANDARDS.md`, and `.ai/commit-specs/<spec>.md` before changing files.
- Preserve unrelated working-tree changes.

Scope
- Allowed paths: <paths>
- Do not modify: <paths>
- Dependencies: <allowed additions, or "do not add dependencies">

Goal
<one concise outcome>

Deliverables
- <deliverable>
- <deliverable>

Acceptance criteria
- <observable criterion>
- <observable criterion>

Implementation constraints
- Keep pages Server Components unless browser interactivity is necessary.
- Reuse existing components and semantic design tokens.
- Do not add features beyond the stated scope.
- Do not modify application packages outside allowed paths.

Validation
1. Run the relevant targeted checks.
2. Run `pnpm build` from the repository root.
3. Fix every build failure caused by the change.
4. Verify the final diff only contains in-scope files.

Completion response
- Summarize architecture decisions.
- List created, modified, and deleted files.
- List dependencies added and why.
- Report validation commands and results.
- State assumptions and known follow-ups.
- Suggest one commit message.
```

For a documentation-only task, state that explicitly and replace the build requirement only when no code or build configuration can be affected.
