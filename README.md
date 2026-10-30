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

## Host the web app

The Expo web export is a static site. `render.yaml` publishes it on Render’s free static tier. There is no install prompt and no service worker.

`EXPO_PUBLIC_API_URL` is inlined when the site is built. No public API host is configured in this repo, so set that variable to the API origin (no trailing slash) before the first deploy. Changing it later requires a new deploy. If it is unset, the site still loads and calls `http://localhost:3000`.

1. Open [https://dashboard.render.com](https://dashboard.render.com) and sign in (GitHub is fine).
2. Choose **New** → **Blueprint**.
3. Connect GitHub if asked, and allow Render to read `ppppanal/RevApp`.
4. Select `ppppanal/RevApp`. Use branch `cursor/rev-web-static-host-ddf9`, or `cursor/rev-study-first-slice-0fd5` after this hosting change is merged there. Leave the Blueprint path as `render.yaml`.
5. When Render asks for `EXPO_PUBLIC_API_URL`, paste the public API origin. Leave it blank only if you do not have that host yet.
6. Choose **Deploy Blueprint**.

Render shows the public URL on the `rev-study` static site. When the name is free, that URL is [https://rev-study.onrender.com](https://rev-study.onrender.com).

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
