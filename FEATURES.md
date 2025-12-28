# Features (Current)

## Control plane (Builder)
- Draft config editing for project, intents, forms, tools, persistence, logging, and knowledge settings.
- Publish flow: creates immutable version snapshots in Postgres.
- Admin tabs: configure flow, test bot, view threads, inspect traces, manage knowledge bases.
- Threads viewer: list thread ids and view message history.
- Traces viewer: shows stored trace payloads (input/output, tokens, tool usage).

## Data plane (Runtime)
- Stateless runtime serving only published versions.
- Chat endpoint `/runtime/chat` with thread state persisted in Postgres.
- Optional Redis cache for session state and tool/KB results.

## LLM routing + extraction
- Optional LLM-based intent routing and one-shot field extraction.
- Controlled via env: `LLM_ROUTING_ENABLED`, `LLM_EXTRACTION_ENABLED`.

## Tools (optional)
- Tool definitions include optional response caching (`cache_enabled`, `cache_ttl_seconds`).
- Optional execution gated by `TOOLS_ENABLED`.
- Tool calls are logged into trace events.

## Knowledge base
- Two provider options in config: Azure AI Search or Postgres pgvector.
- pgvector storage in Postgres with vector search via `/api/knowledge-bases/{id}/search`.
- Upload `.txt`, `.md`, or `.pdf` to auto-chunk + embed into Postgres.
- Query results can be cached in Redis.

## Storage model
- Postgres tables for drafts, versions, thread state, chat logs, audit logs, traces, and KB docs.
- Runtime never writes drafts; builder never reads published versions unless requested.

## Docker-first UX
- Single public port via Nginx (`/`, `/api/*`, `/runtime/*`).
- Compose includes Postgres + Redis + migrations + builder + runtime.
