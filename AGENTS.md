<!-- Generated: 2026-04-24 | Updated: 2026-04-24 -->

# minimartek

## Purpose
A Yarn 4 workspaces monorepo implementing **Mini Martech** — a minimal email-campaign manager for the 99tech take-home. Ships a React 19 SPA, an Express 4 REST API backed by PostgreSQL + Redis (BullMQ), and shared DTO/util packages. Campaigns are created with a specific recipient list (materialized synchronously), then dispatched asynchronously via BullMQ workers.

## Key Files
| File | Description |
|------|-------------|
| `package.json` | Workspace root. Scripts fan out via `yarn workspaces foreach`. Package manager: yarn@4.1.1. |
| `docker-compose.yml` | Full stack: postgres 18, redis 7, backend, frontend (nginx). |
| `Makefile` | Convenience targets: `make start` / `dev` / `migrate` / `seed`. |
| `README.md` | Setup, deviations from spec, "How I Used Claude Code" section. |
| `requirements.md` | Original take-home spec (source of truth for business rules). |
| `yarn.lock` | Yarn 4 lockfile — do not regenerate without reason. |
| `.yarnrc.yml` | Yarn 4 configuration. |
| `.prettierrc` | Prettier config used by `yarn format`. |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `apps/` | Runtime applications — `backend/` (Express API) and `frontend/` (React SPA) (see `apps/AGENTS.md`) |
| `packages/` | Shared internal packages — `dto`, `utils`, `eslint-config`, `typescript-config` (see `packages/AGENTS.md`) |
| `specs/` | Design / spec artifacts (see `specs/AGENTS.md`) |
| `.sisyphus/` | Agent work-notes: drafts, plans, evidence, notepads. Not part of runtime. |
| `.omc/`, `.omx/`, `.claude/` | Local AI-agent tooling state. Ignore in code changes. |
| `.playwright-mcp/` | Screenshots from Playwright-driven UI checks. |
| `.turbo/` | Turborepo local cache (gitignored-ish, ephemeral). |

## For AI Agents

### Working In This Directory
- This is a **Yarn 4 workspaces** repo. Always use `yarn` (not npm/pnpm). Legacy AGENTS.md snippets using `pnpm -F ...` are stale — prefer `yarn workspace <name> <script>`.
- Run root-level scripts from the repo root; they fan out via `yarn workspaces foreach -At`.
- When changing shared contracts in `packages/dto`, grep both `apps/backend` and `apps/frontend` before editing — schemas are imported source-as-source (no build step in dev).
- Never commit unless asked. Follow the "no AI slop" discipline — match existing file style.

### Testing Requirements
- Backend: `yarn workspace backend test` (Jest ESM + supertest + mock-knex).
- Frontend: no test framework configured; adding tests requires Vitest/RTL setup.
- DTO: `yarn workspace @repo/dto test` (`node --test` with tsx).
- Full sweep: `yarn test` from root.

### Common Patterns
- **Source-as-source workspaces**: `@repo/dto` and `@repo/utils` are consumed from `src/index.ts` directly in dev (Jest `moduleNameMapper`, Vite), built to `dist/` for production Docker images.
- **Status enums**: campaigns use `draft | scheduled | sending | sent`; recipients use `pending | processing | sent | failed` in DB, wire-exposed as `pending | sent | failed`. See README "Deviations" section.
- **Env**: root `.env` is consumed by `docker-compose.yml`; each app also reads its own process env (see `apps/backend/src/config/env.ts`).

## Dependencies

### External (runtime)
- Node.js ≥ 18, Yarn 4.1.1 (via corepack)
- PostgreSQL 18, Redis 7
- Docker + Docker Compose v2 (for `make start`)

### External (top-level dev)
- `prettier@^3.7.4` — root-level formatting
- `typescript@5.9.2` — pinned across all workspaces

<!-- MANUAL: Add cross-cutting notes here — they survive regeneration -->
