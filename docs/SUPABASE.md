# Running CreatorAI on Supabase

Supabase is hosted PostgreSQL. CreatorAI already uses PostgreSQL with `pgvector`,
SQLAlchemy and Alembic, so **switching to Supabase is a one-line change**: point
`DATABASE_URL` at it. You don't change any code.

## Why Supabase fits

| CreatorAI needs | Supabase gives |
|---|---|
| PostgreSQL 15+ | ✅ Managed Postgres |
| `pgvector` for semantic search | ✅ Built in. Our migration runs `CREATE EXTENSION IF NOT EXISTS vector` |
| Persistent data across deploys | ✅ Unlike Render's free disk, which is wiped on restart |
| Free tier | ✅ 500 MB database, enough for a hackathon demo |

## Setup (about 5 minutes)

1. Create a project at [supabase.com](https://supabase.com). Choose the region
   closest to your backend (e.g. Mumbai `ap-south-1`). **Save the database password.**
2. Optional: **Database → Extensions → enable `vector`**. The migration does this
   anyway.
3. **Connect** (top bar) → **Session pooler** → copy the URI. It looks like:

   ```
   postgresql://postgres.<project-ref>:<PASSWORD>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
   ```

4. In `backend/.env`:

   ```ini
   DATABASE_URL=postgresql://postgres.<project-ref>:<PASSWORD>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require
   ```

5. Create the tables:

   ```bash
   cd backend
   .venv/bin/alembic upgrade head
   ```

6. Start the API. `GET /api/health` should report `"database": "connected"`.

## Gotchas that bite on demo day

- **Use the Session pooler URL, not "Direct connection".** On the free tier, the
  direct host is IPv6-only. Render and most free hosts can't reach IPv6, so you'd
  get `could not translate host name` or a timeout.
- **The pooler username is `postgres.<project-ref>`**, not just `postgres`.
- **Password with `@`, `#`, `/` or `%`?** URL-encode it (`@` → `%40`), or reset the
  password to something alphanumeric.
- **Use port `5432` (session mode) for migrations.** Port `6543` is transaction
  mode, which is fine for the app but not for Alembic.
- `postgres://…` and `postgresql://…` URLs are both accepted. The backend rewrites
  them to the `postgresql+psycopg2://` dialect automatically.

## What stays outside Supabase

Uploaded media files are stored on the backend's disk (`backend/storage_data`),
behind a storage abstraction in `app/storage/`. Supabase **Storage** could be added
as another backend implementing the same interface. That isn't built yet, so on a
host with an ephemeral disk (such as Render's free tier), re-upload demo files after
a restart. Accounts, segments, embeddings and generated content all live in Supabase
and survive restarts.
