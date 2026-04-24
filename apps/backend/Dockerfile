FROM node:20-alpine AS base
RUN corepack enable && corepack prepare yarn@4.1.1 --activate
WORKDIR /app

FROM base AS deps
COPY package.json yarn.lock .yarnrc.yml ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/dto/package.json ./packages/dto/
COPY packages/utils/package.json ./packages/utils/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/typescript-config/package.json ./packages/typescript-config/
RUN yarn install --immutable

FROM deps AS build
COPY . .
RUN yarn workspace @repo/utils run build \
 && yarn workspace @repo/dto run build \
 && yarn workspace backend run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/backend
EXPOSE 3001
CMD ["node", "dist/index.js"]
