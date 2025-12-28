import json
import os
from typing import Any, Optional

import redis


def get_redis() -> Optional[redis.Redis]:
    url = os.getenv("REDIS_URL")
    if not url:
        return None
    return redis.Redis.from_url(url, decode_responses=True)


def build_cache_key(prefix: str, tenant: str, agent: str, version: int, permission: str, *parts: str) -> str:
    safe_parts = ":".join(parts)
    return f"{prefix}:{tenant}:{agent}:{version}:{permission}:{safe_parts}"


def cache_get(redis_client: redis.Redis, key: str) -> Optional[Any]:
    raw = redis_client.get(key)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def cache_set(redis_client: redis.Redis, key: str, value: Any, ttl_seconds: int) -> None:
    payload = json.dumps(value)
    redis_client.setex(key, ttl_seconds, payload)
