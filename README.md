# Agent Platform (Builder + Runtime)

Self-hostable transactional AI platform with a builder control plane and a stateless runtime data plane. Docker Compose is the default install path.

## Architecture
- **Builder (control plane)**
  - `builder-frontend` (Next.js)
  - `builder-backend` (FastAPI)
  - Draft config editing + publish to immutable versions
  - Logs viewer endpoints
- **Runtime (data plane)**
  - `runtime-api` (FastAPI)
  - Stateless execution of published versions only

**Single public port** via Nginx:
- `/` → builder UI
- `/api/*` → builder backend
- `/runtime/*` → runtime API

## Quickstart (OSS)
```bash
git clone <repo>
cd agent-builder
cp .env.example .env
docker compose up --build
```
Open `http://localhost:8080`.

## Dev mode (hot reload)
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

## Publish flow
- Builder writes **draft** config in Postgres.
- `POST /api/publish` creates an immutable **version snapshot**.
- Runtime reads **only published versions**.

## Runtime export (future)
The published config is stored as a snapshot and can be packaged with a FastAPI runtime for export.

## Core endpoints
Builder:
- `GET /api/health`
- `GET /api/config/{name}` / `PUT /api/config/{name}`
- `POST /api/publish`
- `GET /api/versions`
- `GET /api/versions/{version}`
- `GET /api/threads`
- `GET /api/threads/{thread_id}/messages`
- `GET /api/traces`
- `GET /api/knowledge-bases`
- `POST /api/knowledge-bases`
- `POST /api/knowledge-bases/{kb_id}/documents`
- `POST /api/knowledge-bases/{kb_id}/upload`
- `POST /api/knowledge-bases/{kb_id}/search`

Runtime:
- `GET /runtime/health`
- `GET /runtime/forms`
- `POST /runtime/chat`

## Notes
- Postgres is required. Redis is available for caching and session state in future iterations.
- Knowledge base indexing uses OpenAI or Azure OpenAI embeddings. Set `OPENAI_API_KEY` or Azure env vars in `.env`.
- Knowledge base upload supports `.txt`, `.md`, and `.pdf` files.
- LLM routing/extraction uses OpenAI or Azure OpenAI and can be controlled via `LLM_ROUTING_ENABLED` and `LLM_EXTRACTION_ENABLED`.
- Tool execution is optional and gated by `TOOLS_ENABLED`.
- All services are Docker-first and cloud-agnostic.

## Docs
- `FEATURES.md` — implemented feature overview\n- `ARCHITECTURE.md` — end-to-end flow + file map
