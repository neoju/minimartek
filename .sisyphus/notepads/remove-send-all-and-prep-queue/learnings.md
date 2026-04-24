# Learnings

## Project Conventions

- Turborepo + pnpm monorepo
- Backend: Express 4, Knex (PostgreSQL), JWT auth, NodeNext ESM (imports use `.js` suffix)
- Frontend: React 19, Vite, Redux Toolkit + SWR, shadcn/ui
- Shared DTOs: `@repo/dto` (packages/dto/src/campaign.ts)
- Tests: Jest ESM + supertest + mock-knex (see apps/backend/tests/auth.test.ts as canonical pattern)
- Migration: edit in place (apps/backend/migrations/20260421000000_init.ts), NO new migration files
- Batch size: EMAIL_SEND_BATCH_SIZE → 5 (was 50)
- Worker concurrency: stays at 10

## Key Files

- Migration: apps/backend/migrations/20260421000000_init.ts
- DTO: packages/dto/src/campaign.ts, packages/dto/src/index.ts
- Service: apps/backend/src/modules/campaigns/service.ts
- Serialize: apps/backend/src/modules/campaigns/serialize.ts
- Queues: apps/backend/src/queues/queues.ts
- Outbox (DELETE): apps/backend/src/queues/outbox.ts
- Preparation worker (DELETE): apps/backend/src/queues/workers/preparation.ts
- Email-sending worker: apps/backend/src/queues/workers/email-sending.ts
- Stalled-reclaimer: apps/backend/src/queues/workers/stalled-reclaimer.ts
- Constants: apps/backend/src/queues/constants.ts
- Queue index: apps/backend/src/queues/index.ts

## DTO Trim

- Campaign DTO now only accepts explicit recipient email arrays capped at 1000.
- Campaign status enum is reduced to draft/scheduled/sending/sent, and CampaignResponse no longer exposes recipients_mode.

## Environment Bootstrap

- Root `.env.example` should mirror compose-interpolated vars only; backend runtime env stays in `apps/backend/.env.example` and is injected via `env_file`.
- `make start` now bootstraps `.env` automatically from `.env.example` when absent, before touching Docker services.
- For backend containers, `env_file` provides shared app vars while `environment:` overrides Docker-specific values like `NODE_ENV`, `DB_HOST`, and `REDIS_HOST`.
