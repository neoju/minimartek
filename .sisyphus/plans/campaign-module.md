# Campaign Module Implementation

## TL;DR

> **Quick Summary**: Implement a Campaign module with 8 new REST API endpoints in the Express/Knex backend, including CRUD operations with draft-only edit/delete restrictions, schedule/send simulation, and stats. TDD approach with Jest + supertest + mock-knex.
>
> **Deliverables**:
>
> - Modified init migration (campaign_status enum alignment)
> - Updated DTOs in `@repo/dto` for campaign schemas
> - Updated `src/types/db.ts` for campaign-related TypeScript interfaces
> - New `src/modules/campaigns/routes.ts` (router factory with all 8 endpoints)
> - New `src/modules/campaigns/service.ts` (CampaignService class)
> - New `tests/campaign.test.ts` (TDD: tests first, then implementation)
> - Updated `src/app.ts` (wire campaign routes)
> - `!validateQuery` middleware for param validation (reuse existing `IdParamSchema`)
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves | NO - sequential (TDD)
> **Critical Path**: Task 1 (migration) → Task 2 (DTOs/types) → Task 3-8 (TDD cycles) → Task 9 (route wiring) → F1-F4

---

## Context

### Original Request

Implement a Campaign module in `apps/backend/src/` with:

- **Schema**: Campaign (draft/scheduled/sent), Recipient, CampaignRecipient with specific indexes
- **8 API endpoints**: Campaign CRUD (auth required), schedule, send (simulate), stats
- **Business rules**: Draft-only edit/delete, future `scheduled_at`, sent is terminal, stats with rates

### Interview Summary

**Key Discussions**:

- Campaign status enum: Requirement says `draft | scheduled | sent`; migration has `draft | sending | scheduled | sent`; DTO has `DRAFT | SENDING | SENT | FAILED`. **Decision**: Follow requirement exactly — `draft | scheduled | sent`.
- Migration strategy: **Decision**: Modify init migration directly (dev environment, acceptable).
- Test strategy: **Decision**: TDD — write failing tests first, then implement.

**Research Findings**:

- Module pattern: `fooRouter(db: Knex): Router` + Service class with `db` DI (matches AuthService pattern)
- Validation: `validateBody(Schema)` / `validateQuery(Schema)` from `@/lib/validate.js`
- Auth: `requireAuth` middleware sets `req.user = { sub, email }` from JWT
- Errors: `HttpError(status, code, message)` thrown from services, caught by `errorHandler`
- DB: UUIDv7 PKs, `onUpdateTrigger` for `updated_at`, knex migrations with TypeScript
- `CreateCampaignRequestSchema` already exists with `recipients: z.string()` (comma-separated emails)
- Auth endpoints (`/auth/register`, `/auth/login`) already exist and are functional

### Metis Review

**Identified Gaps** (addressed):

- Gap: Missing `validateParams` middleware for `:id` route param validation → Added `IdParamSchema` usage task
- Gap: No explicit consideration for pagination in `GET /campaigns` → Added pagination (reuse `PaginationQuerySchema`)
- Gap: No consideration for what happens when `/send` is called on a non-draft campaign → Business rule: 409 Conflict
- Gap: Partial update semantics for PATCH unclear → Use Zod `.partial()` on update schema
- Gap: Race condition on `/send` if called twice concurrently → DB-level check within transaction

---

## Work Objectives

### Core Objective

Implement a fully functional Campaign module with 8 REST API endpoints, business rule enforcement, TDD tests, and proper DTO alignment, following existing codebase conventions exactly.

### Concrete Deliverables

- Modified `apps/backend/migrations/20260421000000_init.ts` (campaign_status enum: `draft | scheduled | sent`)
- Updated `packages/dto/src/campaign.ts` (all campaign-related schemas)
- Updated `packages/dto/src/index.ts` (re-exports, if needed)
- Updated `apps/backend/src/types/db.ts` (CampaignStatus type alignment)
- New `apps/backend/src/modules/campaigns/routes.ts`
- New `apps/backend/src/modules/campaigns/service.ts`
- New `apps/backend/tests/campaign.test.ts`
- Updated `apps/backend/src/app.ts` (wire campaign routes)

### Definition of Done

- [ ] All 8 campaign endpoints return correct status codes and response shapes
- [ ] Business rules enforced: draft-only edit/delete, future schedule_at, sent is terminal
- [ ] `pnpm -F backend test` passes with all new + existing tests
- [ ] `pnpm -F backend check-types` passes (no TS errors)
- [ ] `pnpm -F backend lint` passes (no lint errors)
- [ ] stats endpoint returns correct open_rate and send_rate calculations

### Must Have

- All 8 endpoints working with auth middleware
- Zod validation on all request bodies and query/param inputs
- HttpError responses with proper status codes and error codes
- Draft-only enforcement for PATCH and DELETE
- Future timestamp validation for `scheduled_at`
- Terminal state protection for sent campaigns
- Stats endpoint with rate calculations (avoiding division by zero)
- TDD: failing test → implementation → passing test cycle

### Must NOT Have (Guardrails)

- No frontend changes
- No real email sending implementation — `/send` is a simulation
- No new npm dependencies
- No separate CRUD endpoints for Recipients (find-or-create during campaign creation)
- No `sending` status in the final implementation
- No `FAILED` status for Campaign (only for CampaignRecipient)
- No background job scheduler for scheduled campaigns
- No AI slop: no excessive comments, no over-abstraction, no generic variable names
- No modifying `authRouter` or `AuthService` (they already work)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Jest ESM + supertest + mock-knex)
- **Automated tests**: YES (TDD)
- **Framework**: Jest (ts-jest/presets/default-esm)
- **TDD**: Each task follows RED (failing test) → GREEN (minimal impl) → REFACTOR

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API/Backend**: Use Bash (curl) — Send requests, assert status + response fields
- **Build/Type**: Use Bash — Run `pnpm -F backend check-types`, `pnpm -F backend lint`, `pnpm -F backend test`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — sequential for TDD correctness):
├── Task 1: Fix migration enum + update DB types [quick]
├── Task 2: Rewrite campaign DTOs in @repo/dto [quick]

Wave 2 (TDD Cycles — core service + routes):
├── Task 3: TDD — GET /campaigns (list with pagination) [deep]
├── Task 4: TDD — POST /campaigns (create with recipient find-or-create) [deep]
├── Task 5: TDD — GET /campaigns/:id (details + recipient stats) [deep]
├── Task 6: TDD — PATCH /campaigns/:id (draft-only update) [deep]

Wave 3 (TDD Cycles — advanced operations):
├── Task 7: TDD — DELETE /campaigns/:id (draft-only delete) [quick]
├── Task 8: TDD — POST /campaigns/:id/schedule (future timestamp) [deep]
├── Task 9: TDD — POST /campaigns/:id/send (simulate, terminal state) [deep]
├── Task 10: TDD — GET /campaigns/:id/stats (rates and counts) [deep]

Wave 4 (Integration — route wiring, type check, lint):
├── Task 11: Wire campaign routes in app.ts [quick]
├── Task 12: Full integration test + type check + lint [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay
```

Critical Path: Task 1 → Task 2 → Task 3-10 (sequential TDD) → Task 11 → Task 12 → F1-F4 → user okay

### Dependency Matrix

| Task | Depends On | Blocks  | Wave |
| ---- | ---------- | ------- | ---- |
| 1    | —          | 2, 3-10 | 1    |
| 2    | 1          | 3-10    | 1    |
| 3    | 2          | 11      | 2    |
| 4    | 2          | 11      | 2    |
| 5    | 2          | 11      | 2    |
| 6    | 2          | 11      | 2    |
| 7    | 2          | 11      | 3    |
| 8    | 2          | 11      | 3    |
| 9    | 2          | 11      | 3    |
| 10   | 2          | 11      | 3    |
| 11   | 3-10       | 12      | 4    |
| 12   | 11         | F1-F4   | 4    |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 → `quick`, T2 → `quick`
- **Wave 2**: 4 tasks — T3 → `deep`, T4 → `deep`, T5 → `deep`, T6 → `deep`
- **Wave 3**: 4 tasks — T7 → `quick`, T8 → `deep`, T9 → `deep`, T10 → `deep`
- **Wave 4**: 2 tasks — T11 → `quick`, T12 → `unspecified-high`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Fix migration enum + update DB types

  **What to do**:
  - Modify `apps/backend/migrations/20260421000000_init.ts`: change the campaign_status enum from `["draft", "sending", "scheduled", "sent"]` to `["draft", "scheduled", "sent"]`
  - Update `apps/backend/src/types/db.ts`: change `CampaignStatus` type to `"draft" | "scheduled" | "sent"` (remove `"sending"`)
  - Run `pnpm -F backend check-types` to verify no breakage

  **Must NOT do**:
  - Do not add a new migration file — modify the init migration directly
  - Do not change the `CampaignRecipientStatus` type — it stays as `"pending" | "sent" | "failed"`
  - Do not touch the `users` or `recipients` table definitions

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small targeted edits to 2 files, no complex logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (foundation for everything else)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 2-10
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `apps/backend/migrations/20260421000000_init.ts:41-46` — Current campaign_status enum definition to modify
  - `apps/backend/src/types/db.ts:1` — Current CampaignStatus type alias to update

  **API/Type References**:
  - `apps/backend/src/types/db.ts:1` — CampaignStatus type must match the DB enum values exactly

  **WHY Each Reference Matters**:
  - The migration defines the DB enum that must match the TypeScript type. If they disagree, inserts/updates will fail at runtime.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Migration enum matches TypeScript type
    Tool: Bash
    Preconditions: Code changes applied
    Steps:
      1. Run `grep -n "draft.*scheduled.*sent" apps/backend/migrations/20260421000000_init.ts`
      2. Assert output contains the enum with exactly "draft", "scheduled", "sent" (no "sending")
      3. Run `grep -n "CampaignStatus" apps/backend/src/types/db.ts`
      4. Assert the type is `"draft" | "scheduled" | "sent"`
    Expected Result: Both grep outputs show matching status values without "sending"
    Failure Indicators: "sending" still present in either file
    Evidence: .sisyphus/evidence/task-1-enum-alignment.txt

  Scenario: Type check still passes after changes
    Tool: Bash
    Preconditions: Task 1 changes applied
    Steps:
      1. Run `pnpm -F backend check-types`
      2. Assert exit code 0
    Expected Result: No TypeScript errors
    Failure Indicators: Type errors referencing campaign status
    Evidence: .sisyphus/evidence/task-1-typecheck.txt
  ```

  **Commit**: YES (groups with Task 2)
  - Message: `feat(campaign): align db schema and dtos with requirement spec`
  - Files: `apps/backend/migrations/20260421000000_init.ts`, `apps/backend/src/types/db.ts`
  - Pre-commit: `pnpm -F backend check-types`

- [ ] 2. Rewrite campaign DTOs in @repo/dto

  **What to do**:
  - Rewrite `packages/dto/src/campaign.ts` to align with the requirement:
    - `CampaignStatusSchema = z.enum(["draft", "scheduled", "sent"])` (lowercase, no "sending", no "FAILED")
    - `CampaignRecipientStatusSchema = z.enum(["pending", "sent", "failed"])` (for CampaignRecipient)
    - `CreateCampaignRequestSchema` — keep `name`, `subject`, `body` (min 1), add `recipientEmails: z.array(z.string().email())` (replace comma-separated string), `status` defaults to `"draft"`
    - `UpdateCampaignRequestSchema` — partial of create (name, subject, body optional), no status field (draft only, status changes via schedule/send)
    - `ScheduleCampaignRequestSchema = z.object({ scheduledAt: z.string().datetime() })` — future timestamp validated in service
    - `CampaignResponseSchema` — full campaign object with camelCase serialization
    - `CampaignListItemSchema` — id, name, subject, status, createdAt, recipientCount
    - `CampaignStatsResponseSchema = z.object({ total: z.number(), sent: z.number(), failed: z.number(), opened: z.number(), open_rate: z.number(), send_rate: z.number() })`
    - `IdParamSchema` — already in common.ts, verify it exists
  - Verify `packages/dto/src/index.ts` re-exports everything from campaign.ts
  - Run `pnpm -F @repo/dto check-types` to verify

  **Must NOT do**:
  - Do not use uppercase enum values — requirement specifies lowercase
  - Do not include `sending` or `FAILED` in CampaignStatusSchema
  - Do not duplicate types already in `common.ts` (reuse `IdParamSchema`)
  - Do not add a `status` field to `UpdateCampaignRequestSchema` — status transitions only via schedule/send

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file edit with well-defined schema definitions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 1 for type alignment)
  - **Parallel Group**: Wave 1 (sequential after Task 1)
  - **Blocks**: Tasks 3-10
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `packages/dto/src/auth.ts:1-32` — Pattern for request/response schemas (LoginRequestSchema, AuthTokenResponseSchema)
  - `packages/dto/src/common.ts:1-23` — Reusable patterns (PaginationQuerySchema, IdParamSchema if exists, paginatedSchema)
  - `packages/dto/src/campaign.ts:1-50` — Current schemas to replace entirely

  **API/Type References**:
  - `packages/dto/src/index.ts:4` — Must re-export all new exports from campaign.ts
  - `apps/backend/src/types/db.ts:1-3` — CampaignStatus and CampaignRecipientStatus types must match DTO enums

  **WHY Each Reference Matters**:
  - auth.ts shows the naming convention (FooRequestSchema, FooResponseSchema) that campaign DTOs must follow
  - common.ts has PaginationQuerySchema which GET /campaigns will need for pagination
  - The existing campaign.ts will be entirely rewritten, so all exports must be accounted for

  **Acceptance Criteria**:
  - [ ] `CampaignStatusSchema` has exactly `["draft", "scheduled", "sent"]`
  - [ ] `CreateCampaignRequestSchema` has `recipientEmails: z.array(z.string().email())`
  - [ ] `UpdateCampaignRequestSchema` does NOT have a `status` field
  - [ ] `ScheduleCampaignRequestSchema` exists with `scheduledAt: z.string().datetime()`
  - [ ] `CampaignStatsResponseSchema` has all 6 fields from the requirement
  - [ ] `pnpm -F @repo/dto check-types` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: DTO schemas are importable and parse correctly
    Tool: Bash
    Preconditions: Task 2 changes applied
    Steps:
      1. Run `pnpm -F @repo/dto check-types`
      2. Assert exit code 0
      3. Run `node -e "const { CampaignStatusSchema, CampaignStatsResponseSchema } = require('./packages/dto/src/campaign.ts'); console.log(CampaignStatusSchema.options, Object.keys(CampaignStatsResponseSchema.shape))"` — or verify with tsc
    Expected Result: No type errors, schemas define correct fields
    Failure Indicators: Missing exports, type mismatches, "sending" in enum options
    Evidence: .sisyphus/evidence/task-2-dto-check.txt

  Scenario: UpdateCampaignRequestSchema rejects status field (business rule)
    Tool: Bash
    Preconditions: Task 2 changes applied
    Steps:
      1. Write a quick TypeScript check: import UpdateCampaignRequestSchema, try to parse `{ status: "draft" }`
      2. Assert it strips or rejects the status field (Zod `.pick()` doesn't include status)
    Expected Result: Status field is not part of UpdateCampaignRequestSchema
    Failure Indicators: Status accepted in update schema
    Evidence: .sisyphus/evidence/task-2-update-schema.txt
  ```

  **Commit**: YES (groups with Task 1)
  - Message: `feat(campaign): align db schema and dtos with requirement spec`
  - Files: `packages/dto/src/campaign.ts`, `packages/dto/src/index.ts`
  - Pre-commit: `pnpm -F @repo/dto check-types`

- [ ] 3. TDD — GET /campaigns (list with pagination)

  **What to do**:
  - **RED**: Write failing test in `tests/campaign.test.ts` for `GET /api/campaigns`
    - Test: returns paginated list of campaigns for authenticated user
    - Test: returns empty list when user has no campaigns
    - Test: returns 401 without auth token
    - Test: pagination defaults (page=1, pageSize=20)
  - **GREEN**: Implement in `src/modules/campaigns/service.ts` and `src/modules/campaigns/routes.ts`
    - Service method: `listCampaigns(userId: string, query: PaginationQuery)` — queries campaigns where `created_by = userId`, counts total, returns paginated result
    - Route: `GET /` with `requireAuth` and `validateQuery(PaginationQuerySchema)`
    - Serialize DB rows to camelCase in response
  - **REFACTOR**: Clean up, remove duplication

  **Must NOT do**:
  - Do not create a separate route file — all campaign routes go in one `routes.ts`
  - Do not implement other endpoints in this task — only GET /campaigns
  - Do not modify `app.ts` yet — route wiring is Task 11

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: TDD cycle with service+route+test, requires careful mock-knex setup
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (foundation for later tasks)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `apps/backend/src/modules/auth/routes.ts:1-33` — Router factory pattern with `db: Knex` dependency
  - `apps/backend/src/modules/auth/service.ts:1-50` — Service class pattern with `this.db`, HttpError throwing
  - `apps/backend/src/modules/users/routes.ts:26-33` — Auth middleware usage (`requireAuth`), user type on `req.user.sub`
  - `apps/backend/tests/auth.test.ts:1-174` — Jest + supertest + mock-knex pattern, tracker setup, response assertions

  **API/Type References**:
  - `packages/dto/src/common.ts:10-14` — `PaginationQuerySchema` for pagination query params
  - `apps/backend/src/types/db.ts:21-31` — `Campaign` DB row type for database queries
  - `packages/dto/src/campaign.ts` — New DTOs (from Task 2) for `CampaignListItemSchema`

  **Test References**:
  - `apps/backend/tests/auth.test.ts:9-16` — setupMockDb pattern with tracker, store, and mock response injection
  - `apps/backend/tests/auth.test.ts:18-39` — Test structure: describe, beforeEach, afterEach, assertions on res.status/res.body

  **External References**:
  - mock-knex docs: Tracker `on("query")` for intercepting database queries

  **WHY Each Reference Matters**:
  - auth routes shows the exact pattern to follow for router factories and dependency injection
  - auth service shows the class pattern with HttpError throwing
  - auth test shows the complete mock-knex + supertest pattern including tracker setup and response simulation
  - PaginationQuerySchema is reused for the campaign list query

  **Acceptance Criteria**:
  - [ ] `tests/campaign.test.ts` created with failing→passing tests for GET /campaigns
  - [ ] `GET /api/campaigns` returns 200 with paginated list for authenticated user
  - [ ] Returns 401 without auth token
  - [ ] Returns empty list for user with no campaigns
  - [ ] `pnpm -F backend test` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: List campaigns with auth returns paginated results
    Tool: Bash
    Preconditions: Backend server running, authenticated user exists
    Steps:
      1. Register user: `curl -s -X POST http://localhost:3001/api/auth/register -H "Content-Type: application/json" -d '{"email":"list@test.com","password":"password123","name":"Test"}'`
      2. Extract accessToken from response
      3. Create campaign: `curl -s -X POST http://localhost:3001/api/campaigns -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"name":"Test Campaign","subject":"Hello","body":"World","recipientEmails":[]}'`
      4. List campaigns: `curl -s http://localhost:3001/api/campaigns -H "Authorization: Bearer <token>"`
      5. Assert response has `items` array with created campaign, `page=1`, `pageSize=20`, `total=1`
    Expected Result: 200 response with paginated campaign list containing the created campaign
    Failure Indicators: 401 response, empty items when campaign exists, missing pagination metadata
    Evidence: .sisyphus/evidence/task-3-list-campaigns.json

  Scenario: List campaigns without auth returns 401
    Tool: Bash
    Preconditions: Backend server running
    Steps:
      1. `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/campaigns`
      2. Assert status code is 401
    Expected Result: 401 Unauthorized
    Failure Indicators: 200 response without auth
    Evidence: .sisyphus/evidence/task-3-list-no-auth.txt
  ```

  **Commit**: NO (commit grouped with Tasks 3-6)

- [ ] 4. TDD — POST /campaigns (create with recipient find-or-create)

  **What to do**:
  - **RED**: Write failing tests for `POST /api/campaigns`
    - Test: creates campaign with status draft by default
    - Test: creates/finds recipients by email and links via campaign_recipients
    - Test: returns 201 with created campaign data
    - Test: returns 401 without auth
    - Test: validates required fields (name, subject, body, recipientEmails)
    - Test: validates recipient emails are valid
  - **GREEN**: Implement in service and routes
    - Service method: `createCampaign(userId: string, input: CreateCampaignRequest)` — create campaign row (status='draft', created_by=userId), for each email find-or-create recipient, insert campaign_recipients rows
    - Route: `POST /` with `requireAuth` and `validateBody(CreateCampaignRequestSchema)`
    - Use Knex transaction for the create operation (campaign + recipients + links)
  - **REFACTOR**: Extract common test utilities if needed

  **Must NOT do**:
  - Do not create separate Recipient CRUD endpoints
  - Do not allow setting status to anything other than "draft" on creation (default to draft)
  - Do not modify auth service or routes

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Transaction-based creation with find-or-create logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (builds on types from Task 2)
  - **Parallel Group**: Wave 2 (after Task 3)
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `apps/backend/src/modules/auth/service.ts:10-31` — Transaction pattern with `.insert().returning("*")`
  - `apps/backend/src/modules/auth/routes.ts:12-20` — Route with validateBody + async handler wrapping

  **API/Type References**:
  - `packages/dto/src/campaign.ts` — `CreateCampaignRequestSchema` (from Task 2) with `recipientEmails: z.array(z.string().email())`
  - `apps/backend/src/types/db.ts:13-19` — `Recipient` DB row type
  - `apps/backend/src/types/db.ts:21-31` — `Campaign` DB row type

  **Test References**:
  - `apps/backend/tests/auth.test.ts:42-71` — Insert mock pattern with `.response([user])`

  **WHY Each Reference Matters**:
  - The auth service shows how to handle DB inserts with returning data and error handling
  - The recipient find-or-create pattern needs to query first, then insert if not found — all within a transaction

  **Acceptance Criteria**:
  - [ ] Creates campaign with status='draft' and created_by from JWT
  - [ ] Find-or-creates recipients by email
  - [ ] Creates campaign_recipients links with status='pending'
  - [ ] Returns 201 with created campaign + recipient count
  - [ ] Returns 401 without auth
  - [ ] Validates required fields (400 on invalid input)
  - [ ] `pnpm -F backend test` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Create campaign with recipients
    Tool: Bash
    Preconditions: Authenticated user exists
    Steps:
      1. `curl -s -X POST http://localhost:3001/api/campaigns -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"name":"Welcome","subject":"Hello!","body":"Welcome aboard","recipientEmails":["a@test.com","b@test.com"]}'`
      2. Assert status 201
      3. Assert response body has `id`, `name="Welcome"`, `status="draft"`, `recipientCount=2` (or similar)
    Expected Result: 201 Created with campaign data including recipient count
    Failure Indicators: 400 validation error, 500 server error, missing recipient info
    Evidence: .sisyphus/evidence/task-4-create-campaign.json

  Scenario: Create campaign with invalid data returns 400
    Tool: Bash
    Preconditions: Authenticated user exists
    Steps:
      1. `curl -s -X POST http://localhost:3001/api/campaigns -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"name":"","subject":"","body":"","recipientEmails":[]}'`
      2. Assert status 400
      3. Assert body.code is "VALIDATION_ERROR"
    Expected Result: 400 Bad Request with validation error details
    Failure Indicators: 201 or 500 response
    Evidence: .sisyphus/evidence/task-4-create-invalid.json
  ```

  **Commit**: NO (commit grouped with Tasks 3-6)

- [ ] 5. TDD — GET /campaigns/:id (details + recipient stats)

  **What to do**:
  - **RED**: Write failing tests for `GET /api/campaigns/:id`
    - Test: returns campaign details with recipient stats (total, sent, failed, opened counts)
    - Test: returns 404 for non-existent campaign
    - Test: returns 401 without auth
    - Test: returns campaign owned by the authenticated user only (authorization check)
  - **GREEN**: Implement in service and routes
    - Service method: `getCampaignById(userId: string, campaignId: string)` — fetch campaign where `id = campaignId AND created_by = userId`, join campaign_recipients to count statuses
    - Route: `GET /:id` with `requireAuth`
    - Validate `:id` param is UUID using `IdParamSchema` via `validateQuery` or middleware
  - **REFACTOR**: Clean up

  **Must NOT do**:
  - Do not implement the full stats endpoint here — this is just the detail view
  - Do not allow viewing other users' campaigns (403 Forbidden or 404 Not Found)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Join queries, authorization logic, param validation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `apps/backend/src/modules/users/routes.ts:26-33` — Auth middleware + DB query pattern with authorization check

  **API/Type References**:
  - `packages/dto/src/common.ts` — `IdParamSchema` for UUID param validation (verify it exists or add it)
  - `packages/dto/src/campaign.ts` — `CampaignResponseSchema` for response shape

  **Test References**:
  - `apps/backend/tests/auth.test.ts` — Mock-knex tracker pattern

  **WHY Each Reference Matters**:
  - The users route shows the pattern for authenticated single-resource queries with authorization
  - IdParamSchema is needed for validating the `:id` route param

  **Acceptance Criteria**:
  - [ ] Returns 200 with campaign details + recipient status counts for owned campaign
  - [ ] Returns 404 for non-existent or non-owned campaign
  - [ ] Returns 401 without auth
  - [ ] Validates `:id` param format
  - [ ] `pnpm -F backend test` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Get campaign details by ID
    Tool: Bash
    Preconditions: Authenticated user with a created campaign
    Steps:
      1. Create a campaign (see Task 4)
      2. `curl -s http://localhost:3001/api/campaigns/<id> -H "Authorization: Bearer <token>"`
      3. Assert 200 with campaign object containing id, name, subject, body, status, and recipient stats
    Expected Result: 200 with full campaign details
    Failure Indicators: 404 for existing campaign, missing recipient stats
    Evidence: .sisyphus/evidence/task-5-get-details.json

  Scenario: Get non-existent campaign returns 404
    Tool: Bash
    Preconditions: Authenticated user
    Steps:
      1. `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/campaigns/00000000-0000-0000-0000-000000000000 -H "Authorization: Bearer <token>"`
      2. Assert status code 404
    Expected Result: 404 Not Found
    Failure Indicators: 200 with empty/null, 500 error
    Evidence: .sisyphus/evidence/task-5-get-notfound.txt
  ```

  **Commit**: NO (commit grouped with Tasks 3-6)

- [ ] 6. TDD — PATCH /campaigns/:id (draft-only update)

  **What to do**:
  - **RED**: Write failing tests for `PATCH /api/campaigns/:id`
    - Test: updates draft campaign (name, subject, body)
    - Test: returns 409/403 when trying to update non-draft campaign
    - Test: returns 404 for non-existent campaign
    - Test: returns 401 without auth
    - Test: validates partial update fields
  - **GREEN**: Implement in service and routes
    - Service method: `updateCampaign(userId: string, campaignId: string, input: UpdateCampaignRequest)` — check status is 'draft', update only provided fields, return updated campaign
    - Route: `PATCH /:id` with `requireAuth` and `validateBody(UpdateCampaignRequestSchema)`
    - Business rule: If status is not 'draft', throw `HttpError(403, "CAMPAIGN_NOT_DRAFT", "Cannot update a campaign that is not in draft status")`
  - **REFACTOR**: Clean up

  **Must NOT do**:
  - Do not allow updating `status` field — status changes only via schedule/send
  - Do not allow updating `created_by` field
  - Do not use PUT — this is a PATCH (partial update)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Business rule enforcement (draft-only check), partial update logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `apps/backend/src/modules/auth/service.ts:10-17` — HttpError pattern for business rule violations (409 EMAIL_TAKEN)

  **API/Type References**:
  - `packages/dto/src/campaign.ts` — `UpdateCampaignRequestSchema` (from Task 2) with `.partial()` fields

  **WHY Each Reference Matters**:
  - The auth service shows the HttpError pattern for business rule violations which is exactly what draft-only enforcement needs
  - UpdateCampaignRequestSchema must NOT have status field (Task 2 ensures this)

  **Acceptance Criteria**:
  - [ ] Updates draft campaign's permitted fields (name, subject, body)
  - [ ] Returns 403/409 when updating non-draft campaign
  - [ ] Returns 404 for non-existent or non-owned campaign
  - [ ] Returns 401 without auth
  - [ ] Does NOT update status or created_by
  - [ ] `pnpm -F backend test` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Update draft campaign successfully
    Tool: Bash
    Preconditions: Authenticated user with a draft campaign
    Steps:
      1. `curl -s -X PATCH http://localhost:3001/api/campaigns/<id> -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"name":"Updated Name"}'`
      2. Assert 200 with updated campaign (name changed, other fields preserved)
    Expected Result: 200 OK with updated campaign data
    Failure Indicators: 403/409 for draft campaign, name not updated
    Evidence: .sisyphus/evidence/task-6-patch-draft.json

  Scenario: Update non-draft campaign is rejected
    Tool: Bash
    Preconditions: Authenticated user with a sent campaign
    Steps:
      1. Create and send a campaign (via POST /:id/send)
      2. `curl -s -X PATCH http://localhost:3001/api/campaigns/<id> -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"name":"Should Fail"}'`
      3. Assert 403/409 with error code like "CAMPAIGN_NOT_DRAFT"
    Expected Result: 403/409 Forbidden/Conflict with appropriate error message
    Failure Indicators: 200 OK (update went through), 404
    Evidence: .sisyphus/evidence/task-6-patch-nondraft.json
  ```

  **Commit**: YES (individual)
  - Message: `feat(campaign): implement list, create, details, and update endpoints`
  - Files: `apps/backend/src/modules/campaigns/routes.ts`, `apps/backend/src/modules/campaigns/service.ts`, `apps/backend/tests/campaign.test.ts`
  - Pre-commit: `pnpm -F backend test`

- [ ] 7. TDD — DELETE /campaigns/:id (draft-only delete)

  **What to do**:
  - **RED**: Write failing tests for `DELETE /api/campaigns/:id`
    - Test: deletes draft campaign successfully (204)
    - Test: returns 403/409 when trying to delete non-draft campaign
    - Test: returns 404 for non-existent campaign
    - Test: returns 401 without auth
  - **GREEN**: Implement in service and routes
    - Service method: `deleteCampaign(userId: string, campaignId: string)` — check status is 'draft', delete campaign (cascade will handle campaign_recipients)
    - Route: `DELETE /:id` with `requireAuth`
    - Business rule: If status is not 'draft', throw `HttpError(403, "CAMPAIGN_NOT_DRAFT", "Cannot delete a campaign that is not in draft status")`
  - **REFACTOR**: Clean up

  **Must NOT do**:
  - Do not soft-delete — use a real DELETE (campaign_recipients cascade)
  - Do not allow deleting other users' campaigns

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple delete with status check, follows established patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `apps/backend/src/modules/auth/service.ts:13-14` — HttpError pattern for conflict/guard conditions

  **WHY Each Reference Matters**:
  - Same draft-only enforcement pattern as Task 6, just for DELETE instead of PATCH

  **Acceptance Criteria**:
  - [ ] Deletes draft campaign with 204 No Content
  - [ ] Returns 403/409 when deleting non-draft campaign
  - [ ] Returns 404 for non-existent or non-owned campaign
  - [ ] Cascade deletes campaign_recipients
  - [ ] `pnpm -F backend test` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Delete draft campaign successfully
    Tool: Bash
    Preconditions: Authenticated user with a draft campaign
    Steps:
      1. `curl -s -o /dev/null -w "%{http_code}" -X DELETE http://localhost:3001/api/campaigns/<id> -H "Authorization: Bearer <token>"`
      2. Assert status 204
    Expected Result: 204 No Content
    Failure Indicators: 200 with body, 404 for existing draft
    Evidence: .sisyphus/evidence/task-7-delete-draft.txt

  Scenario: Delete non-draft campaign is rejected
    Tool: Bash
    Preconditions: Authenticated user with a sent campaign
    Steps:
      1. `curl -s -X DELETE http://localhost:3001/api/campaigns/<id> -H "Authorization: Bearer <token>"`
      2. Assert 403/409 with error code "CAMPAIGN_NOT_DRAFT"
    Expected Result: 403/409 with appropriate error
    Failure Indicators: 204 (delete went through)
    Evidence: .sisyphus/evidence/task-7-delete-nondraft.json
  ```

  **Commit**: NO (commit grouped with Tasks 7-10)

- [ ] 8. TDD — POST /campaigns/:id/schedule (future timestamp)

  **What to do**:
  - **RED**: Write failing tests for `POST /api/campaigns/:id/schedule`
    - Test: schedules a draft campaign with future timestamp (sets status to 'scheduled')
    - Test: returns 400 when scheduled_at is in the past
    - Test: returns 403/409 when campaign is not in draft status
    - Test: returns 404 for non-existent campaign
    - Test: returns 401 without auth
  - **GREEN**: Implement in service and routes
    - Service method: `scheduleCampaign(userId: string, campaignId: string, input: ScheduleCampaignRequest)` — validate campaign exists and is draft, validate `scheduledAt` is in the future, set `status = 'scheduled'` and `scheduled_at = input.scheduledAt`
    - Route: `POST /:id/schedule` with `requireAuth` and `validateBody(ScheduleCampaignRequestSchema)`
    - Business rule: `scheduledAt` must be > `new Date()`
  - **REFACTOR**: Clean up

  **Must NOT do**:
  - Do not implement actual job scheduling — just set the timestamp and status
  - Do not allow scheduling a campaign that's already scheduled or sent

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Business rule (future timestamp validation), status transition logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 1, 2

  **References**:

  **API/Type References**:
  - `packages/dto/src/campaign.ts` — `ScheduleCampaignRequestSchema` with `scheduledAt: z.string().datetime()`

  **WHY Each Reference Matters**:
  - ScheduleCampaignRequestSchema defines the input shape for the schedule endpoint

  **Acceptance Criteria**:
  - [ ] Sets campaign status to 'scheduled' and scheduled_at to provided timestamp
  - [ ] Returns 400 when scheduled_at is in the past
  - [ ] Returns 403/409 when campaign is not in draft status
  - [ ] Returns 404 for non-existent or non-owned campaign
  - [ ] Returns 401 without auth
  - [ ] `pnpm -F backend test` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Schedule campaign with future timestamp
    Tool: Bash
    Preconditions: Authenticated user with a draft campaign
    Steps:
      1. Get current time, add 1 hour: `future_time=$(date -u -v+1H +%Y-%m-%dT%H:%M:%SZ)` (or ISO string)
      2. `curl -s -X POST http://localhost:3001/api/campaigns/<id>/schedule -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"scheduledAt":"<future_time>"}'`
      3. Assert 200 with status='scheduled' and scheduled_at set
    Expected Result: 200 with campaign data showing status='scheduled' and scheduled_at
    Failure Indicators: 400 for future timestamp, 403 for draft campaign
    Evidence: .sisyphus/evidence/task-8-schedule-future.json

  Scenario: Schedule campaign with past timestamp returns 400
    Tool: Bash
    Preconditions: Authenticated user with a draft campaign
    Steps:
      1. `curl -s -X POST http://localhost:3001/api/campaigns/<id>/schedule -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"scheduledAt":"2020-01-01T00:00:00Z"}'`
      2. Assert 400 with error code "PAST_SCHEDULED_AT" or similar
    Expected Result: 400 Bad Request indicating scheduled_at must be in the future
    Failure Indicators: 200 (schedule went through with past time)
    Evidence: .sisyphus/evidence/task-8-schedule-past.json
  ```

  **Commit**: NO (commit grouped with Tasks 7-10)

- [ ] 9. TDD — POST /campaigns/:id/send (simulate, terminal state)

  **What to do**:
  - **RED**: Write failing tests for `POST /api/campaigns/:id/send`
    - Test: marks all recipients as 'sent' with sent_at timestamp, sets campaign status to 'sent'
    - Test: returns 403/409 when campaign is not in draft or scheduled status
    - Test: returns 404 for non-existent campaign
    - Test: returns 401 without auth
    - Test: idempotency — calling send on already-sent campaign returns 409 Conflict
  - **GREEN**: Implement in service and routes
    - Service method: `sendCampaign(userId: string, campaignId: string)` — use transaction; check campaign status is 'draft' or 'scheduled'; update campaign_recipients set `status='sent', sent_at=now()`; update campaign set `status='sent'`; return updated campaign
    - Route: `POST /:id/send` with `requireAuth`
    - Business rule: once sent, status cannot be changed (terminal state)
  - **REFACTOR**: Clean up

  **Must NOT do**:
  - Do not implement actual email sending — this is a simulation
  - Do not allow sending if status is already 'sent'
  - Do not allow sending other users' campaigns

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Transaction-based send with status enforcement and idempotency concerns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `apps/backend/migrations/20260421000000_init.ts:66-98` — campaign_recipients table has `sent_at` and `status` columns to update

  **WHY Each Reference Matters**:
  - The migration shows exactly what columns need to be updated in campaign_recipients during send

  **Acceptance Criteria**:
  - [ ] Sets campaign status to 'sent' (terminal)
  - [ ] Sets all campaign_recipients status to 'sent' with sent_at = now()
  - [ ] Returns 403/409 when campaign is already sent
  - [ ] Returns 404 for non-existent or non-owned campaign
  - [ ] Returns 401 without auth
  - [ ] Transaction ensures atomicity (campaign + recipients updated together)
  - [ ] `pnpm -F backend test` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Send a campaign marks recipients as sent
    Tool: Bash
    Preconditions: Authenticated user with a draft/scheduled campaign with recipients
    Steps:
      1. `curl -s -X POST http://localhost:3001/api/campaigns/<id>/send -H "Authorization: Bearer <token>"`
      2. Assert 200 with campaign status='sent'
      3. GET /campaigns/:id and verify status is 'sent'
    Expected Result: 200 with campaign data showing status='sent'
    Failure Indicators: Status remains 'draft' or 'scheduled', recipients not updated
    Evidence: .sisyphus/evidence/task-9-send-success.json

  Scenario: Sending an already-sent campaign returns 409
    Tool: Bash
    Preconditions: Authenticated user with a sent campaign
    Steps:
      1. `curl -s -X POST http://localhost:3001/api/campaigns/<id>/send -H "Authorization: Bearer <token>"`
      2. Assert 409 with error code like "CAMPAIGN_ALREADY_SENT"
    Expected Result: 409 Conflict with appropriate error
    Failure Indicators: 200 (send processed again)
    Evidence: .sisyphus/evidence/task-9-send-duplicate.json
  ```

  **Commit**: NO (commit grouped with Tasks 7-10)

- [ ] 10. TDD — GET /campaigns/:id/stats (rates and counts)

  **What to do**:
  - **RED**: Write failing tests for `GET /api/campaigns/:id/stats`
    - Test: returns stats for a campaign with recipients (total, sent, failed, opened, open_rate, send_rate)
    - Test: returns zeroed stats for campaign with no recipients (avoid division by zero)
    - Test: returns 404 for non-existent campaign
    - Test: returns 401 without auth
  - **GREEN**: Implement in service and routes
    - Service method: `getCampaignStats(userId: string, campaignId: string)` — query campaign_recipients aggregate counts, calculate `open_rate = opened / total * 100` (or 0 if total=0), `send_rate = sent / total * 100` (or 0 if total=0)
    - Route: `GET /:id/stats` with `requireAuth`
    - Response shape matches: `{ total, sent, failed, opened, open_rate, send_rate }`
  - **REFACTOR**: Clean up

  **Must NOT do**:
  - Do not divide by zero — always check if `total === 0`
  - Do not include rate calculations in the raw DB query — calculate in service

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Aggregate queries and rate calculations with edge case handling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 1, 2

  **References**:

  **API/Type References**:
  - `packages/dto/src/campaign.ts` — `CampaignStatsResponseSchema` with { total, sent, failed, opened, open_rate, send_rate }
  - `apps/backend/src/types/db.ts:33-39` — `CampaignRecipient` with `status` field for aggregation

  **WHY Each Reference Matters**:
  - CampaignStatsResponseSchema defines the exact response shape including rate fields
  - CampaignRecipient table has the status column needed for count aggregations

  **Acceptance Criteria**:
  - [ ] Returns correct stats with rates for campaign with recipients
  - [ ] Returns zeroed stats for campaign with no recipients (total=0, open_rate=0, send_rate=0)
  - [ ] Returns 404 for non-existent or non-owned campaign
  - [ ] Returns 401 without auth
  - [ ] Rate calculations: `open_rate = (opened / total) * 100`, `send_rate = (sent / total) * 100`
  - [ ] `pnpm -F backend test` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Stats for campaign with recipients
    Tool: Bash
    Preconditions: Authenticated user with a sent campaign that has recipients
    Steps:
      1. `curl -s http://localhost:3001/api/campaigns/<id>/stats -H "Authorization: Bearer <token>"`
      2. Assert 200 with { total: N, sent: N, failed: 0, opened: 0, open_rate: 0, send_rate: 100 } (or similar based on data)
      3. Verify rate calculations: send_rate = (sent / total) * 100
    Expected Result: 200 with correct stats object including calculated rates
    Failure Indicators: Missing rate fields, NaN for rates, wrong calculations
    Evidence: .sisyphus/evidence/task-10-stats.json

  Scenario: Stats for campaign with no recipients (division by zero protection)
    Tool: Bash
    Preconditions: Authenticated user with a campaign created with empty recipients
    Steps:
      1. `curl -s http://localhost:3001/api/campaigns/<id>/stats -H "Authorization: Bearer <token>"`
      2. Assert 200 with { total: 0, sent: 0, failed: 0, opened: 0, open_rate: 0, send_rate: 0 }
    Expected Result: 200 with zeroed stats, no NaN or Infinity values
    Failure Indicators: NaN in rates, 500 error
    Evidence: .sisyphus/evidence/task-10-stats-empty.json
  ```

  **Commit**: NO (commit grouped with Tasks 7-10)

- [ ] 11. Wire campaign routes in app.ts

  **What to do**:
  - Import `campaignRouter` from `@/modules/campaigns/routes.js` in `src/app.ts`
  - Add `app.use("/api/campaigns", campaignRouter(db))` before `notFoundHandler`
  - Verify that auth routes and user routes still work
  - Run `pnpm -F backend check-types` and `pnpm -F backend dev` to verify

  **Must NOT do**:
  - Do not add middleware after `notFoundHandler`/`errorHandler`
  - Do not modify existing routes (auth, users)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple import + one line addition
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (after all TDD cycles)
  - **Blocks**: Task 12
  - **Blocked By**: Tasks 3-10

  **References**:

  **Pattern References**:
  - `apps/backend/src/app.ts:19-20` — Existing route wiring pattern: `app.use("/api/auth", authRouter(db))` and `app.use("/api/users", usersRouter(db))`

  **WHY Each Reference Matters**:
  - app.ts shows exactly where to add the new route — after existing routes, before notFoundHandler

  **Acceptance Criteria**:
  - [ ] Campaign routes accessible at `/api/campaigns/*`
  - [ ] Auth routes still accessible at `/api/auth/*`
  - [ ] `pnpm -F backend check-types` passes
  - [ ] Server starts without errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Campaign routes are wired and accessible
    Tool: Bash
    Preconditions: Backend dev server running
    Steps:
      1. `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/campaigns` (without auth)
      2. Assert 401 (route exists, auth required)
      3. `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/auth/login` (existing route)
      4. Assert not 404
    Expected Result: Campaign endpoints return 401 (exists but needs auth), auth routes still work
    Failure Indicators: 404 on campaign routes (not wired), auth routes broken
    Evidence: .sisyphus/evidence/task-11-route-wiring.txt
  ```

  **Commit**: NO (commit grouped with Task 12)

- [ ] 12. Full integration test + type check + lint

  **What to do**:
  - Run `pnpm -F backend test` — all tests must pass (auth + campaign)
  - Run `pnpm -F backend check-types` — no TypeScript errors
  - Run `pnpm -F backend lint` — no lint errors
  - Run `pnpm build` from root — monorepo builds successfully
  - Fix any issues found

  **Must NOT do**:
  - Do not skip failing tests — fix them
  - Do not use `@ts-ignore` or `as any` to suppress type errors

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration testing and debugging across the full stack
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (after Task 11)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 11

  **References**:

  **Pattern References**:
  - `apps/backend/tests/auth.test.ts` — Existing test patterns for integration
  - `apps/backend/tests/health.test.ts` — Simple endpoint test pattern

  **Acceptance Criteria**:
  - [ ] `pnpm -F backend test` passes with 0 failures
  - [ ] `pnpm -F backend check-types` passes with 0 errors
  - [ ] `pnpm -F backend lint` passes with 0 errors/warnings
  - [ ] All existing auth tests still pass

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full test suite passes
    Tool: Bash
    Preconditions: All code changes applied
    Steps:
      1. Run `pnpm -F backend test`
      2. Assert exit code 0
      3. Verify all test suites pass (auth + campaign + health)
    Expected Result: All tests pass, 0 failures
    Failure Indicators: Any test failures, missing test files
    Evidence: .sisyphus/evidence/task-12-test-results.txt

  Scenario: Type check and lint pass
    Tool: Bash
    Preconditions: All code changes applied
    Steps:
      1. Run `pnpm -F backend check-types`
      2. Assert exit code 0
      3. Run `pnpm -F backend lint`
      4. Assert exit code 0
    Expected Result: No TypeScript errors, no lint errors
    Failure Indicators: Type errors, lint warnings
    Evidence: .sisyphus/evidence/task-12-typecheck-lint.txt
  ```

  **Commit**: YES (final)
  - Message: `feat(campaign): complete campaign module with routes, service, and tests`
  - Files: All campaign module files
  - Pre-commit: `pnpm -F backend test && pnpm -F backend check-types && pnpm -F backend lint`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm -F backend check-types` + `pnpm -F backend lint` + `pnpm -F backend test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (all endpoints working together). Test edge cases: empty campaigns list, creating campaign with empty recipients, deleting non-draft, scheduling past date, sending twice. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Task 1-2**: `feat(campaign): align db schema and dtos with requirement spec` — migration file, dto files, types/db.ts
- **Task 3-6**: `feat(campaign): implement campaign list, create, details, and update endpoints` — routes.ts, service.ts, test file additions
- **Task 7-10**: `feat(campaign): implement campaign delete, schedule, send, and stats endpoints` — service.ts, routes.ts, test file additions
- **Task 11-12**: `feat(campaign): wire routes and complete integration` — app.ts, final test updates

---

## Success Criteria

### Verification Commands

```bash
pnpm -F backend check-types   # Expected: no errors
pnpm -F backend lint           # Expected: 0 warnings, 0 errors
pnpm -F backend test           # Expected: all tests pass
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Campaign status is `draft | scheduled | sent` (no `sending`, no `FAILED`)
- [ ] Draft-only enforcement on PATCH/DELETE returns 409/403
- [ ] Future timestamp enforcement on schedule returns 400
- [ ] Send operation is idempotent-safe (transaction check)
- [ ] Stats returns correct rates with division-by-zero protection
