# Rev

Turn plain-text notes into a summary, key points, and flashcards.

Notes belong to a local dev user (`DEV_USER_EMAIL`) until accounts have a login. PDF and image extraction use the same interface as text and return a clear “not available yet” error.

## Run locally

Requirements: Node.js 20+, Docker.

```bash
cp .env.example apps/api/.env
```

Set `LLM_API_KEY` in `apps/api/.env`. The default provider is Gemini’s free tier through its OpenAI-compatible endpoint (`LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`). Free tiers are rate-limited and may retain prompts.

```bash
docker compose up -d
npm install
npm run db:migrate -w @rev/api
npm run dev -w @rev/api
```

The API listens on [http://localhost:3000](http://localhost:3000).

In a second terminal, from the repo root:

```bash
cp apps/mobile/.env.example apps/mobile/.env
npm run start -w @rev/mobile
```

That starts the Expo dev server. Press `w` for web, or scan the QR code with Expo Go. For a browser only:

```bash
npm run web -w @rev/mobile
```

`EXPO_PUBLIC_API_URL` defaults to `http://localhost:3000`. Use your computer’s LAN address for a phone, and `http://10.0.2.2:3000` for the Android emulator.

Create a note:

```bash
curl -s -X POST http://localhost:3000/notes \
  -H 'content-type: application/json' \
  -d '{"text":"Mitochondria produce ATP. ATP is the energy currency of the cell."}'
```

Set `LLM_PROVIDER=fake` in `apps/api/.env` to exercise the app without calling a model.

## Run the API in Docker

`docker compose up -d` still starts only Postgres. The API image is a separate profile so it does not take port 3000 from a local `npm run dev`.

```bash
docker build -f apps/api/Dockerfile -t rev-api .
docker compose --profile api up --build
```

The container listens on port 3000, runs `prisma migrate deploy`, then starts the API. With no `LLM_API_KEY` in the shell, Compose sets `LLM_PROVIDER=fake`. To call Gemini instead:

```bash
LLM_PROVIDER=openai LLM_API_KEY=your-key docker compose --profile api up --build
```

Run the image against Postgres on the host:

```bash
docker run --rm -p 3000:3000 \
  --add-host=host.docker.internal:host-gateway \
  -e DATABASE_URL=postgresql://rev:rev@host.docker.internal:5432/revapp \
  -e LLM_PROVIDER=fake \
  rev-api
```

## Deploy on Render

This environment has no Render credentials, so nothing is deployed from here. The blueprint in `render.yaml` describes a free web service (`rev-api`) and the one free Postgres instance a workspace can have (`rev-postgres`, PostgreSQL 16, database `revapp`). They are both in Oregon so the API can use the private `DATABASE_URL`. Cloudflare Workers cannot run this Express process plus Postgres.

Free web services sleep after 15 minutes without traffic and take about a minute to wake. A workspace gets 750 free instance hours per month. Free Postgres is 1 GB, has no backups, and expires 30 days after creation. After that there is a 14-day window to move it to a paid plan before Render deletes it. Do not put real notes there.

1. Merge this branch so `render.yaml` and `apps/api/Dockerfile` are on the branch you will deploy (usually `main`).
2. Create a Render account and connect GitHub: [https://dashboard.render.com](https://dashboard.render.com).
3. In the dashboard, choose **New** → **Blueprint**.
4. Select the `ppppanal/RevApp` repository. If you are deploying before the merge, set the branch to the branch that contains `render.yaml`.
5. Render reads `render.yaml` and plans `rev-api` (free web) plus `rev-postgres` (free Postgres). Apply the blueprint.
6. When Render prompts for `LLM_API_KEY`, paste a Gemini API key from Google AI Studio. Leave the field empty only if you later set `LLM_PROVIDER=fake` in the service environment. Do not commit the key.
7. Wait for the first deploy. The image runs migrations before it listens. Open the service URL Render shows and request `/health`. A ready service returns `{"ok":true}`.
8. Point the Expo app at that URL with `EXPO_PUBLIC_API_URL` (no trailing slash).

`PORT` is set by Render. `DATABASE_URL` comes from the blueprint (`fromDatabase` / `connectionString`) and is not written into the repo. The container listens on `0.0.0.0`.

## Tests

```bash
npm test
```

The HTTP integration test needs a second database:

```bash
docker compose exec postgres psql -U rev -c 'CREATE DATABASE revapp_test OWNER rev'
npm run test:integration -w @rev/api
```
