FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci --workspace=@rev/api --include-workspace-root --ignore-scripts

COPY apps/api/prisma apps/api/prisma
COPY apps/api/src apps/api/src
COPY apps/api/tsconfig.json apps/api/tsconfig.json
COPY packages/shared/src packages/shared/src
COPY apps/api/docker-entrypoint.sh apps/api/docker-entrypoint.sh

RUN DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build" \
    /app/node_modules/.bin/prisma generate --schema apps/api/prisma/schema.prisma \
  && chmod +x apps/api/docker-entrypoint.sh \
  && useradd --create-home --uid 10001 app \
  && chown -R app:app /app

ENV NODE_ENV=production
USER app
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then((res)=>process.exit(res.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/apps/api/docker-entrypoint.sh"]
