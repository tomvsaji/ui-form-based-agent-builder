import logging
import threading
from typing import Dict

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import CONFIG_FILES, load_configs, write_config
from .graph import build_graph
from .models import ChatResponse, FormsConfig, MessageRequest
from .persistence import ThreadStore


state_lock = threading.Lock()
(
    project_config,
    forms_config,
    tools_config,
    persistence_config,
    logging_config,
    knowledge_config,
) = load_configs()
graph_app, checkpointer = build_graph(forms_config, tools_config)
thread_store = ThreadStore(persistence_config)

logging.basicConfig(level=getattr(logging, logging_config.level))
logger = logging.getLogger(__name__)

app = FastAPI(
    title=project_config.project_name,
    description="FastAPI + LangGraph prototype for intent-driven forms with threads.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def reload_runtime() -> None:
    global project_config, forms_config, tools_config, persistence_config, logging_config, knowledge_config, graph_app, checkpointer, thread_store
    with state_lock:
        (
            project_config,
            forms_config,
            tools_config,
            persistence_config,
            logging_config,
            knowledge_config,
        ) = load_configs()
        graph_app, checkpointer = build_graph(forms_config, tools_config)
        thread_store = ThreadStore(persistence_config)
        logging.basicConfig(level=getattr(logging, logging_config.level))
        logger.info("Runtime reloaded from config files.")


def get_forms_config() -> FormsConfig:
    return forms_config


@app.get("/health")
def healthcheck():
    return {"status": "ok"}


@app.get("/forms")
def list_forms(cfg: FormsConfig = Depends(get_forms_config)):
    return cfg.model_dump()


@app.post("/chat", response_model=ChatResponse)
def chat(req: MessageRequest):
    if not req.thread_id:
        raise HTTPException(status_code=400, detail="thread_id is required.")
    state_input = {"thread_id": req.thread_id, "last_user_message": req.message}
    result = graph_app.invoke(state_input, config={"configurable": {"thread_id": req.thread_id}})
    reply = result.get("reply", "I was not able to generate a response.")
    thread_store.persist_state(req.thread_id, result)
    logger.info("Processed message for thread %s", req.thread_id)
    return ChatResponse(reply=reply, state=result)


@app.get("/config/{name}")
def read_config(name: str):
    if name not in CONFIG_FILES:
        raise HTTPException(status_code=404, detail="Unknown config")
    with CONFIG_FILES[name].open("r", encoding="utf-8") as f:
        import json

        return json.load(f)


@app.put("/config/{name}")
def write_config_endpoint(name: str, data: Dict):
    if name not in CONFIG_FILES:
        raise HTTPException(status_code=404, detail="Unknown config")
    try:
        write_config(name, data)
        return {"status": "ok"}
    except Exception as exc:  # pragma: no cover - fast path for UI
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/generate-backend")
def generate_backend(payload: Dict = None):
    """
    Reload configs and rebuild the graph. Payload allows future CI/deploy hooks.
    Example body: {"action": "reload"} or {"action": "ci-dry-run"}.
    """
    action = (payload or {}).get("action", "reload")
    if action == "reload":
        reload_runtime()
        return {"status": "ok", "message": "Backend graph reloaded from config."}
    if action == "ci-dry-run":
        # Placeholder: In a real system, trigger GitHub Actions or az pipelines.
        return {"status": "ok", "message": "CI trigger placeholder (no-op in prototype)."}
    raise HTTPException(status_code=400, detail=f"Unknown action '{action}'")
