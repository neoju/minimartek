## Init new apps and packakges:

### APPs:

1/ backend:

- ExpressJS, OpenAPI, Jest TDD, TypeScript, JWT
- PostgreSQL with knex query builder
  2/ frontend:
- React 19 (with Vite, TypeScript)
- shadcn/ui
- Redux Toolkit
- SWR for API calling

### Shared packages:

1/ utils - contains shared functions, contants, enums that use for both FE and BE ie date formatting
2/ dto - contains DTO object with zod validation and export intered type that use for API calling
3/ keep current eslint-config and typescript-config and update it to compatible with React and Express

_Use CLI tools to create and implement libs, do not generate code. For example, use shadcn CLI to add button component, do not try to generate or copy it from internet or your trainning data_
