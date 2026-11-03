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
- `LLM_API_KEY`. The study call posts to OpenRouter (`https://openrouter.ai/api/v1/chat/completions`) with that key as `Authorization: Bearer`, and the model `google/gemma-4-31b-it:free`. It does not call `generativelanguage.googleapis.com`. Free tiers are rate-limited and may retain prompts.
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

## Streamlit

The Expo app stays the main client. `apps/streamlit/app.py` is a separate client: register or log in, then use two buttons. 上傳 pastes text or uploads a PDF or image, picks a subject and tags, and shows that note's revision cards and a Quiz button. 開啟卡片 opens a saved note. It calls the existing study command (`apps/api/src/study-cli.ts`). That command posts to `https://openrouter.ai/api/v1/chat/completions` with `LLM_API_KEY` as a Bearer token and model `google/gemma-4-31b-it:free`, and saves the note in Neon (`DATABASE_URL`). It does not upload the file to R2. Scanned PDFs are still rejected. A short Traditional Chinese how-to on the page says: upload PDF, image, or text, then revision cards, then Quiz.

Each account is an email or username plus a password. The password is stored hashed on the user row. A person only sees notes, subjects, and tags saved on that account. After a note exists, paste a passage from its source to add one revision card built from that quote only. Quiz answers are saved in Neon as a correct and missed count on each card for that user. The next quiz on the note starts with the cards that user misses most often.

The study model is `google/gemma-4-31b-it:free`. The request is one user message: no system role, `response_format`, `max_tokens`, or `temperature`. Zod still checks the reply, and a bad reply is retried once. A Minna no Nihongo style vocab sheet is read as rows of kana, kanji, and a gloss, and those cards are built locally with no model call. A row with both kana and kanji becomes a card whose question is the kanji and whose answer is the kana. Title lines and rows with no kanji are skipped. Any other PDF is read as paragraphs from the text layer, not as those columns, and that text is sent to Gemma for a summary, key points, and Q&A cards. If that model is still upstream rate-limited after the retries, those paragraphs become the cards instead. A model that leaves `content` empty and puts the reply in `reasoning` is read from that field. If both are empty, the call is retried once. The note then uses paragraph cards, or one card per paired line when every line splits into a term and a meaning. Zod still checks a non-empty reply. The cards are saved the same way as model cards. A provider failure other than that limit shows the upstream error text. A configured Google Generative Language URL is sent to OpenRouter instead. Scanned PDFs with no text layer are still rejected.

Image OCR uses Tesseract in this process for English, Simplified Chinese, and Japanese when `eng`, `chi_sim`, and `jpn` are installed. The repo root `packages.txt` asks Streamlit Community Cloud to apt-install those packs. If any of them is missing, the page sends the image to the existing API extractor instead.

Python dependencies are `apps/streamlit/requirements.txt`. Apply the login migration, then open the page:

```bash
npm run db:migrate -w @rev/api
streamlit run apps/streamlit/app.py
```

The study command reads `apps/api/.env` for `DATABASE_URL` and the OpenRouter settings. Do not commit that file.

### Streamlit Community Cloud

Do not buy a domain. Leave the app URL blank so Community Cloud assigns a free `streamlit.app` address.

1. Open [share.streamlit.io](https://share.streamlit.io) and sign in with GitHub.
2. In the upper-right corner, click **Create app**.
3. When asked “Do you already have an app?”, click **Yup, I have an app**.
4. Set the repository to `ppppanal/RevApp`, the branch to `cursor/pdf-ocr-quiz-3e25`, and the main file path to `apps/streamlit/app.py`.
5. Leave **App URL** / **Custom subdomain (optional)** blank.
6. Click **Advanced settings**. Choose Python **3.12**. In **Secrets**, paste:

```toml
DATABASE_URL = "postgresql://USER:PASSWORD@HOST/neondb?sslmode=require&pgbouncer=true"
LLM_PROVIDER = "openai"
LLM_BASE_URL = "https://openrouter.ai/api/v1"
LLM_API_KEY = "your-openrouter-key"
LLM_MODEL = "google/gemma-4-31b-it:free"
LLM_JSON_MODE = "object"
# Optional. Only this signed-in account sees the Streamlit controls on the right.
# ADMIN_LOGIN = "your-admin-username"
```

The Deploy button and the header menu on the right are hidden for every viewer. Set `ADMIN_LOGIN` to an account's email or username when that account should see them.

Run `npm run db:migrate -w @rev/api` against that database before the first registration. Accounts are created on the page.

7. Click **Save**, then click **Deploy**.

The first launch downloads Node 22 when the machine does not already have Node 20 or newer, then installs the API workspace so the page can run the existing study command. Put the real Neon URL and OpenRouter key only in that Secrets box.

## Tests

```bash
npm test
```

The HTTP integration test needs `REV_TEST_DATABASE_URL` pointing at a second Postgres database (another Neon database is fine). The test runs Prisma migrations against that URL.

```bash
REV_TEST_DATABASE_URL=postgresql://USER:PASSWORD@HOST/revapp_test?sslmode=require npm run test:integration -w @rev/api
```
