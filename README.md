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

## Tests

```bash
npm test
```

The HTTP integration test needs a second database:

```bash
docker compose exec postgres psql -U rev -c 'CREATE DATABASE revapp_test OWNER rev'
npm run test:integration -w @rev/api
```
