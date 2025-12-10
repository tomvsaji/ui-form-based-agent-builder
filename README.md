# Agent Builder Prototype

Prototype scaffolding for intent-routed, form-driven conversational flows using FastAPI + LangGraph. The generated API exposes `/docs` as the main surface for trying the agent and inspecting schemas.

## Structure
- `config/*.json`: Authoring outputs from the UI (project, forms, tools, persistence, logging).
- `app/main.py`: FastAPI entrypoint with `/chat`, `/forms`, `/health`, `/docs`.
- `app/graph.py`: LangGraph that routes intents, runs step-by-step or one-shot form capture, validates, and maintains thread state.
- `app/models.py`: Pydantic models for configs and runtime state.
- `Dockerfile`, `requirements.txt`, `azure-deploy.sh`: Prototype deployment assets for Azure App Service.

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
Features: structured editors for project, intents, forms (with field ordering buttons), tools, persistence, and logging. Save all → writes `config/*.json`. “Generate backend” reloads the FastAPI graph from configs; “Trigger CI” is a stub hook you can swap for a real pipeline call.

## Deploy
```bash
export RESOURCE_GROUP=your-rg APP_NAME=your-app REGION=eastus
./azure-deploy.sh
```
Push the repo to the deployment Git remote the script prints, or containerize with the provided Dockerfile.
