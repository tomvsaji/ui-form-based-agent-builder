import logging
from typing import Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .models import FormsConfig
from .seed import load_seed_config
from .storage import (
    get_agent_id,
    get_draft_config,
    get_tenant_id,
    get_thread_messages,
    list_threads,
    list_versions,
    publish_config,
    upsert_draft_config,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Agent Builder API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def ensure_seed_config() -> None:
    tenant_id = get_tenant_id()
    agent_id = get_agent_id()
    existing = get_draft_config(tenant_id, agent_id)
    if existing:
        return
    seed = load_seed_config()
    upsert_draft_config(tenant_id, agent_id, seed)
    logger.info("Seeded draft config for agent %s", agent_id)


@app.get("/health")
def healthcheck():
    return {"status": "ok"}


@app.get("/config/{name}")
def read_config(name: str):
    tenant_id = get_tenant_id()
    agent_id = get_agent_id()
    draft = get_draft_config(tenant_id, agent_id) or {}
    if name not in draft:
        raise HTTPException(status_code=404, detail="Unknown config")
    return draft[name]


@app.put("/config/{name}")
def write_config(name: str, data: Dict):
    tenant_id = get_tenant_id()
    agent_id = get_agent_id()
    draft = get_draft_config(tenant_id, agent_id) or {}
    draft[name] = data
    upsert_draft_config(tenant_id, agent_id, draft)
    return {"status": "ok"}


@app.post("/publish")
def publish():
    tenant_id = get_tenant_id()
    agent_id = get_agent_id()
    draft = get_draft_config(tenant_id, agent_id)
    if not draft:
        raise HTTPException(status_code=400, detail="No draft config to publish")
    version = publish_config(tenant_id, agent_id, draft)
    return {"status": "ok", "version": version}


@app.get("/versions")
def list_published_versions():
    tenant_id = get_tenant_id()
    agent_id = get_agent_id()
    return {"versions": list_versions(tenant_id, agent_id)}


@app.get("/versions/{version}")
def get_published_version(version: int):
    tenant_id = get_tenant_id()
    agent_id = get_agent_id()
    if version <= 0:
        raise HTTPException(status_code=400, detail="Invalid version")
    from .storage import get_version_config

    published = get_version_config(tenant_id, agent_id, version)
    if not published:
        raise HTTPException(status_code=404, detail="Version not found")
    return published


@app.get("/threads")
def list_chat_threads():
    tenant_id = get_tenant_id()
    agent_id = get_agent_id()
    return {"threads": list_threads(tenant_id, agent_id)}


@app.get("/threads/{thread_id}/messages")
def list_chat_messages(thread_id: str):
    tenant_id = get_tenant_id()
    agent_id = get_agent_id()
    return {"thread_id": thread_id, "messages": get_thread_messages(tenant_id, agent_id, thread_id)}


@app.get("/forms")
def list_forms_from_draft():
    tenant_id = get_tenant_id()
    agent_id = get_agent_id()
    draft = get_draft_config(tenant_id, agent_id) or {}
    forms = draft.get("forms")
    if not forms:
        raise HTTPException(status_code=404, detail="Forms config not found")
    validated = FormsConfig.model_validate(forms)
    return validated.model_dump()
