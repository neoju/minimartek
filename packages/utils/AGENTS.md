<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-04-24 -->

# @repo/utils

Shared runtime utilities: constants, enums, date helpers, transforms, and email helpers. No Zod — keep this package schema-free so `@repo/dto` can depend on it cleanly.

## Key Files
| File | Description |
|------|-------------|
| `src/index.ts` | Barrel re-export. All new files MUST be re-exported here. |
| `src/constants.ts` | Cross-app constants (`AUTH_HEADER`, `AUTH_SCHEME`, `API_PREFIX`, etc.) |
| `src/enums.ts` | Shared enum values (campaign status, recipient status, roles) |
| `src/date.ts` | Date-formatting / future-date helpers |
| `src/transform.ts` | Generic transform helpers (e.g. snake ↔ camel, normalize) |
| `src/email.ts` | Email normalization / validation helpers (non-Zod) |

## Structure
- Pure TypeScript, ESM, no runtime dependencies.
- Consumed as **source** in dev (backend Jest `moduleNameMapper`, Vite resolvers).
- Built to `dist/` via `tsc -b` for production Docker images.

## For AI Agents

### Working In This Directory
- Add new util → create `src/<name>.ts`, re-export from `src/index.ts`.
- Keep this package free of Zod and framework deps. It must remain importable by both the DTO layer and the browser bundle.
- Naming: enums `SCREAMING_SNAKE` or `PascalCase`; constants `SCREAMING_SNAKE`.

### Testing Requirements
- No test suite is configured here today. If adding nontrivial logic, colocate a `.test.ts` and wire up `node --test` following the `@repo/dto` pattern.

### Common Patterns
- Enum values are the single source of truth — the DB migration, the DTO schema, and the frontend helper all import from `src/enums.ts`.
- `AUTH_HEADER = "Authorization"`, `AUTH_SCHEME = "Bearer"`, `API_PREFIX = "/api"` — used by both the backend router mount and the frontend `api-client`.

## Dependencies

### Internal
None. This package is the bottom of the internal dependency graph.

### External
None at runtime. Dev-only: `typescript`, `eslint`.

<!-- MANUAL: -->
