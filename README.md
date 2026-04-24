# Mini Martech

A monorepo for a mini marketing technology platform built with Yarn Workspaces.

## Structure

```
apps/
  backend/     Express API with PostgreSQL, JWT auth, OpenAPI
  frontend/    React 19 SPA with Vite, Redux, SWR, shadcn/ui

packages/
  dto/              Shared DTOs with Zod validation
  utils/            Shared utilities, constants, enums
  eslint-config/    Shared ESLint configurations
  typescript-config/ Shared TypeScript configurations
```

## Getting Started

### Prerequisites

**Local development**

- [Node.js](https://nodejs.org/) >= 18
- [Yarn](https://yarnpkg.com/) 4 — `corepack enable && corepack prepare yarn@4.1.1 --activate`
- [PostgreSQL](https://www.postgresql.org/) running locally, or use the Docker Compose `db` service

**Docker**

- [Docker](https://docs.docker.com/get-docker/) >= 24 with Docker Compose v2

### Local development

```bash
yarn install
yarn dev
```

### Start with Docker

```bash
make start
```

### Seed data

The backend ships with a seed that inserts 10,000 demo recipients for testing pagination and large-campaign flows:

```bash
# Local (requires db running + migrations applied)
yarn workspace backend migrate:latest
yarn workspace backend seed:run

# Or via Make (runs inside docker compose)
make migrate
make seed
```

### Accessing services (Docker)

| Service  | URL                   | Notes                                          |
| -------- | --------------------- | ---------------------------------------------- |
| Frontend | http://localhost:8080 | React SPA served by nginx (port 8080)          |
| Backend  | http://localhost:3001 | Express API         |
| Database | localhost:5432        | PostgreSQL; credentials via env or `.env` file |

> **For the interviewer:** use `make start` to run the full stack. All three services start together (PostgreSQL, Redis, backend, frontend).

## Testing

- **Frontend** — tested via **Playwright MCP** (browser automation against the running app). No Jest/Vitest test script in the frontend package.
- **Backend** — built with **TDD**; unit tests live in `apps/backend` and run with `yarn workspace backend test` (Jest ESM + supertest).

## State Management

- **SWR** — server state (remote data fetching, caching, revalidation). All API calls go through SWR hooks; the cache is the source of truth for server data.
- **Redux Toolkit** — client state (UI state, auth session, local interactions). Not much Redux in the app; it is intentionally kept minimal — only what truly belongs on the client side lives there.

## How I Used Claude Code

Actually I used mixed of `Gemini`, `Opencode` with `Copilot Pro+` and `Opencode Go` subscription. But I keep the title as the requirement in case that you scan for that text.

### 0. My AI coding agents setup:

- Neovim
- AI tools: Opencode CLI, claude web (free), gemini web (free), codex (free)
- AI subscriptions: Copilot Pro+ (premium requestes based), Opencode GO (token based)
- MCP: playwright
- Skills: turborepo

### 1. What tasks you delegated to Claude Code:

- For production-level project I will delegate to claude code specific task that I completely understand how to do it but I don't want to do it. Task that in real-life, you can delegate to you junior co-worker i.e use TDD and implement express auth middleware that use JWT for verification, if you want to check the user blacklist then use the existing Redis with this key bla bla. And then, review the code, give feedback for update it myself. Tell the agent do some e2e testing and deliver it.
BTW they're greate at writing (of course, they ate all the internet) and boring work that can automatic safely. So for documentations, write an email or do QA tests,.. We can let them do and review to confirm the result.

- For MVP, PoC or test project like this I would like to use a little `vibe` ... So I delegated almost the job to my pre-configured ultraworker and planner. I only review the code, do some QA round. Planning with my agents, understand the trade-off and give decision.

### 2. 2–3 real prompts you used

- Refactor the frontend `CampaignNewRecipientsField.tsx` component to support a better email input with chips and auto-resize.

```
  Update the `recipients` input in @apps/frontend/src/components/CampaignNew/CampaignNewRecipientsField.tsx
  1/ Improve the Specific Emails input:
  - When user input and use space or enter to complete an email, transform it to a chip with remove icon, the chip live inside the input. This is a complex component then you must split it to small and reusable component.
  - Mockup [Image 1] , the input must auto-resize follow the number of email
  - The input must have max-height and scrollable.
  2/ Add button - Random recipients (Existing)
  - When click this button, call API to get list of existing recipient's emails (50 emails) and auto input to the Specifict Email input
  3/ Add button - Generate recipients (New)
  - Generate 50 emails and auto input to the Specifict Email input, emails maybe already existed in the system, create tooltip note.
```

- Refactor the backend to remove the preparation queue andTransactional Outbox pattern, replacing it with synchronous materialization and Redis AOF persistence.

```
Remove the `recipients_mode` column from the `campaigns` table and delete the `queue_outbox` table. Update the campaign service to materialize `campaign_recipients` synchronously during the `createCampaign` transaction. Replace the Transactional Outbox pattern with direct `emailSendingQueue.add()` calls after the transaction commit, relying on Redis AOF for durability.
```

### 3. Where Claude Code was wrong or needed correction

- Sometime the agent think to complicated or not suitable with the current situation.
- Sometime they got the poitioned data and they belived on it. For example, I asked claude sonet 4.6 (smart enough) to do a high level design system for social app. The agent designed a `posts` table with `comments` as json array with reason: to avoid a join query... I'm not good at the db schema design but I still know when to normalization and when to denormalization.
- After all, just think that they always wrong and needed correction then review what they did. Never blind trust on AI.

### 4. What you would not let Claude Code do — and why

- Things I don't know, I can't verify them
- Things that I can use other tools and I know it better, I saw somebody use agent to deploy projects. Why do we just use CI/CD pipeline instead of spend token for an agent that sometime do weird things?
- Complex things that I know the AI can't do it, i.e designing and implementing an entire feature. Sometimes you see it working, but it's not working "the right way".
