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

## Host the web app

The Expo web export is a static site on Cloudflare Pages’ Free plan. Open the `pages.dev` URL in a browser. There is no install step and no service worker.

`wrangler.toml` names the Pages project and the export directory. `apps/mobile/public/_redirects` is copied into that export so unknown paths serve `index.html`. Pages does not read the build command from the repo, so set it in the dashboard.

`EXPO_PUBLIC_API_URL` is inlined when the site is built. No public API host is configured in this repo. Set that variable to the API origin (no trailing slash) before the first deploy, or omit it. If it is omitted, the site still loads and calls `http://localhost:3000`. Changing it later requires a new deploy.

Stay on the Free plan. Do not upgrade, and do not create a Worker.

1. Sign up or log in at [https://dash.cloudflare.com](https://dash.cloudflare.com).
2. Open **Workers & Pages**.
3. Select **Create application**.
4. Select the **Pages** tab, then **Connect to Git**.
5. Select **GitHub**. If asked, install the Cloudflare Pages GitHub app and grant it access to `ppppanal/RevApp`.
6. Select `ppppanal/RevApp`, then **Install & Authorize** and **Begin setup**.
7. On **Set up builds and deployments**, enter:
   - Project name: `rev-study`. If Cloudflare says that name is taken, pick another. The public URL is `https://<project-name>.pages.dev`.
   - Production branch: `cursor/rev-web-static-host-ddf9`. After this change is merged, you can switch production to `cursor/rev-study-first-slice-0fd5`.
   - Framework preset: **None**.
   - Build command: `npm ci --include=dev && npm run export:web`
   - Build output directory: `apps/mobile/dist`
   - Root directory (advanced): leave the path empty.
8. Under **Environment variables (optional)**, add:
   - `SKIP_DEPENDENCY_INSTALL` = `true`
   - `EXPO_NO_TELEMETRY` = `1`
   - `EXPO_PUBLIC_API_URL` = the public API origin, with no trailing slash. Skip this variable if you do not have that host yet.
9. Select **Save and Deploy**.
10. When the build finishes, select **Continue to project**. The public URL is on that page. For the project name `rev-study`, it is [https://rev-study.pages.dev](https://rev-study.pages.dev).

To point an already deployed site at an API, open the project, go to **Settings** → **Environment variables**, set `EXPO_PUBLIC_API_URL`, then open **Deployments** and retry the latest deployment.

## Tests

```bash
npm test
```

The HTTP integration test needs a second database:

```bash
docker compose exec postgres psql -U rev -c 'CREATE DATABASE revapp_test OWNER rev'
npm run test:integration -w @rev/api
```
