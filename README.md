# CreatorAI — Multimodal AI Content Studio

CreatorAI is a unified multimodal content engine for creators, educators, and teams. Upload videos, audio recordings, images, presentations, and documents; CreatorAI normalizes them into searchable, citable segments and generates platform-ready content grounded directly in your sources.

---

## ⚡ Highlights

- **Multimodal Ingestion**: Supports `.mp4`, `.mov`, `.mp3`, `.wav`, `.png`, `.jpg`, `.pdf`, `.docx`, `.pptx`, and `.txt`.
- **Intelligent Segmentation & OCR**: Extracts audio transcripts, video keyframes, text OCR via Tesseract, and PDF/document pages into indexed content segments.
- **Semantic Retrieval**: Uses pgvector cosine similarity search (with in-Python fallback for SQLite or lexical hashing in demo mode).
- **Grounded AI Generation**: Summaries, social posts (X, LinkedIn, Instagram, TikTok, YouTube), show notes, newsletter blurbs, and chat with citation attribution.
- **Demo Mode Out-of-the-Box**: Runs completely offline if no Gemini API key is provided, generating extractive responses and badging results clearly.
- **Modern Responsive UI**: Built with React 18, Vite, TypeScript, Tailwind CSS, Lucide icons, Recharts, and TanStack Query.

---

## 🛠 Tech Stack

- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2, PyJWT, OpenCV, FFmpeg, PyMuPDF, python-docx, python-pptx, PyTesseract
- **Database**: PostgreSQL 16 + `pgvector` (or SQLite for testing/standalone)
- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, TanStack Query v5, React Router v6, Sonner, Recharts

---

## 🚀 Quick Start

### 1. Database Setup (Postgres + pgvector)

If running Docker:
```bash
docker compose up -d
```

Or ensure local PostgreSQL has `vector` extension:
```sql
CREATE DATABASE creatorai;
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2. Backend Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run migrations
alembic upgrade head

# Start API server
uvicorn app.main:app --reload --port 8000
```

Backend endpoints:
- API: `http://localhost:8000`
- Interactive OpenAPI Docs: `http://localhost:8000/docs`

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on: `http://localhost:5173`

---

## 🧪 Testing

To run the complete test suite (all 66 offline tests):

```bash
cd backend
source .venv/bin/activate
pytest tests/
```

To typecheck the frontend:
```bash
cd frontend
npx tsc --noEmit
```

To build production frontend:
```bash
cd frontend
npm run build
```

---

## 🏃 Run Both with Dev Script

```bash
./scripts/dev.sh
```