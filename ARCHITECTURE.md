# End-to-End Architecture

This document explains how the system works end to end and what the major files do.

## System flow (end to end)

1) **Builder loads draft config**
- The builder backend reads draft config from Postgres (or seeds it from `config/*.json` if missing).
- The builder UI edits drafts and saves them to Postgres.

2) **Publish**
- Clicking “Publish version” creates an immutable snapshot in `agent_versions`.
- The runtime reads **only** published versions.

3) **Runtime chat**
- Runtime receives `/runtime/chat` with a thread id + user message.
- Loads the latest published version config.
- Runs LangGraph to route intent + collect fields.
- Stores thread state and logs chat + traces.

4) **Tools (optional)**
- If `TOOLS_ENABLED=true`, a submit tool is called after form completion.
- Tool calls can be cached in Redis per tool settings.

5) **Knowledge base (optional)**
- KBs can be created in the builder.
- Upload `.txt`, `.md`, or `.pdf` → chunk → embed → store in pgvector.
- Search uses vector similarity with optional Redis caching.

## Service topology

- **builder-frontend** (Next.js UI)
- **builder-backend** (FastAPI) → drafts, publish, threads, traces, KB
- **runtime-api** (FastAPI) → chat runtime, stateless
- **postgres** (pgvector) → configs, logs, KB documents
- **redis** → cache (optional)
- **nginx** → single public port `:8080`

Routes:
- `/` → builder UI
- `/api/*` → builder backend
- `/runtime/*` → runtime API

## Data model (Postgres)

- `agent_drafts`: draft config JSON
- `agent_versions`: published snapshots
- `thread_states`: runtime state per thread
- `chat_logs`: user/assistant messages
- `trace_logs`: trace payloads (tokens/tools)
- `knowledge_bases`: KB metadata
- `knowledge_documents`: KB chunks + embeddings
- `audit_logs`: publish actions

## Key files (what they do)

### Backend
- `app/builder_main.py` — Builder API: config read/write, publish, threads, traces, KB operations.
- `app/runtime_main.py` — Runtime API: chat, stateless execution, tool calls, trace logging.
- `app/graph.py` — LangGraph workflow for routing + form capture.
- `app/llm.py` — LLM routing + extraction via OpenAI.
- `app/tools_runtime.py` — HTTP tool execution + optional Redis caching.
- `app/embeddings.py` — OpenAI embeddings for KB indexing/search.
- `app/kb.py` — Text/PDF ingestion + chunking.
- `app/storage.py` — Postgres persistence helpers.
- `app/db.py` — SQLAlchemy engine/session.
- `app/db_models.py` — SQLAlchemy models for all tables.
- `app/models.py` — Pydantic models for configs + runtime state.
- `app/cache.py` — Redis helpers + cache key format.

### Migrations
- `alembic.ini` — Alembic configuration.
- `migrations/env.py` — Migration environment setup.
- `migrations/versions/0001_init.py` — Initial tables (drafts, versions, logs, state).
- `migrations/versions/0002_kb_traces.py` — KB + traces + pgvector extension.

### Frontend
- `frontend/app/page.tsx` — Builder admin UI (tabs, editor, threads, traces, KB).
- `frontend/app/chat/page.tsx` — Chat tester (runtime).
- `frontend/app/layout.tsx` — Layout + global styles.
- `frontend/app/globals.css` — Styling and utility classes.

### Docker / Ops
- `docker-compose.yml` — Production-like stack (nginx, builder, runtime, postgres, redis).
- `docker-compose.dev.yml` — Dev overrides (hot reload).
- `Dockerfile.backend` — Backend image.
- `Dockerfile.frontend` — Frontend production image.
- `frontend/Dockerfile.frontend.dev` — Frontend dev image.
- `nginx/nginx.conf` — Reverse proxy routing.
- `.env.example` — Required env vars.

## Required environment variables

- `POSTGRES_DSN` — Postgres connection string.
- `OPENAI_API_KEY` — Required for LLM routing/extraction + KB embeddings.
- Optional flags:
  - `LLM_ROUTING_ENABLED`
  - `LLM_EXTRACTION_ENABLED`
  - `TOOLS_ENABLED`
  - `CACHE_TTL_SECONDS`

## Quick test path

1) Start stack: `docker compose up --build`
2) Open `http://localhost:8080`
3) Edit forms/intents → Publish
4) Open `/chat` and send a message
5) View threads/traces in admin tabs
