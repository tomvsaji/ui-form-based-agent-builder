import logging
import os
import uuid
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .cache import build_cache_key, cache_get, cache_set, get_redis
from .graph import build_graph
from .models import ChatResponse, FormsConfig, ToolDefinition, ToolsConfig
from .storage import (
    get_agent_id,
    get_latest_version_payload,
    get_tenant_id,
    get_thread_state,
    get_version_config,
    log_chat,
    log_trace,
    upsert_thread_state,
)
from .tools_runtime import execute_tool

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Agent Runtime API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RuntimeMessageRequest(BaseModel):
    thread_id: str
    message: str
    version: Optional[int] = None


@app.get("/health")
def healthcheck():
    return {"status": "ok"}


@app.get("/forms")
def list_forms(version: Optional[int] = None):
    tenant_id = get_tenant_id()
    agent_id = get_agent_id()
    if version:
        config = get_version_config(tenant_id, agent_id, version)
    else:
        payload = get_latest_version_payload(tenant_id, agent_id)
        config = payload["config"] if payload else None
    if not config:
        raise HTTPException(status_code=404, detail="No published config found")
    forms = FormsConfig.model_validate(config.get("forms", {}))
    return forms.model_dump()


@app.post("/chat", response_model=ChatResponse)
def chat(req: RuntimeMessageRequest):
    if not req.thread_id:
        raise HTTPException(status_code=400, detail="thread_id is required.")
    tenant_id = get_tenant_id()
    agent_id = get_agent_id()
    if req.version:
        config = get_version_config(tenant_id, agent_id, req.version)
        version = req.version
    else:
        payload = get_latest_version_payload(tenant_id, agent_id)
        if not payload:
            raise HTTPException(status_code=404, detail="No published config found")
        config = payload["config"]
        version = payload["version"]
    if not config:
        raise HTTPException(status_code=404, detail="No published config found")

    forms_config = FormsConfig.model_validate(config.get("forms", {}))
    tools_config = ToolsConfig.model_validate(config.get("tools", {"tools": []}))
    graph_app, _ = build_graph(forms_config, tools_config)

    redis_client = get_redis()
    cache_key = build_cache_key(
        "session",
        tenant_id,
        agent_id,
        version,
        "public",
        req.thread_id,
    )
    cached_state = cache_get(redis_client, cache_key) if redis_client else None
    previous_state = cached_state or get_thread_state(tenant_id, agent_id, version, req.thread_id) or {}
    state_input: Dict[str, Any] = {**previous_state, "thread_id": req.thread_id, "last_user_message": req.message}

    result = graph_app.invoke(state_input, config={"configurable": {"thread_id": req.thread_id}})
    reply = result.get("reply", "I was not able to generate a response.")

    if (
        os.getenv("TOOLS_ENABLED", "false").lower() == "true"
        and result.get("completed")
        and not result.get("tool_executed")
    ):
        form = forms_config.form_by_id(result.get("current_form_id", ""))
        tool_to_call = None
        if form and form.submission and form.submission.type == "tool" and form.submission.tool_name:
            tool_to_call = next((t for t in tools_config.tools if t.name == form.submission.tool_name), None)
        elif form and form.submission and form.submission.type == "api" and form.submission.url:
            tool_to_call = ToolDefinition(
                name="form_submission",
                description="Form submission",
                http_method=form.submission.http_method or "POST",
                url=form.submission.url,
                headers=form.submission.headers or {},
                role="submit-form",
            )
        else:
            tool_to_call = next((t for t in tools_config.tools if t.role == "submit-form"), None)

        if tool_to_call:
            tool_payload = result.get("form_values", {})
            tool_result = execute_tool(tool_to_call, tool_payload, tenant_id, agent_id, version)
            result["tool_executed"] = True
            result["tool_name"] = tool_to_call.name
            result["tool_response"] = tool_result
            result.setdefault("trace_events", []).append({"stage": "tool_call", "tool": tool_to_call.name, "result": tool_result})

    upsert_thread_state(tenant_id, agent_id, version, req.thread_id, result)
    if redis_client:
        ttl = int(os.getenv("CACHE_TTL_SECONDS", "900"))
        cache_set(redis_client, cache_key, result, ttl)
    log_chat(tenant_id, agent_id, version, req.thread_id, "user", req.message)
    log_chat(tenant_id, agent_id, version, req.thread_id, "assistant", reply, state=result)
    trace_id = str(uuid.uuid4())
    log_trace(
        tenant_id,
        agent_id,
        version,
        req.thread_id,
        trace_id,
        {
            "input": req.message,
            "output": reply,
            "tokens": result.get("llm_usage", {}),
            "tools": result.get("tool_response"),
            "events": result.get("trace_events", []),
        },
    )
    logger.info("Processed message for thread %s", req.thread_id)
    return ChatResponse(reply=reply, state=result)
