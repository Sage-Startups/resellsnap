# ResellSnap AI — one image, two entrypoints.
#
# The web service and the background worker run from the same image; Railway
# sets the start command per service. Building once means the worker can never
# be running different code from the web app.
#
# The image deliberately does not use Next's `standalone` output. Standalone
# ships a traced, minimal `node_modules` for the web server alone, but this
# image must also run the worker, which executes TypeScript from `src/` through
# tsx and needs the full production dependency tree. Carrying both trees — or
# copying one over the other — is a good way to get a subtly broken server, and
# saves little once the worker's dependencies are present anyway.

# --- Dependencies ----------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app

RUN corepack enable

# Only the manifests, so this layer is cached until dependencies change.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# --- Build -----------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `next build` runs long before this image is given a database or a bucket, so
# the production environment checks are deferred to boot, where they belong.
ENV NEXT_TELEMETRY_DISABLED=1 \
    SKIP_ENV_VALIDATION=1

RUN pnpm build

# Drop everything only needed to build. `prisma`, `tsx` and `dotenv` are
# runtime dependencies for this deployment: migrations run as the release
# command, and the worker executes TypeScript directly.
RUN pnpm prune --prod

# --- Runtime ---------------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app

RUN corepack enable

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/package.json /app/pnpm-lock.yaml ./
COPY --from=build --chown=node:node /app/next.config.ts /app/prisma.config.ts /app/tsconfig.json ./

# Run as a non-root user; `node` already exists in the base image.
USER node

EXPOSE 3000

# The worker service overrides this with `pnpm worker`, and the cron service
# with `pnpm maintenance`.
CMD ["pnpm", "start"]
