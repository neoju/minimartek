<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-04-24 -->

# packages

## Purpose
Shared internal packages consumed by apps via `workspace:*` protocol. Dev mode resolves directly to TypeScript source; production builds emit `dist/` for Docker images.

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `dto/` | Zod schemas + inferred TS types — API contracts (see `dto/AGENTS.md`) |
| `utils/` | Shared constants, enums, helpers — runtime utilities (see `utils/AGENTS.md`) |
| `eslint-config/` | Shared ESLint flat configs (`base.js`, `next.js`, `react-internal.js`) |
| `typescript-config/` | Shared `tsconfig` presets (`base.json`, `nextjs.json`, `react-library.json`) |

## For AI Agents

### Working In This Directory
- Every package is `"private": true` with `"type": "module"`. Exports come from `src/index.ts` (dev) or `dist/index.js` (built).
- Adding a new package: create `packages/<name>/package.json` with `"name": "@repo/<name>"`, `"workspace:*"` will pick it up — no root-level registration needed beyond the workspace glob.
- When adding a public export, **always** re-export from the package's `src/index.ts` barrel. Consumers rely on root imports (`import { X } from "@repo/dto"`), not deep paths.

### Common Patterns
- `@repo/dto` depends on `@repo/utils` (for enum constants). `@repo/utils` has no internal deps.
- Config packages (`eslint-config`, `typescript-config`) have no `src/` — they export JSON/JS configs directly from the package root.

## Dependencies

### External
- `zod@^3.23.8` — schema library used throughout `dto`
- `typescript@5.9.2` — pinned version; do not bump without a coordinated upgrade

<!-- MANUAL: -->
