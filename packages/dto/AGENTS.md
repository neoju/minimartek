# packages/dto

Shared Zod schemas + inferred TypeScript types. Single source of truth for API contracts.

## STRUCTURE

- `src/auth.ts` — `LoginSchema`, `RegisterSchema`, `AuthResponseSchema`, inferred types.
- `src/user.ts` — `UserSchema`, `UpdateUserSchema`, `UserListQuerySchema`, etc.
- `src/common.ts` — pagination (`PaginationSchema`), `IdParamSchema`, shared primitives.
- `src/index.ts` — barrel re-export. **All new files must be re-exported here.**

## CONVENTIONS

- **Zod-first**: define schema, then `export type X = z.infer<typeof XSchema>`. Never write types by hand alongside schemas.
- **Naming**: `FooSchema` for the schema, `Foo` for the inferred type.
- **Consumed as source**: pnpm workspace resolves `@repo/dto` to `src/index.ts`. Backend Jest `moduleNameMapper` and Vite both resolve to `.ts` — no build step needed for dev.
- **`package.json` `exports`**: points to `src/index.ts` (type: "module"). Keep it this way.

## WHEN TO ADD

- Request/response body for a new endpoint → new file in `src/` + re-export.
- Query-string shape → add to existing file if related, else new file.
- Shared enum across client+server → `src/common.ts` (or `@repo/utils` if not Zod-related).

## GOTCHAS

- Backend validators (`validateBody(Schema)`) and frontend forms both import from here. **Changing a schema is a cross-app breaking change** — grep both apps before editing.
- Do not import runtime code from `@repo/utils` into schema files unless strictly needed — keep DTOs pure.
