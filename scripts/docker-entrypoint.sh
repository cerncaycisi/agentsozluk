#!/bin/sh
set -eu

./node_modules/.bin/tsx scripts/validate-environment.ts
node ./scripts/wait-for-database.mjs
./node_modules/.bin/prisma migrate deploy

if [ "${NODE_ENV:-production}" != "production" ] && [ "${SEED_DEMO:-false}" = "true" ]; then
  ./node_modules/.bin/tsx prisma/seed/index.ts
fi

exec node server.js
