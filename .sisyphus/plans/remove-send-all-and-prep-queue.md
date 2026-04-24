# Remove "Send All" Mode and Preparation Queue

## TL;DR

> **Quick Summary**: Remove campaign "send to all recipients" mode and the entire preparation BullMQ queue. Materialize `campaign_recipients` synchronously inside `POST /campaigns` (list capped at 1,000 emails). Drop the `queue_outbox` transactional-outbox pattern; rely on Redis AOF durability plus an extended stalled-reclaimer that rescues campaigns stuck in `sending` with no active dispatch job. Preserve per-campaign FIFO + `SKIP LOCKED` fairness at worker concurrency 10; reduce batch size from 50 → 5.
>
> **Deliverables**:
>
> - Init migration edited in place: `creating` removed from `campaign_status`, `recipients_mode` column dropped, `queue_outbox` table + `queue_name` + `queue_outbox_action` enums dropped.
> - DTO: `RecipientsModeSchema` deleted, `recipient_emails` is `z.array(email).min(1).max(1000)`, `CampaignStatusSchema` = `['draft','scheduled','sending','sent']`, `recipients_mode` gone from `CampaignResponseSchema`.
> - Backend service: `createCampaign` synchronously inserts `campaign_recipients` inside Knex transaction; `scheduleCampaign` and `sendCampaign` always take the specific-list path; no preparation enqueue anywhere.
> - Queue layer: `preparation.ts` worker deleted, `preparationQueue` / `PreparationJobData` / `enqueuePreparationJob` / `createImmediatePreparationJobId` / `getPreparationSeedJobId` removed, `queues/outbox.ts` deleted, dispatch enqueues go directly to BullMQ after commit.
> - Stalled-reclaimer: additionally detects campaigns with `status='sending'`, zero `processing` recipients, and no active BullMQ job for their dispatch seed id → re-adds dispatch job directly.
> - Frontend: "All Recipients" toggle removed from `CampaignNewRecipientsField.tsx`; mode badge removed from `CampaignHeader.tsx` and `CampaignListTable.tsx`; form state type narrowed to `string[]`.
> - Backend tests (TDD): Jest + supertest + mock-knex coverage for new sync path, removed prep enqueue, `CAMPAIGN_BUSY` semantics, 1,000-cap rejection.
> - README: Deviations 2, 4, 5 rewritten; Deviation 6 updated with new rescue path; workflow diagram replaced.
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: T1 (migration) → T2 (DTO) → T4 (service refactor) → T6 (queue deletion) → T8 (stalled-reclaimer extend) → F1–F4 → user okay

---

## Context

### Original Request

> "Remove the send all option to simplify the workflow. Remove the preparation queue — instead, synchronously create campaign_recipients rows on campaign creation. Keep fairness across multiple sending queues. Dev env — edit the existing init migration in place, no new migration file."

### Interview Summary

**Key Decisions**:

- **Recipient cap**: 1,000 emails maximum per campaign (down from 10,000). Chosen to bound `POST /campaigns` latency for the sync materialization path.
- **Schema cleanup**: Both `creating` (no longer reachable once prep is gone) and `recipients_mode` (single-mode now) are removed from the schema, DTO, and service.
- **Queue/outbox simplification**: Drop the entire `queue_outbox` pattern. Redis AOF durability + extended stalled-reclaimer provides the fallback for the "PG committed but Redis add not yet confirmed" gap.
- **Fairness**: Preserved unchanged (FIFO per-campaign seed job + `FOR UPDATE SKIP LOCKED` batch claim). Batch size reduced 50 → 5 as a fairness improvement (smaller slices let other campaigns' jobs interleave faster under concurrency 10).
- **Test strategy**: TDD (RED → GREEN → REFACTOR) with Jest + supertest + `mock-knex` (existing pattern in `apps/backend/tests/`).
- **Migration strategy**: Edit `apps/backend/migrations/20260421000000_init.ts` in place. QA verifies with `pnpm -F backend migrate:rollback && pnpm -F backend migrate:latest`.
- **Unknown-email policy**: Emails in `recipient_emails` that do not exist in `recipients` are silently skipped (set-based `INSERT ... SELECT FROM recipients WHERE email = ANY(...)`). If zero recipients match → `400 NO_MATCHING_RECIPIENTS`.

**Research Findings**:

- `apps/backend/src/modules/campaigns/service.ts`: 9 touchpoints referencing `recipients_mode`, `creating`, or preparation helpers (lines 54, 82, 97, 107–108, 118–129, 276–284, 303–313, 364–377, 412–442).
- `apps/backend/src/queues/queues.ts`: remove `PreparationJobData`, `preparationQueue`, `enqueuePreparationJob`, `removePreparationSeedJob`, `getPreparationSeedJobId`.
- `apps/backend/src/queues/outbox.ts` (150 lines): full deletion; `createImmediateDispatchJobId` is the only symbol to preserve — relocate to `queues.ts`.
- `apps/backend/src/queues/workers/email-sending.ts`: replace every `queueOutboxAddJob` / `queueOutboxRemoveJob` / `flushQueueOutboxSafely` call with direct `emailSendingQueue.add()` / `emailSendingQueue.remove()` (4 call sites in `finalizeCampaignDispatch`).
- `apps/backend/src/queues/workers/stalled-reclaimer.ts`: extend to find campaigns with `status='sending'`, no `processing` recipients, and no active BullMQ job for the dispatch seed id.
- `apps/backend/src/queues/constants.ts`: `EMAIL_SEND_BATCH_SIZE` → 5 (was 50).
- Frontend mode-aware touchpoints: `CampaignNewRecipientsField.tsx` (mode toggle), `CampaignNewForm.tsx` + `types.ts` (state type), `CampaignHeader.tsx` (badge), `CampaignListTable.tsx` (badge + column), `CampaignDetail.tsx`, `CampaignEdit.tsx`, `CampaignNew.tsx` (any mode state pass-through).
- DTO: `packages/dto/src/campaign.ts` — `RecipientsModeSchema`, `"all"` literal union, `recipients_mode` in response and list item.
- README Deviations that become stale: **Deviation 2** (mentions `creating` state), **Deviation 4** (describes `recipients_mode`), **Deviation 5** (describes `queue_outbox`), **Deviation 6** (stalled-reclaimer rescue path changes), and the workflow ASCII diagram.
- Tests currently in `apps/backend/tests/`: `auth.test.ts` is the canonical mock-knex pattern. No existing campaign tests — we are adding fresh coverage.
- Frontend has no test framework configured. Verification is via Playwright QA scenarios (MCP browser tool) + backend tsc/lint/test.

### Self-Review Analysis (In Lieu of Metis Delegation)

Because plan-family agents cannot delegate to Metis via `task`, I ran the gap analysis internally and surfaced the following findings (all addressed in tasks below):

- **Unknown-email handling**: clarified → silent skip, with `400 NO_MATCHING_RECIPIENTS` if every email is unknown.
- **Duplicate emails in request**: de-duplicated before the SQL insert (set-based `IN` already collapses, but we also trim/lowercase to avoid case-sensitive dupes).
- **Race on `sendCampaign`**: if `campaign_recipients` already exist (created at `POST /campaigns`), `sendCampaign` simply transitions `draft|scheduled → sending` and enqueues dispatch. No re-materialization.
- **Existing dev data**: migration edit breaks any existing row using `recipients_mode` or `status='creating'`. Mitigation: QA scenario runs `migrate:rollback && migrate:latest` from empty.
- **Transaction boundary gotcha**: `emailSendingQueue.add()` MUST happen _after_ the Knex transaction commits — wrapping the whole thing in `.transaction()` and calling `add()` inside would leave a ghost job if the outer commit rolls back. We enqueue from the service after the `db.transaction()` callback resolves.
- **`"scheduled" → "sending"` cancel path**: `sendCampaign` called on a `scheduled` campaign must `emailSendingQueue.remove(getDispatchSeedJobId(campaignId))` before adding the immediate job. Direct BullMQ call, no outbox.
- **Stalled-reclaimer new responsibility**: the rescue SQL must check campaigns with `status='sending'` AND zero `processing` recipients AND pending recipients still exist AND no BullMQ job exists for `getDispatchSeedJobId(campaignId)`. The last check is the new piece — use `emailSendingQueue.getJob(id)`.
- **README lies if not updated**: Deviations 2/4/5/6 all become inaccurate. Treated as a first-class deliverable, not an afterthought.
- **OpenAPI JSON at `/api/openapi.json`**: regenerated at boot from Zod, so DTO changes propagate automatically. QA spot-checks the spec to confirm.
- **Seed data** (`recipients` table 10k fixture): untouched. `POST /campaigns` draws a random sample of existing recipients in QA flows.

### Must Have

- `"all"` literal is REJECTED by `CreateCampaignRequestSchema` with a 400.
- `POST /campaigns` with 1,000 valid emails completes within 5 seconds on local stack, returns `201` with `status='draft'` and the recipients already in `campaign_recipients`.
- `POST /campaigns` with 1,001 emails → 400 validation error.
- `POST /campaigns` with emails where NONE match → 400 `NO_MATCHING_RECIPIENTS`.
- `POST /campaigns` with a mix (e.g., 5 valid + 3 unknown) → 201, only 5 rows inserted into `campaign_recipients`.
- Schema enum `campaign_status` contains only `draft|scheduled|sending|sent` after migration.
- No references to `"creating"`, `"all"`, `recipients_mode`, `preparationQueue`, `enqueuePreparationJob`, `createImmediatePreparationJobId`, `getPreparationSeedJobId`, `queue_outbox`, `queueOutboxAddJob`, `queueOutboxRemoveJob`, `flushQueueOutbox`, `startQueueOutboxProcessor` anywhere in `apps/backend/src/**` or `packages/dto/src/**` (grep must return empty).
- Frontend build passes; "All Recipients" toggle is GONE from `POST /campaigns` form; no mode badge anywhere in UI.
- `pnpm build`, `pnpm lint`, `pnpm check-types`, `pnpm test` all green at repo root.
- `pnpm -F backend migrate:rollback && pnpm -F backend migrate:latest` succeeds on a clean DB.
- Stalled-reclaimer enqueues a direct BullMQ job for a campaign manually wedged into `status='sending'` with no dispatch job.

### Must NOT Have (Guardrails)

- DO NOT create a new migration file — init migration is edited in place.
- DO NOT keep the `queue_outbox` table "just in case" — fully removed.
- DO NOT leave `createImmediatePreparationJobId` lingering in `queues/queues.ts` or anywhere else.
- DO NOT keep "all" as a runtime-only branch that 400s — it must be removed at the Zod schema level.
- DO NOT relocate batch-claim SQL or change SKIP LOCKED / `ORDER BY next_attempt_at NULLS FIRST, recipient_id` — fairness logic is untouched.
- DO NOT add any form of in-memory retry/backoff inside the HTTP request; failures in `emailSendingQueue.add()` should be swallowed and rescued by the stalled-reclaimer.
- DO NOT extend the stalled-reclaimer to do anything beyond the minimum "sending without job" detection — scope is bounded.
- DO NOT touch `recipients` table schema or seed data.
- DO NOT introduce new shared types by hand — use `@repo/dto` inferred types.
- DO NOT re-use the draft plan file after execution — it is deleted at handoff.
- DO NOT generate shadcn/ui components by hand.
- DO NOT change `JWT_SECRET` defaults.

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — all verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (backend: Jest ESM + supertest + mock-knex; frontend: none).
- **Automated tests**: YES (TDD) for backend. For frontend: Playwright MCP QA scenarios (no unit tests — framework absent).
- **Framework**: `pnpm -F backend test` (Jest ESM).
- **TDD**: Each backend TODO writes the failing Jest test FIRST, implements, then refactors.

### QA Policy

Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend service**: Jest + supertest against `createApp(mockDb)`; mock-knex assertion trackers on SQL.
- **Backend migrations/queues**: `interactive_bash` (tmux) running the actual dev stack (`make start` or `docker compose up -d`), with `pnpm -F backend migrate:rollback && migrate:latest`, Postgres `psql` probes via `docker exec`, and BullMQ inspection via a one-shot `node -e` script hitting Redis.
- **Frontend**: Playwright MCP — navigate `http://localhost:5173` (or `:8080` docker), log in with seeded user, click through campaign creation, assert DOM, screenshot.
- **End-to-end**: `curl` against `http://localhost:3001/api/campaigns` with a real JWT (obtained from `/api/auth/login` with seeded credentials) — evidence includes request body + response status/body.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (foundation — can start immediately):
├── T1: Migration edit in place (creating/recipients_mode/queue_outbox drop) [quick]
├── T2: DTO trim (status enum, drop mode schema, cap 1000, response cleanup) [quick]
└── T3: Backend TDD test scaffolding (failing tests for sync path) [unspecified-high]

Wave 2 (core refactor — depends on T1/T2/T3):
├── T4: Campaign service refactor (sync insert, drop prep/outbox calls) [deep]
├── T5: Queue layer simplification (delete outbox.ts, trim queues.ts, delete preparation worker) [unspecified-high]
├── T6: email-sending worker inline direct BullMQ calls + batch size 5 [unspecified-high]
└── T7: Frontend DTO alignment + form state narrow to string[] [visual-engineering]

Wave 3 (finishers — depend on Wave 2):
├── T8: Stalled-reclaimer extend (detect sending-without-job, direct enqueue) [deep]
├── T9: Frontend UI cleanup (remove "All Recipients" toggle + mode badges) [visual-engineering]
├── T10: README Deviations rewrite + workflow diagram [writing]
└── T11: Cross-cutting grep / OpenAPI sanity / full repo build + lint + test [unspecified-high]

Wave FINAL (after ALL tasks — 4 parallel reviews, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA — full backend + frontend flow via Playwright + tmux (unspecified-high)
└── F4: Scope fidelity check — diff vs plan, no scope creep (deep)

Critical Path: T1 → T4 → T6 → T8 → T11 → F1–F4 → user okay
Max Concurrent: 4 (Wave 1 is 3, Wave 2 is 4, Wave 3 is 4, Final is 4)
```

### Dependency Matrix

- **T1 (migration)**: blocked by: none · blocks: T3, T4, T5, T11
- **T2 (DTO)**: blocked by: none · blocks: T3, T4, T7, T9, T11
- **T3 (TDD scaffolding)**: blocked by: T1, T2 · blocks: T4
- **T4 (service refactor)**: blocked by: T1, T2, T3 · blocks: T8, T11
- **T5 (queue delete)**: blocked by: T1 · blocks: T6, T8, T11
- **T6 (email-sending inline)**: blocked by: T5 · blocks: T8, T11
- **T7 (FE DTO align)**: blocked by: T2 · blocks: T9, T11
- **T8 (reclaimer extend)**: blocked by: T4, T5, T6 · blocks: T11
- **T9 (FE UI)**: blocked by: T2, T7 · blocks: T11
- **T10 (README)**: blocked by: none (can run anytime — uses plan + user intent only) · blocks: F1
- **T11 (build/lint/test/grep)**: blocked by: T4, T6, T7, T8, T9 · blocks: F1, F2, F3, F4

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `quick`, T2 → `quick`, T3 → `unspecified-high`
- **Wave 2**: 4 tasks — T4 → `deep`, T5 → `unspecified-high`, T6 → `unspecified-high`, T7 → `visual-engineering`
- **Wave 3**: 4 tasks — T8 → `deep`, T9 → `visual-engineering`, T10 → `writing`, T11 → `unspecified-high`
- **Final**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. **Edit init migration in place: drop `creating`, `recipients_mode`, `queue_outbox`, `queue_name` enum**

  **What to do**:
  - In `apps/backend/migrations/20260421000000_init.ts`:
    - Change `campaign_status` enum creation from `['draft','scheduled','creating','sending','sent']` → `['draft','scheduled','sending','sent']` (both `up` create and `down` drop paths).
    - Remove the `recipients_mode` column from the `campaigns` table definition AND remove the `recipients_mode` enum creation/drop.
    - Remove the entire `queue_outbox` table creation (and corresponding `down` drop) AND remove the `queue_name` + `queue_outbox_action` enum creations.
    - Preserve everything else unchanged (all other tables, triggers, indexes, FKs, `onUpdateTrigger`).
  - Verify: `pnpm -F backend migrate:rollback && pnpm -F backend migrate:latest` completes cleanly on empty DB.

  **Must NOT do**:
  - Do NOT create a new migration file.
  - Do NOT modify any other tables (`users`, `recipients`, `campaign_recipients`, etc.) beyond dropping the `recipients_mode` column from `campaigns`.
  - Do NOT leave `queue_name` or `queue_outbox_action` enums orphaned.

  **Recommended Agent Profile**:
  - **Category**: `quick` — Single file surgical edit.
    - Reason: Mechanical migration edit; no complex logic.
  - **Skills**: none needed
  - **Skills Evaluated but Omitted**:
    - `turborepo`: Not relevant — single-file migration edit.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2, T3)
  - **Blocks**: T3, T4, T5, T11
  - **Blocked By**: None — can start immediately

  **References**:

  **Pattern References**:
  - `apps/backend/migrations/20260421000000_init.ts:1-end` — The ONLY migration file. Follow its existing Knex style (`knex.schema.createTable`, `raw` enum creation, `onUpdateTrigger`, TIMESTAMPTZ, UUIDv7 defaults).
  - `apps/backend/AGENTS.md` — Migration conventions (UUIDv7, TIMESTAMPTZ, `onUpdateTrigger`, enum via raw SQL).

  **Test References**:
  - None — migration changes verified via `migrate:rollback && migrate:latest` run, not unit test.

  **WHY Each Reference Matters**:
  - The init migration is the single source of schema truth — any deviation from its existing style will look out of place.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Clean rollback + forward migrate succeeds
    Tool: interactive_bash (tmux)
    Preconditions: docker compose up -d (db service running, migrations previously applied)
    Steps:
      1. Run: pnpm -F backend migrate:rollback
      2. Run: pnpm -F backend migrate:latest
      3. Run: docker compose exec -T db psql -U postgres -d minimartek -c "\dT+ campaign_status"
      4. Assert output contains exactly: draft, scheduled, sending, sent (no "creating")
      5. Run: docker compose exec -T db psql -U postgres -d minimartek -c "\d campaigns"
      6. Assert no column named recipients_mode
      7. Run: docker compose exec -T db psql -U postgres -d minimartek -c "\dt queue_outbox"
      8. Assert output: "Did not find any relation named 'queue_outbox'"
    Expected Result: All assertions pass; schema matches target state.
    Failure Indicators: Any psql command returning non-zero exit, or "creating" found in enum, or recipients_mode column exists, or queue_outbox table exists.
    Evidence: .sisyphus/evidence/task-1-migration-rollback-latest.txt

  Scenario: Migration idempotency on repeat apply
    Tool: Bash
    Preconditions: Migration already applied once.
    Steps:
      1. Run: pnpm -F backend migrate:latest (second time)
      2. Capture exit code and stdout
    Expected Result: Exit 0, "Already up to date" or equivalent message; no errors.
    Evidence: .sisyphus/evidence/task-1-migration-idempotent.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-1-migration-rollback-latest.txt` with psql probes
  - [ ] `.sisyphus/evidence/task-1-migration-idempotent.txt`

  **Commit**: YES
  - Message: `refactor(db): drop creating status, recipients_mode, queue_outbox in init migration`
  - Files: `apps/backend/migrations/20260421000000_init.ts`
  - Pre-commit: `pnpm -F backend migrate:rollback && pnpm -F backend migrate:latest`

- [x] 2. **DTO trim: drop `RecipientsModeSchema`, drop `"all"` literal, cap list at 1000, drop `recipients_mode` from response**

  **What to do**:
  - In `packages/dto/src/campaign.ts`:
    - Delete the `RecipientsModeSchema` export (and any `RecipientsMode` type export).
    - Change `CampaignStatusSchema` to `z.enum(['draft','scheduled','sending','sent'])`.
    - In `CreateCampaignRequestSchema`: `recipient_emails: z.array(z.string().email()).min(1).max(1000)`. Remove any `"all"` literal union.
    - In `UpdateCampaignRequestSchema`: same treatment for `recipient_emails` (if present) — no `"all"` union.
    - Remove `recipients_mode` field from `CampaignResponseSchema` (and any `CampaignListItemSchema`).
    - Re-export changes via `packages/dto/src/index.ts` (verify `RecipientsModeSchema` is NOT re-exported).
  - Verify: `pnpm -F dto check-types`.

  **Must NOT do**:
  - Do NOT keep `RecipientsMode` as a deprecated/comment-only export.
  - Do NOT keep `"all"` as a runtime-only branch.
  - Do NOT rename unrelated schemas.

  **Recommended Agent Profile**:
  - **Category**: `quick` — Schema edits in one file.
    - Reason: Mechanical DTO trim.
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T3)
  - **Blocks**: T3, T4, T7, T9, T11
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `packages/dto/src/campaign.ts` — current DTO; follow existing Zod style (kebab-free identifiers, `z.object`, `z.enum`, `.email()`, explicit `.min`/`.max`).
  - `packages/dto/src/index.ts` — barrel re-exports.

  **API/Type References**:
  - `packages/dto/AGENTS.md` — DTO conventions, how consumers import (`@repo/dto`).

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Valid request with 1000 emails accepts
    Tool: Bash (node one-shot against DTO package)
    Preconditions: T2 edit complete, dto package built or consumed as source.
    Steps:
      1. Run: node -e "import('./packages/dto/dist/index.js').then(m => { const r = m.CreateCampaignRequestSchema.safeParse({name:'t',subject:'s',body:'b',recipient_emails:Array.from({length:1000},(_,i)=>`e${i}@x.com`)}); console.log(JSON.stringify({success:r.success})); })"
      2. Assert stdout: {"success":true}
    Expected Result: safeParse succeeds for exactly 1000 emails.
    Evidence: .sisyphus/evidence/task-2-dto-1000-ok.txt

  Scenario: 1001 emails rejects
    Tool: Bash
    Preconditions: Same.
    Steps:
      1. Run the same node one-shot with length 1001.
      2. Assert stdout: {"success":false}
    Expected Result: Validation fails.
    Evidence: .sisyphus/evidence/task-2-dto-1001-reject.txt

  Scenario: "all" literal rejects
    Tool: Bash
    Preconditions: Same.
    Steps:
      1. Run node one-shot with recipient_emails: "all".
      2. Assert safeParse returns success:false.
    Expected Result: Validation fails (no longer a valid runtime value).
    Evidence: .sisyphus/evidence/task-2-dto-all-reject.txt
  ```

  **Evidence to Capture:**
  - [ ] 3 text files above.

  **Commit**: YES
  - Message: `refactor(dto): drop RecipientsModeSchema and all-recipients mode, cap list at 1000`
  - Files: `packages/dto/src/campaign.ts`, `packages/dto/src/index.ts`
  - Pre-commit: `pnpm -F @repo/dto check-types`

- [x] 3. **TDD: failing Jest tests for sync campaign_recipients materialization**

  **What to do**:
  - Create `apps/backend/tests/campaigns.service.test.ts` (follow the `auth.test.ts` pattern exactly — ESM `.js` imports, `mock-knex` tracker).
  - Write these failing tests (RED phase):
    1. **"POST /campaigns inserts campaign_recipients synchronously when emails match"** — mock-knex tracker asserts an `INSERT INTO campaign_recipients ... SELECT ... FROM recipients WHERE email = ANY(...)` SQL is fired inside the same transaction as the `INSERT INTO campaigns` call. Response = 201 with `status: 'draft'`.
    2. **"POST /campaigns returns 400 NO_MATCHING_RECIPIENTS when zero emails match"** — tracker returns 0 rows from the SELECT; service returns 400 with error code `NO_MATCHING_RECIPIENTS`.
    3. **"POST /campaigns rejects 1001 emails with 400 validation error"** — Zod-level rejection, no DB calls expected.
    4. **"POST /campaigns rejects recipient_emails:'all' with 400"** — Zod rejection.
    5. **"POST /campaigns does NOT enqueue preparation job"** — test fixture asserts that no mock of `preparationQueue.add` exists / no call happens (use a spy on BullMQ queues).
    6. **"POST /campaigns/:id/send transitions draft→sending and enqueues emailSendingQueue job"** — mock-knex asserts the UPDATE; BullMQ spy asserts `emailSendingQueue.add` called exactly once with the dispatch seed job id.
    7. **"POST /campaigns/:id/send on scheduled removes old delayed job before enqueuing immediate job"** — BullMQ spy asserts `emailSendingQueue.remove(seedId)` then `.add(seedId, ...)` in order.
    8. **"POST /campaigns/:id/send is idempotent when already sending (returns 409 CAMPAIGN_BUSY)"** — service returns 409, no new BullMQ add.
  - Run `pnpm -F backend test -- --testPathPattern=campaigns.service` — expect ALL tests to FAIL initially (RED).

  **Must NOT do**:
  - Do NOT skip writing failing tests — TDD discipline is non-negotiable.
  - Do NOT introduce new test framework or pattern — mimic `auth.test.ts`.
  - Do NOT hit a real database.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Test authoring requires careful pattern replication.
    - Reason: Must master the existing mock-knex + supertest pattern to produce idiomatic tests.
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (alongside T1, T2)
  - **Parallel Group**: Wave 1 (with T1, T2)
  - **Blocks**: T4
  - **Blocked By**: T1 (schema shape must be final), T2 (DTO shapes are final)

  **References**:

  **Pattern References**:
  - `apps/backend/tests/auth.test.ts` — canonical mock-knex + supertest pattern. Copy imports, `createApp(mockDb)` setup, `getTracker().on('query', ...)` pattern, `.expect(201)` style.
  - `apps/backend/src/modules/auth/service.ts` — example service being tested.

  **API/Type References**:
  - `packages/dto/src/campaign.ts` — post-T2 shape is the contract under test.

  **Test References**:
  - `apps/backend/tests/auth.test.ts:describe` — block structure.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Failing tests written (RED phase confirmed)
    Tool: Bash
    Preconditions: T1, T2 complete.
    Steps:
      1. Run: pnpm -F backend test -- --testPathPattern=campaigns.service 2>&1 | tee .sisyphus/evidence/task-3-red-phase.txt
      2. Assert stdout contains "8 failed" or 8 individual failure lines.
    Expected Result: All 8 tests FAIL (service not yet implemented). Jest exit code non-zero is EXPECTED here.
    Evidence: .sisyphus/evidence/task-3-red-phase.txt

  Scenario: Test file follows auth.test.ts conventions
    Tool: Bash
    Preconditions: File created.
    Steps:
      1. Run: diff <(head -30 apps/backend/tests/auth.test.ts) <(head -30 apps/backend/tests/campaigns.service.test.ts) || true
      2. Visually confirm imports + tracker setup shape matches.
    Expected Result: Same import style, same `.js` suffixes, same `getTracker` setup.
    Evidence: .sisyphus/evidence/task-3-pattern-match.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-3-red-phase.txt`
  - [ ] `.sisyphus/evidence/task-3-pattern-match.txt`

  **Commit**: YES
  - Message: `test(backend): failing tests for sync campaign_recipients materialization`
  - Files: `apps/backend/tests/campaigns.service.test.ts`
  - Pre-commit: (tests must FAIL — no precommit check that runs them green)

- [x] 4. **Campaign service refactor: sync `campaign_recipients` insert, remove preparation enqueue, remove all outbox calls, post-commit `emailSendingQueue.add()`**

  **What to do**:
  - In `apps/backend/src/modules/campaigns/service.ts`:
    - Add a helper (private to this module) `materializeCampaignRecipients(trx, campaignId, emails)`:
      - Normalize: `const cleaned = Array.from(new Set(emails.map(e => e.trim().toLowerCase())))`.
      - Run: `INSERT INTO campaign_recipients (campaign_id, recipient_id, status) SELECT $1::uuid, id, 'pending' FROM recipients WHERE email = ANY($2::text[]) ON CONFLICT (campaign_id, recipient_id) DO NOTHING RETURNING recipient_id` (use Knex `.raw` with `trx`).
      - If returned row count is 0 → throw `new HttpError(400, 'NO_MATCHING_RECIPIENTS', 'None of the provided emails match known recipients.')`.
    - `createCampaign(payload)`:
      - Wrap in `db.transaction(async trx => { ... })`.
      - Insert into `campaigns` with `status='draft'` (no `recipients_mode` column).
      - Call `materializeCampaignRecipients(trx, campaign.id, payload.recipient_emails)`.
      - Return the created campaign (serialized — no `recipients_mode`).
    - `scheduleCampaign(id, sendAt)`:
      - Remove the "if recipients_mode === 'all'" branch entirely.
      - Remove any preparation enqueue call.
      - Just update `status='scheduled'`, `scheduled_at=sendAt`, then (after tx commit) `emailSendingQueue.add(getDispatchSeedJobId(id), { campaignId: id }, { jobId: getDispatchSeedJobId(id), delay: msUntil(sendAt) })`.
    - `sendCampaign(id)`:
      - If current `status` is `sending` or `sent` → throw `HttpError(409, 'CAMPAIGN_BUSY', ...)`.
      - If current `status` is `scheduled` → call `emailSendingQueue.remove(getDispatchSeedJobId(id))` first (direct, no outbox).
      - Update `status='sending'`, `started_at=now()`.
      - After tx commit: `emailSendingQueue.add(getDispatchSeedJobId(id), { campaignId: id }, { jobId: getDispatchSeedJobId(id) })`.
    - Remove ALL imports from `../../queues/outbox.js` — the file will be deleted in T5.
    - Remove imports of `preparationQueue`, `enqueuePreparationJob`, `createImmediatePreparationJobId`, `getPreparationSeedJobId`, `flushQueueOutbox`, `queueOutboxAddJob`, `queueOutboxRemoveJob`.
  - In `apps/backend/src/modules/campaigns/serialize.ts`:
    - Remove `recipients_mode` from the serialized shape (both single + list serializers).
  - Run tests: `pnpm -F backend test -- --testPathPattern=campaigns.service` → all 8 tests must now PASS (GREEN phase).

  **Must NOT do**:
  - Do NOT call `emailSendingQueue.add()` inside the Knex transaction — must be AFTER commit.
  - Do NOT keep any reference to `"all"` or `recipients_mode` in any branch.
  - Do NOT add in-memory retry/backoff for the `queue.add()` call — rely on stalled-reclaimer.
  - Do NOT duplicate dispatch-seed-id logic — use existing `getDispatchSeedJobId` from `queues.ts`.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Critical transactional logic, race conditions, tx boundary correctness.
    - Reason: Needs rigorous reasoning about commit ordering and idempotency.
  - **Skills**: none needed
  - **Skills Evaluated but Omitted**:
    - `hono`: N/A — this is Express, not Hono.

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T5, T6, T7)
  - **Parallel Group**: Wave 2
  - **Blocks**: T8, T11
  - **Blocked By**: T1, T2, T3

  **References**:

  **Pattern References**:
  - `apps/backend/src/modules/campaigns/service.ts` — current impl; keep function signatures stable where possible, replace bodies.
  - `apps/backend/src/modules/auth/service.ts` — reference for `db.transaction(trx => ...)` + `HttpError` pattern.
  - `apps/backend/src/lib/errors.ts` (or wherever `HttpError` lives) — use existing error class, do not invent new.

  **API/Type References**:
  - `packages/dto/src/campaign.ts` post-T2 — `CreateCampaignRequest`, `CampaignResponse` shapes.
  - `apps/backend/src/queues/queues.ts` — `getDispatchSeedJobId`, `emailSendingQueue`.

  **Test References**:
  - `apps/backend/tests/campaigns.service.test.ts` (from T3) — these tests define acceptance.

  **WHY Each Reference Matters**:
  - `auth/service.ts` is the canonical transaction style in this backend — matching it keeps review simple.
  - `errors.ts` defines the HTTP error mapper — bypassing it breaks global error middleware.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: GREEN phase — all T3 tests pass
    Tool: Bash
    Preconditions: T3 tests exist and fail; T4 implementation done.
    Steps:
      1. Run: pnpm -F backend test -- --testPathPattern=campaigns.service 2>&1 | tee .sisyphus/evidence/task-4-green.txt
      2. Assert: exit 0, "8 passed" (or all 8 individual PASS).
    Expected Result: All 8 tests GREEN.
    Evidence: .sisyphus/evidence/task-4-green.txt

  Scenario: End-to-end — POST /campaigns with 5 valid + 3 unknown emails
    Tool: Bash (curl against running stack)
    Preconditions: docker compose up -d; migrate:latest; seed 10k recipients; obtain JWT via POST /api/auth/login.
    Steps:
      1. Pick 5 known emails from recipients table: docker compose exec -T db psql -U postgres -d minimartek -c "SELECT email FROM recipients LIMIT 5" -t
      2. POST /api/campaigns with 5 known + 3 made-up emails.
      3. Assert: HTTP 201, response.status == 'draft', response has NO recipients_mode field.
      4. Query: SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id=<id>
      5. Assert: count == 5 (unknown emails silently skipped).
    Expected Result: 201 + exactly 5 rows inserted.
    Evidence: .sisyphus/evidence/task-4-mixed-emails.txt

  Scenario: POST /campaigns with all-unknown emails → 400 NO_MATCHING_RECIPIENTS
    Tool: Bash
    Steps:
      1. POST /api/campaigns with 3 random unknown emails.
      2. Assert: HTTP 400, response.error.code == 'NO_MATCHING_RECIPIENTS'.
    Evidence: .sisyphus/evidence/task-4-no-match.txt

  Scenario: POST /campaigns/:id/send transitions and enqueues immediately
    Tool: Bash + Redis inspect
    Steps:
      1. Create a draft campaign (as above).
      2. POST /api/campaigns/<id>/send
      3. Assert: HTTP 200, response.status == 'sending'.
      4. Inspect Redis: docker compose exec -T redis redis-cli KEYS 'bull:email-sending:*' | grep <seedId>
      5. Assert: seed job id present.
    Expected Result: Dispatch job enqueued directly, no outbox row written.
    Evidence: .sisyphus/evidence/task-4-send-enqueue.txt
  ```

  **Evidence to Capture:**
  - [ ] 4 evidence files above.

  **Commit**: YES
  - Message: `refactor(backend): sync campaign_recipients insert, remove preparation enqueue`
  - Files: `apps/backend/src/modules/campaigns/service.ts`, `apps/backend/src/modules/campaigns/serialize.ts`
  - Pre-commit: `pnpm -F backend test`

- [x] 5. **Queue layer simplification: delete `outbox.ts`, delete `workers/preparation.ts`, trim `queues.ts`, unregister preparation worker in `index.ts`**

  **What to do**:
  - Delete `apps/backend/src/queues/outbox.ts` entirely.
  - Delete `apps/backend/src/queues/workers/preparation.ts` entirely.
  - In `apps/backend/src/queues/queues.ts`:
    - Remove `PreparationJobData` type/export.
    - Remove `preparationQueue` export.
    - Remove `enqueuePreparationJob`, `removePreparationSeedJob`, `getPreparationSeedJobId` (and any `createImmediatePreparationJobId`) — full deletion.
    - Keep `emailSendingQueue`, `EmailSendingJobData`, `getDispatchSeedJobId`. If `createImmediateDispatchJobId` was defined in `outbox.ts`, move it here (single named export).
  - In `apps/backend/src/queues/index.ts`:
    - Remove the `preparation` worker import + registration.
    - Remove any `startQueueOutboxProcessor` call.
    - Keep `email-sending` worker + `stalled-reclaimer` worker registrations.
  - In any other file that still imports removed symbols: remove those imports (should only be `service.ts` and `workers/email-sending.ts`, both covered in T4/T6).
  - Verify: `pnpm -F backend check-types` passes.

  **Must NOT do**:
  - Do NOT keep `outbox.ts` as a thin re-export stub.
  - Do NOT rename `emailSendingQueue` or `getDispatchSeedJobId`.
  - Do NOT change fairness-related code (`FOR UPDATE SKIP LOCKED`, `ORDER BY next_attempt_at NULLS FIRST, recipient_id`).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Multi-file deletion + import surgery.
    - Reason: Requires careful enumeration of all symbol usages across the queue layer.
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T4, T6, T7) — but T6 reads from trimmed `queues.ts`, so T5 should land first within Wave 2 or be coordinated.
  - **Parallel Group**: Wave 2
  - **Blocks**: T6, T8, T11
  - **Blocked By**: T1

  **References**:

  **Pattern References**:
  - `apps/backend/src/queues/outbox.ts` — file to DELETE; read it first to confirm `createImmediateDispatchJobId` is its only surviving symbol.
  - `apps/backend/src/queues/queues.ts` — identify each to-delete export; keep the rest unchanged.
  - `apps/backend/src/queues/index.ts` — worker registration; remove preparation lines.
  - `apps/backend/src/queues/workers/preparation.ts` — full file deletion.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Files deleted and types compile
    Tool: Bash
    Steps:
      1. Run: test ! -f apps/backend/src/queues/outbox.ts && echo "outbox.ts: DELETED"
      2. Run: test ! -f apps/backend/src/queues/workers/preparation.ts && echo "preparation.ts: DELETED"
      3. Run: pnpm -F backend check-types 2>&1 | tee .sisyphus/evidence/task-5-tsc.txt
      4. Assert: exit 0.
    Expected Result: Both files gone; tsc clean.
    Evidence: .sisyphus/evidence/task-5-tsc.txt

  Scenario: Ghost symbols fully purged
    Tool: Bash (grep)
    Steps:
      1. Run: rg -n 'preparationQueue|createImmediatePreparationJobId|getPreparationSeedJobId|queueOutboxAddJob|queueOutboxRemoveJob|flushQueueOutbox|startQueueOutboxProcessor|PreparationJobData' apps/backend/src/
      2. Assert: exit 1 (no matches).
    Expected Result: Zero hits.
    Evidence: .sisyphus/evidence/task-5-grep-clean.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-5-tsc.txt`
  - [ ] `.sisyphus/evidence/task-5-grep-clean.txt`

  **Commit**: YES
  - Message: `refactor(queues): delete preparation queue and queue_outbox, keep createImmediateDispatchJobId`
  - Files: `apps/backend/src/queues/outbox.ts (deleted)`, `apps/backend/src/queues/workers/preparation.ts (deleted)`, `apps/backend/src/queues/queues.ts`, `apps/backend/src/queues/index.ts`
  - Pre-commit: `pnpm -F backend check-types`

- [x] 6. **`email-sending` worker: inline direct BullMQ `.add()`/`.remove()` calls, reduce `EMAIL_SEND_BATCH_SIZE` 50 → 5**

  **What to do**:
  - In `apps/backend/src/queues/constants.ts`:
    - Change `export const EMAIL_SEND_BATCH_SIZE = 50` → `= 5`.
  - In `apps/backend/src/queues/workers/email-sending.ts`:
    - Remove imports from `../outbox.js`.
    - Replace every `queueOutboxAddJob(...)` call with the equivalent direct `emailSendingQueue.add(jobId, data, opts)`.
    - Replace every `queueOutboxRemoveJob(...)` call with `emailSendingQueue.remove(jobId)`.
    - Remove any `flushQueueOutboxSafely(...)` wrapper calls — the ops are now direct and synchronous within the worker's own run.
    - Keep batch claim SQL and FIFO ordering UNCHANGED — only constant value changes and outbox plumbing removed.
    - Keep `finalizeCampaignDispatch` logic intact except for the outbox→direct substitution.
  - Verify: `pnpm -F backend test` green.

  **Must NOT do**:
  - Do NOT touch the batch-claim SQL (`FOR UPDATE SKIP LOCKED`, `ORDER BY`).
  - Do NOT change worker concurrency (stays at 10).
  - Do NOT introduce retry logic around `.add()` / `.remove()`.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Mechanical replacement but must preserve semantics.
    - Reason: Each outbox call maps 1:1 to a BullMQ call; needs careful review of opts/data payloads.
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: PARTIAL — needs T5 done first (to have clean `queues.ts` surface).
  - **Parallel Group**: Wave 2 (after T5)
  - **Blocks**: T8, T11
  - **Blocked By**: T5

  **References**:

  **Pattern References**:
  - `apps/backend/src/queues/workers/email-sending.ts` — current impl; all 4 outbox call sites in `finalizeCampaignDispatch`.
  - `apps/backend/src/queues/outbox.ts` (pre-deletion, via git history or T5 review) — shows what each outbox wrapper did, so direct calls preserve opts shape.
  - `apps/backend/src/queues/constants.ts` — single-line constant change.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Constant is 5
    Tool: Bash
    Steps:
      1. Run: grep 'EMAIL_SEND_BATCH_SIZE' apps/backend/src/queues/constants.ts
      2. Assert: value is 5.
    Evidence: .sisyphus/evidence/task-6-batch-size.txt

  Scenario: No outbox imports in worker
    Tool: Bash
    Steps:
      1. Run: grep -n 'outbox' apps/backend/src/queues/workers/email-sending.ts
      2. Assert: exit 1 (no matches).
    Evidence: .sisyphus/evidence/task-6-no-outbox.txt

  Scenario: End-to-end dispatch still works (fairness + batch 5)
    Tool: interactive_bash (tmux) + psql
    Preconditions: docker stack up; migrations latest; 3 draft campaigns each with 20 recipients created via API.
    Steps:
      1. Send all 3 campaigns back-to-back via POST /send.
      2. Watch: docker compose logs backend -f | grep 'email-sending' (for 30s).
      3. Assert: log shows interleaved batches of 5 recipients each, across all 3 campaigns (not one campaign draining fully before another).
      4. After 30s: SELECT campaign_id, COUNT(*) FILTER (WHERE status='sent') FROM campaign_recipients GROUP BY campaign_id
      5. Assert: each campaign has made progress (non-zero sent count, not concentrated in one).
    Expected Result: Fairness preserved; batches of 5 observed in logs.
    Evidence: .sisyphus/evidence/task-6-fairness-e2e.txt
  ```

  **Evidence to Capture:**
  - [ ] 3 evidence files above.

  **Commit**: YES
  - Message: `refactor(workers): email-sending uses direct BullMQ enqueue, batch size 5`
  - Files: `apps/backend/src/queues/workers/email-sending.ts`, `apps/backend/src/queues/constants.ts`
  - Pre-commit: `pnpm -F backend test`

- [x] 7. **Frontend DTO alignment: narrow `recipient_emails` state type to `string[]`, remove `recipients_mode` references**

  **What to do**:
  - In `apps/frontend/src/components/CampaignNew/types.ts` (or wherever the new-campaign form state type lives):
    - Change `recipient_emails: string | string[]` → `string[]`.
    - Remove any `recipients_mode` field from the state type.
  - In `apps/frontend/src/components/CampaignNew/CampaignNewForm.tsx`:
    - Import `CreateCampaignRequest` from `@repo/dto` — use inferred type.
    - Remove any state slot for `recipients_mode`.
    - Where the state transitions to the API payload: `recipient_emails: emails` (no mode branch).
  - In any hook that consumes campaign responses (e.g., SWR key derivation, Redux slice): remove destructuring of `recipients_mode`.
  - In the Redux slice(s) under `apps/frontend/src/features/`: remove any `recipients_mode` fields from state shapes or reducers.
  - Verify: `pnpm -F frontend check-types` passes.

  **Must NOT do**:
  - Do NOT modify any visual/UI layer in this task — T9 handles the toggle removal and badges.
  - Do NOT introduce manual interface declarations when `@repo/dto` types cover them.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — Frontend TS state types, careful with React typing.
    - Reason: Frontend domain expertise, type inference discipline.
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T4, T5, T6)
  - **Parallel Group**: Wave 2
  - **Blocks**: T9, T11
  - **Blocked By**: T2

  **References**:

  **Pattern References**:
  - `apps/frontend/AGENTS.md` — frontend conventions.
  - `apps/frontend/src/components/CampaignNew/CampaignNewForm.tsx` — existing form.
  - `apps/frontend/src/components/CampaignNew/types.ts` — state type.

  **API/Type References**:
  - `@repo/dto` — `CreateCampaignRequest`, `CampaignResponse` inferred types.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Frontend type-checks clean
    Tool: Bash
    Steps:
      1. Run: pnpm -F frontend check-types 2>&1 | tee .sisyphus/evidence/task-7-tsc.txt
      2. Assert: exit 0.
    Evidence: .sisyphus/evidence/task-7-tsc.txt

  Scenario: No lingering recipients_mode references
    Tool: Bash
    Steps:
      1. Run: rg -n 'recipients_mode|recipientsMode|RecipientsMode' apps/frontend/src/
      2. Assert: exit 1 (no matches).
    Evidence: .sisyphus/evidence/task-7-grep-clean.txt
  ```

  **Evidence to Capture:**
  - [ ] 2 evidence files above.

  **Commit**: YES
  - Message: `refactor(frontend): align DTO types, narrow recipients state to string[]`
  - Files: `apps/frontend/src/components/CampaignNew/types.ts`, `CampaignNewForm.tsx`, related hook/slice files
  - Pre-commit: `pnpm -F frontend check-types`

- [x] 8. **Extend stalled-reclaimer to rescue orphaned `sending` campaigns with no active dispatch job**

  **What to do**:
  - In `apps/backend/src/queues/workers/stalled-reclaimer.ts`:
    - Keep the existing `processing → pending` sweep.
    - Replace the existing outbox-insert step (`queueOutboxAddJob(...)`) with a DIRECT `emailSendingQueue.add(getDispatchSeedJobId(id), { campaignId: id }, { jobId: getDispatchSeedJobId(id) })` — NO outbox.
    - Add a new reconciliation pass, run every `EMAIL_SEND_RECLAIM_INTERVAL_MS`:
      1. Query: all campaigns where `status='sending'` AND NOT EXISTS `campaign_recipients WHERE status='processing' AND campaign_id = campaigns.id` AND EXISTS `campaign_recipients WHERE status='pending' AND campaign_id = campaigns.id`.
      2. For each result: `const seed = getDispatchSeedJobId(id); const existing = await emailSendingQueue.getJob(seed); if (!existing || ['completed','failed'].includes(await existing.getState())) { await emailSendingQueue.add(seed, { campaignId: id }, { jobId: seed }); }`.
    - Log structured: `{ event: 'reclaim.orphan-sending', campaignId, reason: 'no-active-dispatch-job' }`.
  - Remove ALL imports from `../outbox.js`; remove `queueOutboxAddJob` usage.
  - Import `getDispatchSeedJobId` from `../queues.js` (relocated there in T5).

  **Must NOT do**:
  - Do NOT restart campaigns with `status='sent'` — idempotence must hold.
  - Do NOT double-enqueue when a healthy job already exists (active/waiting/delayed states).
  - Do NOT bring back any `queue_outbox` reference.
  - Do NOT change the stalled-row-reclamation SQL (processing → pending logic stays the same).

  **Recommended Agent Profile**:
  - **Category**: `deep` — race-condition-aware reconciliation logic.
    - Reason: Checking BullMQ job state + DB state together is subtle; must not create duplicate in-flight jobs.
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T9, T10, T11)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: T4 (service uses direct `.add()`), T5 (outbox deleted), T6 (direct queue access pattern)

  **References**:

  **Pattern References**:
  - `apps/backend/src/queues/workers/stalled-reclaimer.ts` — current impl; keep shape, replace outbox calls with direct `.add()`.
  - `apps/backend/src/queues/workers/email-sending.ts:finalizeCampaignDispatch` (post-T6) — reference for direct `.add()` usage.

  **API/Type References**:
  - `apps/backend/src/queues/queues.ts` — `emailSendingQueue`, `getDispatchSeedJobId` (post-T5 relocation).

  **External References**:
  - BullMQ Job state: https://docs.bullmq.io/guide/jobs/job-data#job-state — `getState()` returns `'completed' | 'failed' | 'delayed' | 'active' | 'waiting' | 'waiting-children' | 'unknown'`.

  **WHY Each Reference Matters**:
  - BullMQ `getJob` returns null when the job was trimmed after success — this is the precise signal that we need to re-enqueue after a crash.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Orphan sending campaign is rescued
    Tool: Bash
    Preconditions: backend running (`docker compose up`); insert a campaign with `status='sending'` manually; insert 2 campaign_recipients with `status='pending'`; DO NOT enqueue any BullMQ job.
    Steps:
      1. Wait up to 90s (default reclaim interval + buffer).
      2. Query BullMQ: `docker exec -it minimartek-backend-1 node -e "import('./dist/src/queues/queues.js').then(m => m.emailSendingQueue.getJob('dispatch:<id>').then(j => console.log(j?.id)))"`.
      3. Assert a job with id `dispatch:<id>` now exists.
      4. Assert the 2 pending recipients eventually flip to `sent`.
    Expected Result: Campaign completes successfully despite initial orphan state.
    Evidence: .sisyphus/evidence/task-8-orphan-rescue.txt

  Scenario: Healthy sending campaign is NOT double-enqueued
    Tool: Bash
    Preconditions: campaign with `status='sending'`, active dispatch job in BullMQ.
    Steps:
      1. Note job id count before reclaim tick: `emailSendingQueue.getJobCounts()` → record.
      2. Wait one reclaim interval.
      3. Re-query counts.
    Expected Result: Job count is unchanged (+/- natural workload); no duplicate `dispatch:<id>` jobs created.
    Evidence: .sisyphus/evidence/task-8-no-duplicate.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-8-orphan-rescue.txt`
  - [ ] `.sisyphus/evidence/task-8-no-duplicate.txt`

  **Commit**: YES
  - Message: `feat(queues): stalled-reclaimer rescues orphaned sending campaigns without outbox`
  - Files: `apps/backend/src/queues/workers/stalled-reclaimer.ts`
  - Pre-commit: `pnpm -F backend check-types && pnpm -F backend test`

- [x] 9. **Frontend UI: remove "All Recipients" button, remove mode badge from list/detail, audit `status==='creating'` branches**

  **What to do**:
  - In `apps/frontend/src/components/CampaignNew/CampaignNewRecipientsField.tsx`:
    - Delete the "All Recipients" toggle button and the `mode === 'all'` rendering branch.
    - The component renders ONLY the specific-emails chip input.
  - In `apps/frontend/src/components/CampaignDetail/CampaignHeader.tsx`:
    - Remove the `recipients_mode` badge/label rendering.
  - In `apps/frontend/src/components/CampaignList/CampaignListTable.tsx`:
    - Remove any column/cell that displays `recipients_mode` (e.g., "All" pill).
  - In `apps/frontend/src/pages/CampaignNew.tsx`, `CampaignEdit.tsx`, `CampaignDetail.tsx`:
    - Remove all `status === 'creating'` branches; treat `creating` as impossible (DTO no longer emits it).
    - Remove passing `recipients_mode` in any form submission payload.
  - Grep-verify: `rg -n "recipients_mode|'all'|creating" apps/frontend/src` should return zero relevant hits (aside from intentional comments, if any).
  - Run: `pnpm -F frontend check-types && pnpm -F frontend lint && pnpm -F frontend build`.

  **Must NOT do**:
  - Do NOT remove the existing "Random recipients (Existing)" or "Generate recipients (New)" buttons — those remain.
  - Do NOT alter the chip input behavior — only remove the "All" mode entrypoint.
  - Do NOT leave dead CSS/classnames related to the removed mode toggle.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — Frontend UI cleanup with visual regression risk.
    - Reason: Touching multiple display components and forms; needs UI judgment for layout reflow.
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T8, T10, T11)
  - **Parallel Group**: Wave 3
  - **Blocks**: F3 (QA)
  - **Blocked By**: T7 (FE DTO types already narrowed)

  **References**:

  **Pattern References**:
  - `apps/frontend/src/components/CampaignNew/CampaignNewRecipientsField.tsx` — current component with the toggle to remove.
  - `apps/frontend/src/components/CampaignDetail/CampaignHeader.tsx` — mode badge location.
  - `apps/frontend/src/components/CampaignList/CampaignListTable.tsx` — mode cell location.

  **API/Type References**:
  - `packages/dto/src/campaign.ts` post-T2 — `CampaignResponse` no longer has `recipients_mode`.

  **WHY Each Reference Matters**:
  - The DTO change (T2) narrows types — TypeScript will flag every dead reference automatically.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Campaign creation UI shows only specific-emails input
    Tool: Playwright (playwright skill)
    Preconditions: `docker compose up --build`; logged in at http://localhost:8080.
    Steps:
      1. Navigate to /campaigns/new.
      2. Snapshot DOM.
      3. Assert: no button with text "All Recipients" exists; specific-emails chip input is visible.
      4. Enter 3 emails separated by space (one valid from seed, two new). Click Save.
      5. Assert: 201 response; campaign appears in list with `status='draft'`.
    Expected Result: Campaign created; no "All" toggle anywhere in the form.
    Evidence: .sisyphus/evidence/task-9-new-form.png, .sisyphus/evidence/task-9-new-form.txt

  Scenario: Campaign list and detail do NOT show mode badge
    Tool: Playwright
    Preconditions: at least one campaign exists.
    Steps:
      1. Navigate to /campaigns (list).
      2. Assert: no cell/pill contains "All" or "Specific" mode text.
      3. Click into a campaign.
      4. Assert: campaign detail header shows title, status, schedule — but no "Recipients: All" or "Recipients: Specific" badge.
    Expected Result: Mode is completely absent from list and detail views.
    Evidence: .sisyphus/evidence/task-9-list.png, .sisyphus/evidence/task-9-detail.png

  Scenario: Frontend builds and typechecks clean
    Tool: Bash
    Preconditions: none.
    Steps:
      1. Run: pnpm -F frontend check-types 2>&1 | tee .sisyphus/evidence/task-9-typecheck.txt
      2. Run: pnpm -F frontend build 2>&1 | tee .sisyphus/evidence/task-9-build.txt
    Expected Result: Both exit 0.
    Evidence: .sisyphus/evidence/task-9-typecheck.txt, .sisyphus/evidence/task-9-build.txt
  ```

  **Evidence to Capture:**
  - [ ] 3 screenshots + 2 command logs as above.

  **Commit**: YES
  - Message: `refactor(frontend): remove all-recipients UI + mode badges + creating-status branches`
  - Files: `apps/frontend/src/components/CampaignNew/CampaignNewRecipientsField.tsx`, `CampaignDetail/CampaignHeader.tsx`, `CampaignList/CampaignListTable.tsx`, `pages/CampaignNew.tsx`, `CampaignEdit.tsx`, `CampaignDetail.tsx`
  - Pre-commit: `pnpm -F frontend check-types && pnpm -F frontend build`

- [x] 10. **README rewrite: update Deviations 2/4/5/6 + workflow diagram**

  **What to do**:
  - In `README.md`, "Design Rationale — Deviations from the Spec" section:
    - **Deviation 2** (`creating`, `sending` status): delete the `creating` paragraphs; keep `sending` explanation. Update header to "Extra `Campaign.status` value: `sending`". Update enum to `draft | scheduled | sending | sent`.
    - **Deviation 4** (`recipients_mode`): replace entirely with a "Removed — was previously deferred-`all` mode" note or strike the section. Recommendation: DELETE the section and re-number remaining deviations (or explicitly mark it "Removed on 2026-04-24 — see commit history").
    - **Deviation 5** (`queue_outbox`): replace entirely with "Removed — Redis AOF + extended stalled-reclaimer now covers crash-recovery". Explain: (a) BullMQ Queue uses Redis AOF for durability, (b) the stalled-reclaimer now also rescues `sending` campaigns with no active dispatch job, so a crash between PG commit and Redis add is recovered within one reclaim interval. Accepted trade-off: up to `EMAIL_SEND_RECLAIM_INTERVAL_MS` (60s) of dispatch latency after a crash; far simpler than outbox.
    - **Deviation 6** (stalled-reclaimer): update "How" paragraph — replace the `queue_outbox` insert step with "directly calls `emailSendingQueue.add()` for each affected campaign". Add a sentence about the new orphan-`sending`-campaign rescue pass.
  - Update the workflow diagram block near the end:
    ```
    specific recipients (the only mode):
      POST /campaigns (sync materialize campaign_recipients)  →  draft
      POST /campaigns/:id/send   →  sending  →(email-sending worker)→  sent
      POST /campaigns/:id/schedule →  scheduled  →(email-sending worker @ T)→  sending  →  sent
    ```
  - Update the "Summary — what you can infer about the design" table: remove `recipients_mode` and `queue_outbox` mentions; update Scale behavior row to drop "preparation worker" — keep "email-sending worker + batched claims + stalled-recipient reclaimer".
  - Keep the interviewer-facing note at the top ("use `docker compose up --build`").

  **Must NOT do**:
  - Do NOT delete Deviation 1 (BullMQ justification) — it's still valid.
  - Do NOT delete Deviation 3 (`processing` status on recipients) — still valid.
  - Do NOT introduce new deviations not yet implemented.
  - Do NOT rewrite the "How I Used Claude Code" section.

  **Recommended Agent Profile**:
  - **Category**: `writing` — Technical prose accuracy.
    - Reason: Precise documentation update; must preserve auditor-facing tone and structure.
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T8, T9, T11)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1 (plan compliance audit references README alignment)
  - **Blocked By**: T4, T5 (outbox+prep actually gone)

  **References**:

  **Pattern References**:
  - `README.md` current — match its tone, bullet style, bold/italic usage.

  **WHY Each Reference Matters**:
  - README is the interviewer's first read; consistency of tone is the quality signal.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: README no longer mentions removed concepts
    Tool: Bash
    Preconditions: T10 edits complete.
    Steps:
      1. Run: rg -n "recipients_mode|queue_outbox|preparation worker|creating.*status" README.md | tee .sisyphus/evidence/task-10-readme-grep.txt
      2. Assert: zero hits (or only hits inside clearly-marked "Removed" notes or commit-history references).
    Expected Result: README is consistent with the new simplified implementation.
    Evidence: .sisyphus/evidence/task-10-readme-grep.txt

  Scenario: Workflow diagram is consistent with new state machine
    Tool: Bash
    Preconditions: T10 edits complete.
    Steps:
      1. Extract the workflow block with: awk '/Workflow reference/,/A campaign in/' README.md | tee .sisyphus/evidence/task-10-workflow.txt
      2. Assert: no `→ creating` arrows; no "all recipients" branch.
    Expected Result: Diagram shows only the specific-recipients flow.
    Evidence: .sisyphus/evidence/task-10-workflow.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-10-readme-grep.txt`
  - [ ] `.sisyphus/evidence/task-10-workflow.txt`

  **Commit**: YES
  - Message: `docs(readme): update deviations 2/4/5/6 + workflow diagram for simplified campaign flow`
  - Files: `README.md`
  - Pre-commit: (no automated check; diff review by F1)

- [x] 11. **Cross-cutting sanity: grep-clean repo, regenerate OpenAPI, monorepo build green**

  **What to do**:
  - Dead-reference scan (must return ZERO hits, fail the task if any remain):
    ```
    rg -n "recipients_mode|queue_outbox|queueOutboxAddJob|queueOutboxRemoveJob|flushQueueOutbox|startQueueOutboxProcessor|preparationQueue|enqueuePreparationJob|createImmediatePreparationJobId|getPreparationSeedJobId|workers/preparation|PreparationJobData|recipients_mode|recipients:\s*['\"]all['\"]" apps packages README.md
    ```
  - Regenerate OpenAPI:
    - Start backend: `pnpm -F backend dev` in background; wait for `Listening on 3001`.
    - Fetch: `curl -sS http://localhost:3001/api/openapi.json | jq . > apps/backend/openapi.json` (if that path is the committed location; otherwise just capture the live spec).
    - Verify: `jq '.components.schemas | keys | .[]' apps/backend/openapi.json` — should NOT contain `RecipientsMode` or any `...All...` variants.
    - Verify: `jq '.paths["/api/campaigns"].post.requestBody.content["application/json"].schema' apps/backend/openapi.json` — `recipient_emails` is `array<string>` with `maxItems: 1000`.
    - Shut down backend.
  - Monorepo green:
    - `pnpm install` (in case package.json changed).
    - `pnpm check-types` (all packages).
    - `pnpm lint`.
    - `pnpm test` (runs backend Jest).
    - `pnpm build`.
  - DB rollback/migrate sanity:
    - `pnpm -F backend migrate:rollback`.
    - `pnpm -F backend migrate:latest`.
    - Psql: `\d campaigns` — verify no `recipients_mode` column; `\dT campaign_status` — 4 values; `\dt queue_outbox` — relation does not exist.

  **Must NOT do**:
  - Do NOT regenerate the OpenAPI file from a stale server — always restart backend first.
  - Do NOT accept any grep hit as a "comment" without verifying it's intentional.
  - Do NOT skip the migration rollback/forward test — catches schema diff regressions.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Multi-tool verification sequence.
    - Reason: Requires coordinating grep + curl + jq + pnpm + psql with accurate pass/fail criteria.
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T8, T9, T10)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1, F2
  - **Blocked By**: T1–T10 (final sanity pass)

  **References**:

  **Pattern References**:
  - `apps/backend/src/app.ts` / wherever OpenAPI is generated — spec source of truth.
  - `Makefile` — existing `make migrate` target for DB ops.

  **WHY Each Reference Matters**:
  - OpenAPI is auto-generated at boot; stale spec in the repo would cause F1 (oracle) to flag a discrepancy.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dead-reference grep is empty
    Tool: Bash
    Preconditions: T1–T10 complete.
    Steps:
      1. Run the big rg command above; tee to .sisyphus/evidence/task-11-grep.txt
      2. Assert: file is empty (zero lines).
    Expected Result: No dead references.
    Evidence: .sisyphus/evidence/task-11-grep.txt

  Scenario: Monorepo build + test + typecheck green
    Tool: Bash
    Preconditions: none.
    Steps:
      1. Run: pnpm check-types 2>&1 | tee .sisyphus/evidence/task-11-typecheck.txt
      2. Run: pnpm lint 2>&1 | tee .sisyphus/evidence/task-11-lint.txt
      3. Run: pnpm test 2>&1 | tee .sisyphus/evidence/task-11-test.txt
      4. Run: pnpm build 2>&1 | tee .sisyphus/evidence/task-11-build.txt
    Expected Result: All four exit 0.
    Evidence: 4 log files.

  Scenario: Migration rollback + forward leaves clean schema
    Tool: Bash
    Preconditions: db running.
    Steps:
      1. Run: pnpm -F backend migrate:rollback && pnpm -F backend migrate:latest 2>&1 | tee .sisyphus/evidence/task-11-migrate.txt
      2. Run: docker exec -it minimartek-db-1 psql -U postgres -d minimartek -c "\d campaigns" | tee .sisyphus/evidence/task-11-schema-campaigns.txt
      3. Run: docker exec -it minimartek-db-1 psql -U postgres -d minimartek -c "\dT+ campaign_status" | tee .sisyphus/evidence/task-11-schema-enum.txt
      4. Run: docker exec -it minimartek-db-1 psql -U postgres -d minimartek -c "\dt queue_outbox" 2>&1 | tee .sisyphus/evidence/task-11-schema-outbox.txt
    Expected Result: campaigns has no recipients_mode column; campaign_status has 4 values (draft, scheduled, sending, sent); queue_outbox does not exist.
    Evidence: 4 log files.

  Scenario: OpenAPI spec reflects new contract
    Tool: Bash
    Preconditions: backend running locally.
    Steps:
      1. Run: curl -sS http://localhost:3001/api/openapi.json | tee .sisyphus/evidence/task-11-openapi.json | jq '.components.schemas | keys' | tee .sisyphus/evidence/task-11-openapi-schemas.txt
      2. Assert: no `RecipientsMode` key.
      3. Run: jq '.paths["/api/campaigns"].post' .sisyphus/evidence/task-11-openapi.json | tee .sisyphus/evidence/task-11-openapi-post.txt
      4. Assert: `recipient_emails` is array of strings, max 1000; no `"all"` oneOf branch.
    Expected Result: OpenAPI contract matches DTO post-T2.
    Evidence: 3 files.
  ```

  **Evidence to Capture:**
  - [ ] All logs listed above under `.sisyphus/evidence/task-11-*`.

  **Commit**: YES (may be empty/no-op if everything already clean)
  - Message: `chore: regenerate openapi + final sanity pass for send-all/prep-queue removal`
  - Files: `apps/backend/openapi.json` (if committed) — else no files, empty commit allowed.
  - Pre-commit: `pnpm check-types && pnpm lint && pnpm test && pnpm build`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle` — APPROVE (previous session: all 9/9 Must Have PASS, dead-symbol grep CLEAN)

  Read this plan end-to-end. For each "Must Have": verify the implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": `rg -n "creating|recipients_mode|preparationQueue|enqueuePreparationJob|createImmediatePreparationJobId|getPreparationSeedJobId|queue_outbox|queueOutboxAddJob|queueOutboxRemoveJob|flushQueueOutbox|startQueueOutboxProcessor|\"all\"" apps/backend/src/ packages/dto/src/` → any hit is REJECT with file:line. Verify evidence files in `.sisyphus/evidence/`.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high` — APPROVE (previous session: pnpm build/lint/test green, no AI slop, batch=5, no outbox, 31/31 tests)

  Run at repo root: `pnpm check-types`, `pnpm lint`, `pnpm build`, `pnpm test`. Review all changed files for: `as any`, `@ts-ignore`, empty catch blocks, `console.log` in prod paths, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (`data`, `result`, `item`, `temp`). Specifically confirm: `EMAIL_SEND_BATCH_SIZE=5`, no `createImmediatePreparationJobId` symbol anywhere, `outbox.ts` file is deleted.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill) — APPROVE (2026-04-24: all 11 scenarios A-K passed; no mode toggle, no mode badge, sync recipients, dispatch enqueue, stalled-reclaimer rescue, 1001-cap, NO_MATCHING_RECIPIENTS, 409 CAMPAIGN_BUSY all verified)

  Start from clean DB: `docker compose down -v && docker compose up --build -d && make migrate && make seed`. Execute EVERY QA scenario from EVERY TODO end-to-end. Playwright: log in, create campaign (specific emails), schedule campaign, send campaign, observe list + detail pages for absence of mode badge, attempt to paste 1,001 emails (assert rejection). tmux/psql: verify `campaign_recipients` rows exist immediately after `POST /campaigns`, verify dispatch job enqueued, verify stalled-reclaimer rescue path (manually wedge a campaign). Edge cases: empty recipient list, unknown-only emails, mixed known/unknown. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`

For each task: read "What to do", read actual diff (`git diff main -- <files>`). Verify 1:1 correspondence — everything in spec was built (no missing), nothing beyond spec was built (no scope creep, no unsolicited refactors). Check "Must NOT do" compliance per task. Detect cross-task contamination: T4 only touches service files, T6 only touches email-sending, etc. Flag any unaccounted changes.
Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

> Atomic commits per task boundary. Conventional Commits style matches repo history.

- **T1**: `refactor(db): drop creating status, recipients_mode, queue_outbox in init migration` — `apps/backend/migrations/20260421000000_init.ts` — pre: `pnpm -F backend migrate:rollback && migrate:latest`
- **T2**: `refactor(dto): drop RecipientsModeSchema and all-recipients mode, cap list at 1000` — `packages/dto/src/campaign.ts` — pre: `pnpm -F dto check-types`
- **T3**: `test(backend): failing tests for sync campaign_recipients materialization` — `apps/backend/tests/campaigns.service.test.ts` — pre: `pnpm -F backend test -- --testPathPattern=campaigns`
- **T4**: `refactor(backend): sync campaign_recipients insert, remove preparation enqueue` — `apps/backend/src/modules/campaigns/service.ts`, `apps/backend/src/modules/campaigns/serialize.ts` — pre: `pnpm -F backend test`
- **T5**: `refactor(queues): delete preparation queue and queue_outbox, keep createImmediateDispatchJobId` — `apps/backend/src/queues/{outbox.ts (deleted),queues.ts,index.ts,workers/preparation.ts (deleted)}` — pre: `pnpm -F backend check-types`
- **T6**: `refactor(workers): email-sending uses direct BullMQ enqueue, batch size 5` — `apps/backend/src/queues/workers/email-sending.ts`, `apps/backend/src/queues/constants.ts` — pre: `pnpm -F backend test`
- **T7**: `refactor(frontend): align DTO types, narrow recipients state to string[]` — `apps/frontend/src/components/CampaignNew/types.ts`, hooks/state imports of `CreateCampaignRequest` — pre: `pnpm -F frontend check-types`
- **T8**: `feat(reclaimer): rescue campaigns in sending with no active dispatch job` — `apps/backend/src/queues/workers/stalled-reclaimer.ts` — pre: `pnpm -F backend test`
- **T9**: `refactor(frontend): remove All Recipients toggle and mode badges` — `apps/frontend/src/components/CampaignNew/CampaignNewRecipientsField.tsx`, `CampaignNewForm.tsx`, `CampaignDetail/CampaignHeader.tsx`, `CampaignList/CampaignListTable.tsx`, detail/edit/new pages — pre: `pnpm -F frontend build`
- **T10**: `docs(readme): rewrite deviations 2/4/5/6 and workflow diagram for simplified flow` — `README.md` — pre: (none — docs)
- **T11**: `chore: cross-cutting sanity — grep, openapi, full monorepo build` — (touch-up files as needed) — pre: `pnpm build && pnpm lint && pnpm check-types && pnpm test`

---

## Success Criteria

### Verification Commands

```bash
# Schema clean
pnpm -F backend migrate:rollback && pnpm -F backend migrate:latest
docker compose exec -T db psql -U postgres -d minimartek -c "\dT+ campaign_status" | grep -v creating
docker compose exec -T db psql -U postgres -d minimartek -c "\d campaigns" | grep -vq recipients_mode
docker compose exec -T db psql -U postgres -d minimartek -c "\d queue_outbox" # expect: relation "queue_outbox" does not exist

# Zero ghost symbols
rg -n '"all"|recipients_mode|"creating"|preparationQueue|createImmediatePreparationJobId|getPreparationSeedJobId|queue_outbox|queueOutboxAddJob|queueOutboxRemoveJob|flushQueueOutbox' apps/backend/src packages/dto/src
# Expected: zero results

# Monorepo green
pnpm build && pnpm lint && pnpm check-types && pnpm test

# API contract
curl -s -X POST http://localhost:3001/api/campaigns \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"name":"t","subject":"s","body":"b","recipient_emails":["seed-1@example.com"]}' \
  | jq -e '.status == "draft" and (has("recipients_mode") | not)'
# Expected: exit 0

# 1001-cap rejection
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3001/api/campaigns \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d "$(node -e 'console.log(JSON.stringify({name:"t",subject:"s",body:"b",recipient_emails:Array.from({length:1001},(_,i)=>`e${i}@x.com`)}))')"
# Expected: 400
```

### Final Checklist

- [ ] All "Must Have" items verified (see F1)
- [ ] All "Must NOT Have" items grep-clean (see F1)
- [ ] Full test suite green (see F2)
- [ ] Real end-to-end QA green (see F3)
- [ ] Zero scope creep (see F4)
- [ ] User has said "okay" explicitly before this plan is marked complete
