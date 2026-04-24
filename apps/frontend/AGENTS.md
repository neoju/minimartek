# apps/frontend

React 19 SPA. Vite 6. Redux Toolkit + SWR. Tailwind v4 + shadcn/ui. React Router v7.

## STRUCTURE

- `src/main.tsx` — mount `<Provider store={store}><App/></Provider>`.
- `src/App.tsx` — root with `<BrowserRouter>` and route definitions.
- `src/pages/` — route-level pages: `Login.tsx`, `CampaignList.tsx`, `CampaignNew.tsx`, `CampaignDetail.tsx`.
- `src/app/store.ts` — Redux store config. Add slices to `reducer` map.
- `src/app/hooks.ts` — `useAppDispatch`, `useAppSelector` (typed). **Always use these**, never raw `useDispatch`/`useSelector`.
- `src/features/[name]/[name]Slice.ts` — feature slices (RTK `createSlice`). One folder per feature.
- `src/components/ui/**` — shadcn/ui generated components. **Ignored by ESLint.** Do not hand-edit; regenerate via CLI.
- `src/components/*.tsx` — app-level components.
- `src/lib/api-client.ts` — fetch wrapper. Injects `Authorization: ${AUTH_SCHEME} <token>` from store/localStorage. Use this, not raw `fetch`.
- `src/lib/campaign.ts` — campaign-related UI helpers (status badge colors).
- `src/lib/utils.ts` — `cn()` (tailwind-merge + clsx).

## ROUTES

- `/login` — login form
- `/campaigns` — list with pagination + status badges
- `/campaigns/new` — create form
- `/campaigns/:id` — detail with stats + action buttons

## CONVENTIONS

- **Path alias**: `@/` → `src/`. Configured in `vite.config.ts` + `tsconfig.json`.
- **State split**: Redux = client/UI state (auth, counters, local flags). SWR = server data (lists, records). Don't mirror server data into Redux.
- **DTOs**: request/response types from `@repo/dto`. Do not redefine.
- **Styling**: Tailwind v4 (CSS-first config, `@tailwindcss/vite` plugin). CVA for variants. `cn()` for class merging.
- **Components**: add via shadcn CLI (see `components.json`). Never copy component code by hand.
- **Status badge colors**: `draft=grey`, `scheduled=blue`, `sent=green` — use `getStatusBadgeClass()` from `@/lib/campaign`, do not reinvent.

## COMMANDS

```bash
pnpm -F frontend dev             # vite :5173
pnpm -F frontend build           # tsc -b && vite build
pnpm -F frontend lint            # eslint; ignores src/components/ui/**
pnpm dlx shadcn@latest add <component>   # add new UI primitive
```

## GOTCHAS

- **No test framework configured.** Adding tests requires setting up Vitest/RTL from scratch.
- Docker build serves via nginx on container:80 → host `FE_PORT` (default 8080). Dev server (5173) is separate.
- API base URL: read `VITE_API_URL` env; `api-client` prepends `API_PREFIX` from `@repo/utils`.
- React 19: do **not** use legacy `ReactDOM.render`. Use `createRoot` (already in `main.tsx`).
