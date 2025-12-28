import json
import os
from typing import Any, Dict, List, Tuple

from openai import OpenAI


def _client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required for LLM routing.")
    return OpenAI(api_key=api_key)


def _model() -> str:
    return os.getenv("LLM_MODEL", "gpt-4o-mini")


def select_intent(message: str, intents: List[Dict[str, str]]) -> Tuple[str, Dict[str, Any]]:
    client = _client()
    intent_list = [{"id": i["id"], "name": i["name"], "description": i.get("description", "") } for i in intents]
    prompt = (
        "Choose the best intent id for the user message. "
        "Return JSON with keys intent_id and confidence (0-1)."
    )
    response = client.chat.completions.create(
        model=_model(),
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": json.dumps({"message": message, "intents": intent_list})},
        ],
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content or "{}"
    data = json.loads(content)
    intent_id = data.get("intent_id") or intent_list[0]["id"]
    usage = response.usage.model_dump() if response.usage else {}
    return intent_id, {"usage": usage, "raw": data}


def extract_fields(message: str, fields: List[Dict[str, Any]]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    client = _client()
    prompt = (
        "Extract field values from the message. "
        "Return JSON object keyed by field name. Use null if missing."
    )
    response = client.chat.completions.create(
        model=_model(),
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": json.dumps({"message": message, "fields": fields})},
        ],
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content or "{}"
    data = json.loads(content)
    usage = response.usage.model_dump() if response.usage else {}
    return data, {"usage": usage}
