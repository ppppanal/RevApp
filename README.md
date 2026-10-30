# Rev

Turn notes, PDFs, and photos into a summary, key points, and flashcards.

Paste text, upload a PDF that has a text layer, or upload a photo of printed text. The API extracts the text, then an LLM returns a summary, key points, and flashcards. In the app, flip and edit cards, or take a quiz scored against the saved answers.

Notes belong to a local dev user (`DEV_USER_EMAIL`) until accounts have a login. PDF and image bytes travel as base64 on the same note endpoint as plain text, and the original files are stored in Cloudflare R2. Extraction stays behind one text-extraction interface. Image OCR uses Tesseract locally (English trained data shipped with the API). It does not call a paid OCR service. The database is Neon Postgres through Prisma.

Limits:

- Files up to 6 MB, and at most 50 PDF pages.
- Extracted text is capped at 20,000 characters.
- Scanned PDFs with no text layer are rejected. OCR is for images, not for PDF pages.
- Password-protected PDFs are rejected.
- OCR is English only. Handwriting and blurry photos often return no text.

## Run locally

Requirements: Node.js 20+, a Neon Postgres database, and a Cloudflare R2 bucket for PDF and image uploads.

```bash
cp .env.example apps/api/.env
```

In `apps/api/.env`, set:

- `DATABASE_URL` to the Neon pooled connection string (`sslmode=require` and `pgbouncer=true`).
- `DIRECT_URL` to the Neon direct connection string (`sslmode=require`). Prisma uses it for migrations.
- `LLM_API_KEY`. The default provider is Gemini’s free tier through its OpenAI-compatible endpoint (`LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`). Free tiers are rate-limited and may retain prompts.
- `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET` before uploading a PDF or photo. Text notes still work if those four are blank.

```bash
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

Create a note from text:

```bash
curl -s -X POST http://localhost:3000/notes \
  -H 'content-type: application/json' \
  -d '{"text":"Mitochondria produce ATP. ATP is the energy currency of the cell."}'
```

Or from a PDF:

```bash
curl -s -X POST http://localhost:3000/notes \
  -H 'content-type: application/json' \
  -d "{\"source\":{\"kind\":\"pdf\",\"filename\":\"notes.pdf\",\"data\":\"$(base64 notes.pdf | tr -d '\n')\"}}"
```

Set `LLM_PROVIDER=fake` in `apps/api/.env` to exercise the app without calling a model.

## Tests

```bash
npm test
```

The HTTP integration test needs `REV_TEST_DATABASE_URL` pointing at a second Postgres database (another Neon database is fine). Prisma migrations also read `DIRECT_URL`; for that test database, set `DIRECT_URL` to the same URL when you are not using a pooler.

```bash
REV_TEST_DATABASE_URL=postgresql://USER:PASSWORD@HOST/revapp_test?sslmode=require npm run test:integration -w @rev/api
```
