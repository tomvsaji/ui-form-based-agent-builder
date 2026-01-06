import json
import os
from typing import Any, Dict, List, Optional, Tuple

from openai import OpenAI, AzureOpenAI


def _client():
    azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
    azure_key = os.getenv("AZURE_OPENAI_API_KEY")
    if azure_endpoint and azure_key:
        return AzureOpenAI(
            api_key=azure_key,
            api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-10-21"),
            azure_endpoint=azure_endpoint,
        )
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY or AZURE_OPENAI_API_KEY is required for LLM routing.")
    return OpenAI(api_key=api_key)


def _model() -> str:
    return os.getenv("AZURE_OPENAI_DEPLOYMENT", os.getenv("LLM_MODEL", "gpt-4o-mini"))


def select_intent(message: str, intents: List[Dict[str, str]]) -> Tuple[Optional[str], Dict[str, Any]]:
    client = _client()
    intent_list = [{"id": i["id"], "name": i["name"], "description": i.get("description", "") } for i in intents]
    prompt = (
        "Choose the best intent id for the user message. "
        "If the message is a greeting, small talk, or doesn't match any intent, return null intent_id with confidence 0. "
        "If the message does not match any intent, return null intent_id with confidence 0. "
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
    intent_id = data.get("intent_id")
    confidence = data.get("confidence", 0)
    threshold = float(os.getenv("LLM_INTENT_THRESHOLD", "0.45"))
    if intent_id not in {i["id"] for i in intent_list}:
        intent_id = None
    if confidence is None or confidence < threshold:
        intent_id = None
    usage = response.usage.model_dump() if response.usage else {}
    return intent_id, {"usage": usage, "raw": data, "threshold": threshold}


def answer_with_context(question: str, context: str) -> Tuple[str, Dict[str, Any]]:
    client = _client()
    prompt = (
        "You are a helpful assistant. Use the provided context to answer the question. "
        "If the context does not contain the answer, say you do not know."
    )
    response = client.chat.completions.create(
        model=_model(),
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": json.dumps({"question": question, "context": context})},
        ],
    )
    content = response.choices[0].message.content or ""
    usage = response.usage.model_dump() if response.usage else {}
    return content.strip(), {"usage": usage}


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
