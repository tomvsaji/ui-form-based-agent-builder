import logging
import os
import uuid
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .cache import build_cache_key, cache_get, cache_set, get_redis
from .graph import build_graph
from .models import ChatResponse, FormsConfig, KnowledgeBaseConfig, ToolCallConfig, ToolDefinition, ToolsConfig
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
    knowledge_config = KnowledgeBaseConfig.model_validate(config.get("knowledge", {}))
    graph_app, _ = build_graph(forms_config, tools_config, knowledge_config)

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
    form = forms_config.form_by_id(result.get("current_form_id", "")) if result.get("current_form_id") else None
    if form:
        _maybe_run_tool_hook(previous_state, result, form, tools_config, tenant_id, agent_id, version)
        _maybe_fetch_dropdown_options(result, form, tools_config, tenant_id, agent_id, version)
    reply = result.get("reply")
    if not reply:
        messages = result.get("messages", [])
        last_assistant = next((m.get("content") for m in reversed(messages) if m.get("role") == "assistant"), None)
        reply = last_assistant or "I was not able to generate a response."

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
            "state": {
                "current_intent": result.get("current_intent"),
                "current_form_id": result.get("current_form_id"),
                "current_step_index": result.get("current_step_index"),
                "awaiting_field": result.get("awaiting_field"),
                "form_values": result.get("form_values"),
                "completed": result.get("completed"),
            },
        },
    )
    logger.info("Processed message for thread %s", req.thread_id)
    return ChatResponse(reply=reply, state=result)


def _resolve_input_map(input_map: Dict[str, str], form_values: Dict[str, Any]) -> Dict[str, Any]:
    resolved: Dict[str, Any] = {}
    for key, source in input_map.items():
        if source.startswith("form."):
            field_name = source.replace("form.", "", 1)
            resolved[key] = form_values.get(field_name)
        elif source.startswith("const:"):
            resolved[key] = source.replace("const:", "", 1)
        else:
            resolved[key] = source
    return resolved


def _extract_path(data: Any, path: Optional[str]) -> Any:
    if not path:
        return data
    current = data
    for part in path.split("."):
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return None
    return current


def _apply_output_map(output_map: Dict[str, str], tool_body: Any, form_values: Dict[str, Any]) -> None:
    for field_name, path in output_map.items():
        value = _extract_path(tool_body, path)
        if value is not None:
            form_values[field_name] = value


def _find_tool(tools_config: ToolsConfig, name: str) -> Optional[ToolDefinition]:
    return next((t for t in tools_config.tools if t.name == name), None)


def _extract_tool_body(tool_result: Dict[str, Any]) -> Any:
    if "response" in tool_result:
        response = tool_result.get("response", {})
        return response.get("body", response)
    return tool_result


def _normalize_options(raw_options: Any) -> List[str]:
    if raw_options is None:
        return []
    if isinstance(raw_options, list):
        normalized: List[str] = []
        for item in raw_options:
            if isinstance(item, str):
                normalized.append(item)
            elif isinstance(item, dict):
                for key in ("label", "name", "value"):
                    if key in item and item[key] is not None:
                        normalized.append(str(item[key]))
                        break
                else:
                    normalized.append(str(item))
            else:
                normalized.append(str(item))
        return [opt for opt in normalized if opt]
    if isinstance(raw_options, dict):
        for key in ("options", "items", "data"):
            if key in raw_options:
                return _normalize_options(raw_options[key])
    return []


def _maybe_fetch_dropdown_options(
    state: Dict[str, Any],
    form,
    tools_config: ToolsConfig,
    tenant_id: str,
    agent_id: str,
    version: int,
) -> None:
    if not state.get("awaiting_field") or form.mode != "step-by-step":
        return
    idx = state.get("current_step_index", 0)
    if idx >= len(form.field_order):
        return
    field_name = form.field_order[idx]
    field = form.field_by_name(field_name)
    if not field or field.type not in {"dropdown", "enum"}:
        return

    existing = state.get("field_options", {}).get(field_name)
    if existing:
        return

    tool_cfg: Optional[ToolCallConfig] = None
    if field.dropdown_tool_config:
        tool_cfg = field.dropdown_tool_config
    elif field.dropdown_tool:
        tool_cfg = ToolCallConfig(tool_name=field.dropdown_tool)
    if not tool_cfg or not tool_cfg.tool_name:
        return

    tool = _find_tool(tools_config, tool_cfg.tool_name)
    if not tool:
        state.setdefault("trace_events", []).append(
            {"stage": "dropdown_tool", "field": field_name, "error": f"Tool '{tool_cfg.tool_name}' not found"}
        )
        return

    payload = _resolve_input_map(tool_cfg.input_map, state.get("form_values", {}))
    tool_result = execute_tool(tool, payload, tenant_id, agent_id, version)
    body = _extract_tool_body(tool_result)
    candidate = _extract_path(body, tool_cfg.output_path) if tool_cfg.output_path else body
    options = _normalize_options(candidate)
    if options:
        state.setdefault("field_options", {})[field_name] = options
    state.setdefault("trace_events", []).append(
        {
            "stage": "dropdown_tool",
            "field": field_name,
            "tool": tool.name,
            "input": payload,
            "result": tool_result,
            "options_count": len(options),
        }
    )


def _maybe_run_tool_hook(
    previous_state: Dict[str, Any],
    state: Dict[str, Any],
    form,
    tools_config: ToolsConfig,
    tenant_id: str,
    agent_id: str,
    version: int,
) -> None:
    if form.mode != "step-by-step":
        return
    if not previous_state.get("awaiting_field"):
        return
    if state.get("awaiting_field"):
        return
    prev_idx = previous_state.get("current_step_index", 0)
    curr_idx = state.get("current_step_index", 0)
    if curr_idx <= prev_idx:
        return
    completed_idx = curr_idx - 1
    if completed_idx < 0 or completed_idx >= len(form.field_order):
        return
    field_name = form.field_order[completed_idx]
    field = form.field_by_name(field_name)
    if not field or not field.tool_hook:
        return

    tool_cfg = field.tool_hook
    hook_key = f"{field_name}:{tool_cfg.tool_name}"
    if hook_key in state.get("tool_hook_executed", []):
        return

    tool = _find_tool(tools_config, tool_cfg.tool_name)
    if not tool:
        state.setdefault("trace_events", []).append(
            {"stage": "tool_hook", "field": field_name, "error": f"Tool '{tool_cfg.tool_name}' not found"}
        )
        return

    payload = _resolve_input_map(tool_cfg.input_map, state.get("form_values", {}))
    tool_result = execute_tool(tool, payload, tenant_id, agent_id, version)
    body = _extract_tool_body(tool_result)
    _apply_output_map(tool_cfg.output_map, body, state.get("form_values", {}))
    state.setdefault("tool_hook_executed", []).append(hook_key)
    state.setdefault("trace_events", []).append(
        {
            "stage": "tool_hook",
            "field": field_name,
            "tool": tool.name,
            "input": payload,
            "result": tool_result,
            "output_map": tool_cfg.output_map,
        }
    )
