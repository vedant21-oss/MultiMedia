# CreatorAI — Your All-in-One Multimodal Content Studio

> **Upload once. Understand everything. Create content everywhere.**

Built by **Dev Crew** for the Multimodal AI hackathon.

## Problem

Creators, educators and marketing teams keep their raw material in many formats:
a lecture video, its slide deck, a podcast recording, whiteboard photos, a PDF
brief. Today's tools handle each format on its own. Turning that pile into
platform-ready posts means hours of re-watching, transcribing and cross-referencing.
AI writers that skip the material make up facts nobody can check.

## Solution

CreatorAI ingests **video, audio, images, PDFs, DOCX, PPTX, text and subtitles**. It
normalises every format into one index of *segments*, each carrying provenance
(timestamp, page, slide, frame). Content is then generated from that index, and
every claim cites where it came from.

- **Cross-modal fusion.** One question is answered from a video, a PDF and a photo
  together, with `[1] [2] [3]` citations that jump to a timestamp or page.
- **Grounded chat (RAG).** pgvector semantic search over all modalities. When the
  sources don't cover something, it answers "not in your sources" instead of
  guessing.
- **Content studio.** Twenty content types (captions, YouTube titles and
  descriptions, scripts, blogs, LinkedIn/X/TikTok posts, quizzes, flashcards, show
  notes…) with tone, audience, language, brand voice and multiple variations. Every
  output is editable and versioned, with restore.
- **Video studio.** Scene detection (OpenCV), highlight suggestions, frame-accurate
  clipping, 16:9 / 9:16 / 1:1 / 4:5 reframing, SRT/VTT export and subtitle burn-in
  (FFmpeg).
- **Thumbnail studio.** AI concepts composited onto real video frames.
- **Library, planner and analytics.** Unified search, a monthly calendar, and
  production charts.
- **Honest by design.** Without an AI key the app runs in a clearly **badged demo
  mode**. Extraction, OCR, scene detection, clipping and search still work for real.
  It never claims a post was published or that a clip will go viral.

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + TypeScript, Vite, Tailwind, TanStack Query, React Router, React Hook Form + Zod, Recharts, custom canvas 3D |
| Backend | FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, JWT access + refresh, bcrypt |
| Database | PostgreSQL + **pgvector**, either local or **Supabase** ([guide](docs/SUPABASE.md)) |
| AI | Google Gemini 2.5 Flash (multimodal understanding, generation), `gemini-embedding-001` |
| Media | FFmpeg, OpenCV, PyMuPDF, python-docx, python-pptx, Tesseract OCR, Pillow |

The AI key lives **only** in `backend/.env`. The browser never sees it.

## Run it locally

**Prerequisites:** Python 3.12, Node 20+, PostgreSQL 16/17 with pgvector (or a
Supabase project), FFmpeg, Tesseract. On macOS:

```bash
brew install python@3.12 postgresql@17 pgvector ffmpeg tesseract
```

**Backend** (port 8000):

```bash
cd backend
python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp ../.env.example .env          # set DATABASE_URL, JWT_SECRET, GEMINI_API_KEY
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload --port 8000
```

API docs: <http://localhost:8000/docs>

**Frontend** (port 5173):

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>.

> ⚠️ If your shell exports `GEMINI_API_KEY`, it **overrides** `backend/.env`. The
> app detects placeholder values like `YOUR_API_KEY` and falls back to demo mode
> instead of failing every call.

## Tests

```bash
cd backend && .venv/bin/python -m pytest -q      # 66 tests
cd frontend && npx tsc --noEmit && npm run build
```

The tests cover auth, token refresh, validation, cross-user isolation (another
user's data always returns 404), path traversal, upload dedup, range streaming, the
full ingest-to-search pipeline, demo-mode honesty, malformed model JSON and
prompt-injection guards.

## Demo flow (first milestone)

1. Register, then create a project.
2. Upload a **video and a PDF**. You can watch them process live.
3. **Create Content** → Instagram post → Generate. Each variation cites its source
   segments.
4. **AI Chat** → "Summarise everything". The answer cites both files.
5. **Video Studio** → Suggest clips → export a 9:16 clip.
6. **Dashboard / Analytics** show the output.

## Status

| Works now | Needs a key | Not built yet |
|---|---|---|
| Auth, projects, uploads, extraction, OCR, scenes, clipping, subtitles export, lexical search, extractive demo generation, library, planner, analytics | Transcription, vision descriptions, AI generation, semantic embeddings (`GEMINI_API_KEY`) | Direct social publishing (needs OAuth apps), image generation provider, Supabase Storage for media files |
