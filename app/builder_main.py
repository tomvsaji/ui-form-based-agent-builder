import csv
import json
import hashlib
import logging
import os
from io import StringIO
from typing import Dict, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

from .models import FormsConfig
from .google_oauth import (
    build_google_flow,
    build_oauth_state,
    credentials_to_token,
    parse_oauth_state,
)
from .seed import load_seed_config
from .storage import (
    get_agent_id,
    get_draft_config,
    get_tenant_id,
    get_thread_messages,
    get_oauth_credential,
    list_form_submissions,
    list_knowledge_bases,
    list_threads,
    list_traces,
    list_versions,
    publish_config,
    delete_oauth_credential,
    upsert_draft_config,
    upsert_oauth_credential,
    create_knowledge_base,
    add_kb_document,
    search_kb_documents,
    delete_knowledge_base,
    delete_kb_file,
    list_kb_files,
    list_kb_file_chunks,
)
from .cache import build_cache_key, cache_get, cache_set, get_redis
from .embeddings import embed_text
from .kb import chunk_text, read_text_from_upload

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
    _ensure_draft_config()


def _ensure_draft_config() -> None:
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
    _ensure_draft_config()
    draft = get_draft_config(tenant_id, agent_id) or {}
    if name not in draft:
        raise HTTPException(status_code=404, detail="Unknown config")
    return draft[name]


@app.put("/config/{name}")
def write_config(name: str, data: Dict):
    tenant_id = get_tenant_id()
    agent_id = get_agent_id()
    _ensure_draft_config()
    draft = get_draft_config(tenant_id, agent_id) or {}
    draft[name] = data
    upsert_draft_config(tenant_id, agent_id, draft)
    return {"status": "ok"}


@app.post("/publish")
def publish():
    tenant_id = get_tenant_id()
    agent_id = get_agent_id()
    _ensure_draft_config()
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


@app.get("/traces")
def list_trace_logs(thread_id: str | None = None):
    tenant_id = get_tenant_id()
    agent_id = get_agent_id()
    return {"traces": list_traces(tenant_id, agent_id, thread_id=thread_id)}


@app.get("/submissions")
def list_submissions(
    form_id: Optional[str] = None,
    thread_id: Optional[str] = None,
    delivery_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
):
    tenant_id = get_tenant_id()
    agent_id = get_agent_id()
    return {
        "items": list_form_submissions(
            tenant_id,
            agent_id,
            form_id=form_id,
            thread_id=thread_id,
            delivery_type=delivery_type,
            start_date=start_date,
            end_date=end_date,
            limit=limit,
            offset=offset,
        )
    }


@app.get("/submissions/export")
def export_submissions(
    form_id: Optional[str] = None,
    thread_id: Optional[str] = None,
    delivery_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    tenant_id = get_tenant_id()
    agent_id = get_agent_id()
    items = list_form_submissions(
        tenant_id,
        agent_id,
        form_id=form_id,
        thread_id=thread_id,
        delivery_type=delivery_type,
        start_date=start_date,
        end_date=end_date,
        limit=1000,
        offset=0,
    )
    output = StringIO()
    writer = csv.writer(output)
    headers = [
        "id",
        "created_at",
        "form_id",
        "form_name",
        "thread_id",
        "delivery_type",
        "delivery_status",
        "delivery_target",
        "payload",
    ]
    writer.writerow(headers)
    for item in items:
        writer.writerow(
            [
                item.get("id"),
                item.get("created_at"),
                item.get("form_id"),
                item.get("form_name"),
                item.get("thread_id"),
                item.get("delivery_type"),
                item.get("delivery_status"),
                item.get("delivery_target"),
                json.dumps(item.get("payload", {})),
            ]
        )
    output.seek(0)
    response = StreamingResponse(iter([output.getvalue()]), media_type="text/csv")
    response.headers["Content-Disposition"] = "attachment; filename=submissions.csv"
    return response


@app.get("/oauth/google/status")
def google_oauth_status():
    tenant_id = get_tenant_id()
    agent_id = get_agent_id()
    token = get_oauth_credential(tenant_id, agent_id, "google")
    return {"connected": bool(token)}


@app.get("/oauth/google/start")
def google_oauth_start():
    tenant_id = get_tenant_id()
    agent_id = get_agent_id()
    redirect_uri = os.getenv("GOOGLE_OAUTH_REDIRECT_URI")
    if not redirect_uri:
        raise HTTPException(status_code=500, detail="GOOGLE_OAUTH_REDIRECT_URI not configured")
    flow = build_google_flow(redirect_uri)
    state = build_oauth_state(tenant_id, agent_id)
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=state,
    )
    return {"auth_url": auth_url}


@app.get("/oauth/google/callback")
def google_oauth_callback(code: str, state: str):
    try:
        tenant_id, agent_id = parse_oauth_state(state)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    redirect_uri = os.getenv("GOOGLE_OAUTH_REDIRECT_URI")
    if not redirect_uri:
        raise HTTPException(status_code=500, detail="GOOGLE_OAUTH_REDIRECT_URI not configured")
    flow = build_google_flow(redirect_uri)
    flow.fetch_token(code=code)
    token = credentials_to_token(flow.credentials)
    upsert_oauth_credential(tenant_id, agent_id, "google", token)
    success_url = os.getenv("GOOGLE_OAUTH_SUCCESS_REDIRECT")
    if success_url:
        return RedirectResponse(success_url)
    return HTMLResponse("<html><body>Google Sheets connected. You can close this tab.</body></html>")


@app.post("/oauth/google/disconnect")
def google_oauth_disconnect():
    tenant_id = get_tenant_id()
    agent_id = get_agent_id()
    delete_oauth_credential(tenant_id, agent_id, "google")
    return {"status": "ok"}


@app.get("/forms")
def list_forms_from_draft():
    tenant_id = get_tenant_id()
    agent_id = get_agent_id()
    _ensure_draft_config()
    draft = get_draft_config(tenant_id, agent_id) or {}
    forms = draft.get("forms")
    if not forms:
        raise HTTPException(status_code=404, detail="Forms config not found")
    validated = FormsConfig.model_validate(forms)
    return validated.model_dump()


@app.get("/knowledge-bases")
def list_kbs():
    tenant_id = get_tenant_id()
    return {"items": list_knowledge_bases(tenant_id)}


@app.post("/knowledge-bases")
def create_kb(payload: Dict):
    tenant_id = get_tenant_id()
    name = payload.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    description = payload.get("description", "")
    provider = payload.get("provider", "pgvector")
    kb_id = create_knowledge_base(tenant_id, name, description, provider)
    return {"id": kb_id}


@app.delete("/knowledge-bases/{kb_id}")
def delete_kb(kb_id: int):
    tenant_id = get_tenant_id()
    delete_knowledge_base(tenant_id, kb_id)
    return {"status": "ok"}


@app.get("/knowledge-bases/{kb_id}/files")
def list_kb_files_endpoint(kb_id: int):
    tenant_id = get_tenant_id()
    return {"files": list_kb_files(tenant_id, kb_id)}


@app.get("/knowledge-bases/{kb_id}/files/chunks")
def list_kb_file_chunks_endpoint(kb_id: int, filename: str, limit: int = 50):
    tenant_id = get_tenant_id()
    return {"chunks": list_kb_file_chunks(tenant_id, kb_id, filename, limit=limit)}


@app.delete("/knowledge-bases/{kb_id}/files")
def delete_kb_file_endpoint(kb_id: int, filename: str):
    tenant_id = get_tenant_id()
    deleted = delete_kb_file(tenant_id, kb_id, filename)
    return {"deleted": deleted}


@app.post("/knowledge-bases/{kb_id}/documents")
def add_kb_doc(kb_id: int, payload: Dict):
    tenant_id = get_tenant_id()
    content = payload.get("content")
    if not content:
        raise HTTPException(status_code=400, detail="content is required")
    metadata = payload.get("metadata")
    try:
        embedding = embed_text(content)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    doc_id = add_kb_document(tenant_id, kb_id, content, embedding, metadata=metadata)
    return {"id": doc_id}


@app.post("/knowledge-bases/{kb_id}/upload")
async def upload_kb_doc(kb_id: int, file: UploadFile = File(...)):
    tenant_id = get_tenant_id()
    content = await file.read()
    try:
        text = read_text_from_upload(file.filename or "", content)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    chunks = chunk_text(text)
    if not chunks:
        raise HTTPException(status_code=400, detail="No content extracted from file.")
    indexed = 0
    for idx, chunk in enumerate(chunks):
        try:
            embedding = embed_text(chunk)
        except RuntimeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        add_kb_document(
            tenant_id,
            kb_id,
            chunk,
            embedding,
            metadata={"filename": file.filename, "chunk_index": idx},
        )
        indexed += 1
    return {"indexed": indexed}


@app.post("/knowledge-bases/{kb_id}/search")
def search_kb(kb_id: int, payload: Dict):
    tenant_id = get_tenant_id()
    query = payload.get("query")
    if not query:
        raise HTTPException(status_code=400, detail="query is required")
    limit = int(payload.get("limit", 5))
    cache = get_redis()
    query_hash = hashlib.sha256(query.encode("utf-8")).hexdigest()
    cache_key = build_cache_key("kb", tenant_id, "builder", 0, "public", str(kb_id), query_hash)
    if cache:
        cached = cache_get(cache, cache_key)
        if cached is not None:
            return {"results": cached, "cached": True}
    try:
        embedding = embed_text(query)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    results = search_kb_documents(tenant_id, kb_id, embedding, limit=limit)
    if cache:
        ttl = int(os.getenv("CACHE_TTL_SECONDS", "900"))
        cache_set(cache, cache_key, results, ttl)
    return {"results": results, "cached": False}
