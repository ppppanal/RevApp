#!/bin/sh
set -eu

cd /app/apps/api
/app/node_modules/.bin/prisma migrate deploy
exec /app/node_modules/.bin/tsx src/index.ts
