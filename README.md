# Agent Builder Prototype

Prototype scaffolding for intent-routed, form-driven conversational flows using FastAPI + LangGraph. The generated API exposes `/docs` as the main surface for trying the agent and inspecting schemas.

## Structure
- `config/*.json`: Authoring outputs from the UI (project, forms, tools, persistence, logging, knowledge base).
- `app/main.py`: FastAPI entrypoint with `/chat`, `/forms`, `/health`, `/docs`.
- `app/graph.py`: LangGraph that routes intents, runs step-by-step or one-shot form capture, validates, and maintains thread state.
- `app/models.py`: Pydantic models for configs and runtime state (including knowledge base + semantic cache settings).
- `Dockerfile`, `docker-entrypoint.sh`: Runs backend + frontend in a single container. `azure-deploy.sh` remains for App Service flows.

## Run locally
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
# Open http://localhost:8000/docs
```

### Frontend authoring UI (Next.js)
```bash
cd frontend
npm install
npm run dev
# Open http://localhost:3000 (set NEXT_PUBLIC_API_BASE if backend is remote)
```
Features: structured editors for project, intents, forms (with field ordering buttons), tools, knowledge base (Azure AI Search with optional agentic retrieval), persistence (Cosmos DB + optional semantic caching via Azure Cache for Redis), and logging. Save all → writes `config/*.json`. “Generate backend” reloads the FastAPI graph from configs; “Trigger CI” is a stub hook you can swap for a real pipeline call.

### Chat tester
Navigate to `/chat` in the frontend to try the `/chat` API directly. It lists configured forms and lets you send messages tied to a thread id to validate routing and field capture.

## Deploy
- **All-in-one container (frontend + backend):**
  ```bash
  docker build -t agent-builder-allinone .
  docker run -p 8000:8000 -p 3000:3000 agent-builder-allinone
  # Backend: http://localhost:8000, Frontend: http://localhost:3000
  ```
- **Azure App Service script:**
  ```bash
  export RESOURCE_GROUP=your-rg APP_NAME=your-app REGION=eastus
  ./azure-deploy.sh
  ```
  Push the repo to the deployment Git remote the script prints if you prefer App Service hosting for the backend only.
