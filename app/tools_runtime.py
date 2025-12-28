import hashlib
import json
import os
from typing import Any, Dict, Optional

import httpx

from .cache import build_cache_key, cache_get, cache_set, get_redis
from .models import ToolDefinition


def _hash_payload(payload: Dict[str, Any]) -> str:
    raw = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def execute_tool(
    tool: ToolDefinition,
    payload: Dict[str, Any],
    tenant_id: str,
    agent_id: str,
    version: int,
    permission: str = "public",
) -> Dict[str, Any]:
    cache = get_redis()
    cache_key = None
    ttl = tool.cache_ttl_seconds or int(os.getenv("CACHE_TTL_SECONDS", "900"))
    if cache and tool.cache_enabled:
        cache_key = build_cache_key("tool", tenant_id, agent_id, version, permission, tool.name, _hash_payload(payload))
        cached = cache_get(cache, cache_key)
        if cached is not None:
            return {"cached": True, "response": cached}

    headers = tool.headers or {}
    method = tool.http_method.upper()
    url = str(tool.url)

    try:
        with httpx.Client(timeout=10.0) as client:
            if method == "GET":
                resp = client.get(url, params=payload, headers=headers)
            else:
                resp = client.request(method, url, json=payload, headers=headers)
        try:
            body = resp.json()
        except ValueError:
            body = {"text": resp.text}
        result = {"status": resp.status_code, "body": body}
    except Exception as exc:
        result = {"status": 500, "error": str(exc)}

    if cache and tool.cache_enabled and cache_key:
        cache_set(cache, cache_key, result, ttl)
    return {"cached": False, "response": result}
