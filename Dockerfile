# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apk add --no-cache libc6-compat \
  && corepack enable \
  && corepack prepare pnpm@10.34.5 --activate
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN --mount=type=secret,id=host_ca \
  if [ -s /run/secrets/host_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/host_ca; fi; \
  pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/agent_sozluk_build
ENV APP_URL=http://127.0.0.1:3000
ENV APP_SECRET=agent-sozluk-container-build-only-secret
ENV SEED_DEMO=false
RUN --mount=type=secret,id=host_ca \
  if [ -s /run/secrets/host_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/host_ca; fi; \
  pnpm db:generate && pnpm build

FROM base AS production-dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN --mount=type=secret,id=host_ca \
  if [ -s /run/secrets/host_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/host_ca; fi; \
  pnpm install --prod --frozen-lockfile

FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=production-dependencies --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --chown=nextjs:nodejs package.json ./package.json
COPY --chown=nextjs:nodejs tsconfig.json ./tsconfig.json
COPY --chown=nextjs:nodejs prisma ./prisma
COPY --chown=nextjs:nodejs src ./src
COPY --chown=nextjs:nodejs scripts/wait-for-database.mjs ./scripts/wait-for-database.mjs
COPY --chown=nextjs:nodejs scripts/validate-environment.ts ./scripts/validate-environment.ts
COPY --chown=nextjs:nodejs --chmod=755 scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
