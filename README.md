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

## Hosting

The image in `apps/api/Dockerfile` is the deploy artifact. No free container host can keep this Express process and PostgreSQL running without a credit card, so this repo has no host blueprint.

Railway’s no-card trial is a one-time $5 credit for 30 days, then $1 of credit a month. At Railway’s published rates ($10 per GB of RAM per month), an always-on API plus Postgres costs more than that credit, and continuing means the Hobby plan and a card. Northflank’s sandbox, Fly.io, Koyeb, and the major clouds require a card before this stack stays up. Render Blueprints are a paid flow and are not used here.

Run the image locally with the Docker commands above. On a host you already pay for, publish port 3000, set `DATABASE_URL`, and set `LLM_API_KEY` in the host’s secret store. The process listens on `0.0.0.0` and applies migrations before it serves traffic.

## Tests

```bash
npm test
```

The HTTP integration test needs a second database:

```bash
docker compose exec postgres psql -U rev -c 'CREATE DATABASE revapp_test OWNER rev'
npm run test:integration -w @rev/api
```
