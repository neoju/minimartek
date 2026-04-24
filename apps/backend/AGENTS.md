# apps/backend

Express 4 REST API. Knex + PostgreSQL. JWT auth. Zod validation.

## STRUCTURE

- `src/index.ts` — bootstrap: build Knex, register routes, `app.listen`.
- `src/app.ts` — `createApp(db)` factory. CORS + JSON + `/api` prefix + `errorHandler` last.
- `src/modules/{auth,users}/` — each has `*.router.ts` (factory taking `db`) and `*.service.ts`.
- `src/middleware/` — `auth.ts` (JWT verify → `req.user`), `validate.ts` (Zod `validateBody`/`validateQuery`), `error.ts` (catches `HttpError`).
- `src/lib/http-error.ts` — `HttpError(status, code, message)`. Throw from services; middleware formats JSON.
- `src/lib/types.ts` — `express-serve-static-core` module augmentation for `req.user`.
- `src/db/knex.ts` — Knex factory from `config/env.ts`.
- migrations/ — Knex migrations (timestamp-prefixed).
- `tests/` — Jest ESM + supertest. Uses `mock-knex` to intercept database queries.

## CONVENTIONS

- **Router factories**: `export function authRouter(db: Knex): Router`. Wire in `src/index.ts`. Never import a singleton db in modules.
- **Services**: plain functions taking `db` as first arg. Throw `HttpError`, never return error shapes.
- **Validation**: `validateBody(SomeSchema)` / `validateQuery(...)` from `@repo/dto`. Parsed data lives on `req.body` (typed) or `req.validatedQuery`.
- **Typed query access**: Use `WithValidatedQuery<z.infer<typeof SomeSchema>>` from `@/lib/validate.js` — never cast with an inline anonymous type. Example:

  ```ts
  type ValidatedPaginationQuery = WithValidatedQuery<z.infer<typeof PaginationQuerySchema>>;

  const query = (req as ValidatedPaginationQuery).validatedQuery;
  ```

- **Imports**: `.js` suffix required (NodeNext ESM). E.g. `import { foo } from "./bar.js"`.
- **Auth**: `authMiddleware` sets `req.user = { id, email, role }` from JWT. Use `AUTH_HEADER` + `AUTH_SCHEME` from `@repo/utils`.
- **DTOs**: import schemas/types from `@repo/dto`. Do not redefine locally.

## DATABASE CONVENTIONS

- **Primary IDs**: Use UUIDv7. Default value: `knex.raw("uuidv7()")`.
- **Timestamps**: Use `TIMESTAMPTZ` for all date/time columns.
  - pattern:

  ```typescript
  await knex.schema
    .createTable("users", (table) => {
      table.uuid("id").primary().defaultTo(knex.raw("uuidv7()"));
      // ...
      table.timestamps(true, true);
    })
    .then(() => knex.raw(onUpdateTrigger("users")));
  ```

  ```

  ```

- **Automatic `updated_at`**: Use the `onUpdateTrigger` helper in migrations.
  - Requires `on_update_timestamp()` PL/pgSQL function (defined in the first migration).
  - Migration pattern: `.then(() => knex.raw(onUpdateTrigger("table_name")))`.

## TESTING

- Jest preset: `ts-jest/presets/default-esm`. Run: `pnpm -F backend test`.
- Tests use `mock-knex` to simulate database interactions. See `tests/auth.test.ts` for the pattern.
- Supertest against `createApp(mockDb)` — no real Postgres needed.

## COMMANDS

```bash
pnpm -F backend dev              # tsx watch src/index.ts
pnpm -F backend build            # tsc → dist/
pnpm -F backend migrate:latest   # needs DATABASE_URL or docker db up
pnpm -F backend migrate:make name
```

## GOTCHAS

- `errorHandler` must be the **last** middleware — `createApp` already wires it; don't add middleware after it.
- Default `JWT_SECRET = "dev-secret-change-me"`. App boots without a real one; override via env in prod.
