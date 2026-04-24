<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-04-24 -->

# apps

## Purpose
Container for runtime applications. Each subdirectory is an independent Yarn workspace with its own `package.json`, build, and Dockerfile, but shares code via `@repo/*` packages.

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `backend/` | Express 4 REST API, Knex + PostgreSQL, BullMQ workers (see `backend/AGENTS.md`) |
| `frontend/` | React 19 SPA with Vite, Redux, SWR, shadcn/ui (see `frontend/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- Do **not** put shared code here. Anything both apps import belongs in `packages/dto` or `packages/utils`.
- Each app is published as a Docker image via its own `Dockerfile`. Build context is the **repo root** (not the app dir) so workspace deps resolve.

### Common Patterns
- Both apps consume `@repo/dto` and `@repo/utils`. Dev resolves to source; prod resolves to built `dist/`.
- Port conventions: backend `:3001`, frontend dev `:5173`, frontend container nginx `:80 → host :8080`.

## Dependencies

### Internal
- `packages/dto` — request/response schemas shared across the API boundary
- `packages/utils` — constants (e.g. `AUTH_HEADER`, `API_PREFIX`), date helpers, enums

<!-- MANUAL: -->
