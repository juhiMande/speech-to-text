# Speech to Text

Real-time speech-to-text web app. Speak into the mic in Hindi, English or a mix
of both, and the text appears while you talk. Save it, and it shows up in a history
panel where you can search, edit, delete and listen to it again.

**Stack:** Node.js 22, Express, `ws` (WebSockets), PostgreSQL (`pg`), Gemini Live API,
plain HTML/CSS/JavaScript on the frontend.

## How it works

```
Browser mic ──► AudioWorklet (resample to 16 kHz PCM16)
           ──► WebSocket /ws/transcribe ──► Node server ──► Gemini Live API
           ◄── partial / final text      ◄────────────────┘
Save ──► REST /api/transcriptions ──► PostgreSQL
```

- The browser captures audio with an AudioWorklet and converts it to 16 kHz, 16-bit mono PCM
  (the format Gemini Live expects), sending ~100 ms chunks over a WebSocket.
- The server forwards the audio to Gemini Live (`gemini-3.1-flash-live-preview`) with input
  transcription turned on, and sends the text back to the browser as it arrives.
  The API key stays on the server.
- When you stop, the final text can be edited and saved to PostgreSQL.
- "Listen" turns saved text back into speech (Google Translate TTS via `google-tts-api`,
  using the Hindi voice for mixed text).

## API

| Method | Path | Description |
|---|---|---|
| GET | `/api/transcriptions?q=&skip=&limit=` | List with search and paging |
| POST | `/api/transcriptions` | Create |
| GET | `/api/transcriptions/:id` | Read one |
| PUT | `/api/transcriptions/:id` | Update title / text |
| DELETE | `/api/transcriptions/:id` | Delete |
| POST | `/api/tts` | Text to speech, returns MP3 |
| WS | `/ws/transcribe` | Live transcription stream |
| GET | `/api/health` | Health check |

## Run locally

You need Node.js 20+ , a PostgreSQL database, and a free Gemini API key from
https://aistudio.google.com/apikey.

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
# edit .env: set GEMINI_API_KEY and DATABASE_URL
npm start
```

Open http://localhost:3000, allow microphone access and press the mic button.
The table is created automatically on startup.

**Getting a PostgreSQL database** (pick one):

- Docker: `docker compose up -d db` starts one matching the default `DATABASE_URL`.
- A free hosted database from [Neon](https://neon.tech): paste its connection string into `DATABASE_URL`.
- PostgreSQL installed on your machine.

Or run everything with Docker: `docker compose up --build`.

## Tests

```bash
npm test
```

Uses Node's built-in test runner with an in-memory Postgres (`pg-mem`), so no database is needed.
Covers the CRUD API and the WebSocket protocol (with a fake speech engine).

## Deploy on Render

1. Push the repo to GitHub.
2. On Render: **New → Blueprint**, pick the repo. `render.yaml` creates the web service and a PostgreSQL database.
3. Enter `GEMINI_API_KEY` when asked.
4. Open the `https://…onrender.com` URL.

Browsers only allow the microphone on HTTPS or localhost; Render provides HTTPS.
The free instance sleeps when idle, so the first request can take up to a minute.

## Notes

- If Google renames the Live model, set `GEMINI_MODEL` to the current name from AI Studio.
- `GEMINI_LANGUAGES=hi-IN,en-IN` can be used as a hint; empty means auto-detect.
- Gemini may write Hindi words in Devanagari or Roman script depending on how they were spoken.
- The language tag on saved items is a simple script check (Devanagari / Latin / both).
- No login; everyone using a deployment shares one history.

## Project layout

```
src/
  server.js                 starts HTTP + WebSocket server
  app.js                    Express app, routes, static files
  config.js  db.js          env config, Postgres pool + table setup
  transcriptionsRepo.js     SQL queries
  routes/                   transcriptions (CRUD), tts
  realtime/                 WebSocket handler, Gemini Live client
public/                     UI, mic capture, AudioWorklet resampler
test/                       API and WebSocket tests
```
