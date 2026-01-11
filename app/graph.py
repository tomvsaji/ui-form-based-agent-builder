import os
import time
from typing import Dict, Optional, Tuple

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from .embeddings import embed_text
from .llm import answer_with_context, extract_fields, select_intent
from .models import AgentState, FieldDefinition, FormsConfig, KnowledgeBaseConfig, ToolsConfig
from .storage import get_tenant_id, list_knowledge_bases, search_kb_documents


def _ensure_defaults(state: AgentState) -> AgentState:
    state.setdefault("messages", [])
    state.setdefault("form_values", {})
    state.setdefault("current_step_index", 0)
    state.setdefault("completed", False)
    state.setdefault("awaiting_field", False)
    state.setdefault("llm_extraction_attempted", False)
    state.setdefault("llm_usage", {})
    state.setdefault("trace_events", [])
    state.setdefault("tool_executed", False)
    state.setdefault("field_options", {})
    state.setdefault("tool_hook_executed", [])
    return state


def _trace_node_event(state: AgentState, node: str, phase: str, payload: Dict[str, object]) -> None:
    state.setdefault("trace_events", []).append(
        {"node": node, "phase": phase, "ts": time.time(), **payload}
    )


def _validate_field(
    field: FieldDefinition,
    raw_value: Optional[str],
    options_override: Optional[list[str]] = None,
) -> Tuple[bool, str, Optional[object]]:
    if raw_value is None:
        return (not field.required, "No value provided.", None)

    constraints = field.constraints
    min_length = field.min_length if field.min_length is not None else (constraints.min_length if constraints else None)
    max_length = field.max_length if field.max_length is not None else (constraints.max_length if constraints else None)
    minimum = field.minimum if field.minimum is not None else (constraints.minimum if constraints else None)
    maximum = field.maximum if field.maximum is not None else (constraints.maximum if constraints else None)
    pattern = field.pattern or (constraints.regex if constraints else None)

    if field.type == "boolean":
        normalized = raw_value.strip().lower()
        if normalized in {"yes", "true", "y", "1"}:
            return True, "", True
        if normalized in {"no", "false", "n", "0"}:
            return True, "", False
        return False, "Expecting yes/no response.", None

    if field.type == "number":
        try:
            num_val = float(raw_value)
        except ValueError:
            return False, "Please provide a numeric value.", None
        if minimum is not None and num_val < minimum:
            return False, f"Value must be at least {minimum}.", None
        if maximum is not None and num_val > maximum:
            return False, f"Value must be at most {maximum}.", None
        return True, "", num_val

    if field.type in {"dropdown", "enum"}:
        options = options_override or field.dropdown_options or []
        if options and raw_value.lower() in {o.lower() for o in options}:
            # Preserve canonical casing from the options list
            canonical = next(o for o in options if o.lower() == raw_value.lower())
            return True, "", canonical
        if options:
            return False, f"Please choose one of: {', '.join(options)}", None
        return False, "Please choose a valid option.", None

    # Text/date/file fall back to string validation
    text_val = str(raw_value)
    if min_length and len(text_val) < min_length:
        return False, f"Provide at least {min_length} characters.", None
    if max_length and len(text_val) > max_length:
        return False, f"Limit to {max_length} characters.", None
    if pattern:
        import re

        if not re.match(pattern, text_val):
            return False, "Value does not match required pattern.", None
    return True, "", text_val


def _summarize_form(state: AgentState, form_id: str, forms_config: FormsConfig) -> str:
    form = forms_config.form_by_id(form_id)
    if not form:
        return "Form completed."
    parts = [f"{form.name} completed with:"]
    for field_name in form.field_order:
        val = state["form_values"].get(field_name, "<missing>")
        label = form.field_by_name(field_name).label if form.field_by_name(field_name) else field_name
        parts.append(f"- {label}: {val}")
    return "\n".join(parts)


def build_graph(
    forms_config: FormsConfig,
    tools_config: ToolsConfig,
    knowledge_config: Optional[KnowledgeBaseConfig] = None,
):
    """Return a LangGraph app plus checkpointer."""
    workflow = StateGraph(AgentState)
    memory = MemorySaver()

    def ingest_message(state: AgentState) -> AgentState:
        state = _ensure_defaults(dict(state))
        _trace_node_event(
            state,
            "ingest_message",
            "start",
            {"input": {"last_user_message": state.get("last_user_message")}},
        )
        if state.get("last_user_message"):
            state["messages"].append({"role": "user", "content": state["last_user_message"]})
        _trace_node_event(
            state,
            "ingest_message",
            "end",
            {"output": {"messages_count": len(state.get("messages", []))}},
        )
        return state

    def intent_router(state: AgentState) -> AgentState:
        state = _ensure_defaults(dict(state))
        _trace_node_event(
            state,
            "intent_router",
            "start",
            {"input": {"message": state.get("last_user_message")}},
        )
        if state.get("current_form_id") and state.get("completed") and not state.get("awaiting_field"):
            state["current_form_id"] = None
            state["current_intent"] = None
            state["current_step_index"] = 0
            state["form_values"] = {}
            state["awaiting_field"] = False
            state["completed"] = False
            _trace_node_event(
                state,
                "intent_router",
                "event",
                {"event": "form_reset_after_completion"},
            )
        if state.get("current_form_id"):
            _trace_node_event(
                state,
                "intent_router",
                "end",
                {"output": {"current_form_id": state.get("current_form_id"), "skipped": True}},
            )
            return state

        last_message = state.get("last_user_message") or ""
        if not forms_config.intents:
            state["reply"] = "No intents configured."
            _trace_node_event(
                state,
                "intent_router",
                "end",
                {"output": {"reply": state.get("reply"), "error": "no_intents"}},
            )
            return state

        try:
            intent_id, meta = select_intent(
                last_message,
                [{"id": i.id, "name": i.name, "description": i.description} for i in forms_config.intents],
            )
            chosen_intent = next((i for i in forms_config.intents if i.id == intent_id), None)
            _trace_node_event(
                state,
                "intent_router",
                "event",
                {"event": "llm_call", "llm": meta},
            )
            state["llm_usage"] = meta.get("usage", {})
        except Exception as exc:
            state["reply"] = f"LLM intent routing failed: {exc}"
            _trace_node_event(
                state,
                "intent_router",
                "end",
                {"output": {"reply": state.get("reply"), "error": "llm_failed"}},
            )
            return state

        if not chosen_intent:
            state["general_query"] = True
            _trace_node_event(
                state,
                "intent_router",
                "end",
                {"output": {"general_query": True}},
            )
            return state

        if chosen_intent:
            state["current_intent"] = chosen_intent.id
            state["current_form_id"] = chosen_intent.target_form
            state["current_step_index"] = 0
            state["form_values"] = {}
            state["awaiting_field"] = False
            _trace_node_event(
                state,
                "intent_router",
                "end",
                {
                    "output": {
                        "current_intent": chosen_intent.id,
                        "current_form_id": chosen_intent.target_form,
                    }
                },
            )
        return state

    def general_responder(state: AgentState) -> AgentState:
        state = _ensure_defaults(dict(state))
        _trace_node_event(
            state,
            "general_responder",
            "start",
            {"input": {"message": state.get("last_user_message")}},
        )
        if state.get("current_form_id") or state.get("reply"):
            _trace_node_event(
                state,
                "general_responder",
                "end",
                {"output": {"skipped": True}},
            )
            return state
        if not state.get("general_query"):
            _trace_node_event(
                state,
                "general_responder",
                "end",
                {"output": {"skipped": True, "reason": "not_general_query"}},
            )
            return state
        message = (state.get("last_user_message") or "").strip()
        if not message:
            state["reply"] = "Hi! How can I help today?"
            _trace_node_event(
                state,
                "general_responder",
                "end",
                {"output": {"reply": state.get("reply")}},
            )
            return state

        if knowledge_config and knowledge_config.enable_knowledge_base and knowledge_config.provider == "pgvector":
            kb_id = knowledge_config.knowledge_base_id
            if not kb_id:
                tenant_id = get_tenant_id()
                kbs = list_knowledge_bases(tenant_id)
                kb_id = kbs[0]["id"] if kbs else None
            if kb_id:
                try:
                    embedding = embed_text(message)
                    results = search_kb_documents(get_tenant_id(), kb_id, embedding, limit=4)
                except Exception as exc:
                    _trace_node_event(
                        state,
                        "general_responder",
                        "event",
                        {"event": "kb_search_failed", "error": f"KB search failed: {exc}"},
                    )
                    results = []
                if results:
                    context = "\n\n".join([r["content"] for r in results])
                    try:
                        answer, meta = answer_with_context(message, context)
                        if answer:
                            state["reply"] = answer
                            _trace_node_event(
                                state,
                                "general_responder",
                                "event",
                                {"event": "kb_answer", "kb_id": kb_id, "results": results, "llm": meta},
                            )
                            _trace_node_event(
                                state,
                                "general_responder",
                                "end",
                                {"output": {"reply": state.get("reply"), "kb_id": kb_id}},
                            )
                            return state
                    except Exception as exc:
                        _trace_node_event(
                            state,
                            "general_responder",
                            "event",
                            {"event": "llm_answer_failed", "error": f"LLM answer failed: {exc}"},
                        )
                    top_hit = results[0].get("content") if results else ""
                    fallback = (top_hit or "").strip()
                    if fallback:
                        fallback = fallback[:800]
                        state["reply"] = f"I found this in the knowledge base:\n\n{fallback}"
                    else:
                        state["reply"] = "I found relevant information in the knowledge base, but couldn't summarize it."
                    _trace_node_event(
                        state,
                        "general_responder",
                        "event",
                        {"event": "kb_fallback", "kb_id": kb_id, "results": results},
                    )
                    _trace_node_event(
                        state,
                        "general_responder",
                        "end",
                        {"output": {"reply": state.get("reply"), "kb_id": kb_id}},
                    )
                    return state

        intent_names = ", ".join([i.name for i in forms_config.intents])
        state["reply"] = f"Hi! What would you like to do? I can help with: {intent_names}."
        _trace_node_event(
            state,
            "general_responder",
            "end",
            {"output": {"reply": state.get("reply")}},
        )
        return state

    def form_orchestrator(state: AgentState) -> AgentState:
        state = _ensure_defaults(dict(state))
        def log_end(payload: Dict[str, object]) -> None:
            _trace_node_event(state, "form_orchestrator", "end", {"output": payload})

        _trace_node_event(
            state,
            "form_orchestrator",
            "start",
            {
                "input": {
                    "current_form_id": state.get("current_form_id"),
                    "current_step_index": state.get("current_step_index"),
                    "awaiting_field": state.get("awaiting_field"),
                    "last_user_message": state.get("last_user_message"),
                }
            },
        )
        if state.get("reply"):
            log_end(
                {
                    "skipped": True,
                    "reason": "reply_already_set",
                    "current_form_id": state.get("current_form_id"),
                }
            )
            return state
        if not state.get("current_form_id"):
            state["reply"] = "I was not able to route to a form."
            log_end({"reply": state.get("reply"), "error": "missing_form"})
            return state

        form = forms_config.form_by_id(state["current_form_id"])
        if not form:
            state["reply"] = f"Configured form '{state['current_form_id']}' was not found."
            log_end({"reply": state.get("reply"), "error": "form_not_found"})
            return state

        if state.get("completed"):
            state["reply"] = "Form already completed. Start a new request if needed."
            log_end({"reply": state.get("reply"), "completed": True})
            return state

        # Step-by-step flow
        if form.mode == "step-by-step":
            idx = state.get("current_step_index", 0)
            if idx >= len(form.field_order):
                state["completed"] = True
                state["reply"] = _summarize_form(state, form.id, forms_config)
                log_end({"reply": state.get("reply"), "completed": True, "form_values": state.get("form_values")})
                return state

            field_name = form.field_order[idx]
            field = form.field_by_name(field_name)
            if not field:
                state["reply"] = f"Unknown field '{field_name}'."
                log_end({"reply": state.get("reply"), "error": "field_not_found"})
                return state

            if state.get("awaiting_field"):
                options = state.get("field_options", {}).get(field.name)
                ok, error_msg, parsed_value = _validate_field(field, state.get("last_user_message"), options)
                if not ok:
                    state["reply"] = f"{error_msg} Please provide {field.label}."
                    log_end({"reply": state.get("reply"), "error": "validation_failed"})
                    return state
                state["form_values"][field_name] = parsed_value
                state["current_step_index"] = idx + 1
                state["awaiting_field"] = False
                if state["current_step_index"] >= len(form.field_order):
                    state["completed"] = True
                    state["reply"] = _summarize_form(state, form.id, forms_config)
                    log_end({"reply": state.get("reply"), "completed": True, "form_values": state.get("form_values")})
                    return state

            next_field_name = form.field_order[state["current_step_index"]]
            next_field = form.field_by_name(next_field_name)
            state["awaiting_field"] = True
            state["reply"] = f"Please provide {next_field.label} ({next_field.type})."
            log_end({"reply": state.get("reply"), "next_field": next_field.name})
            return state

        # One-shot flow
        if not state.get("awaiting_field"):
            requested = ", ".join([f"{f.label} ({f.type})" for f in form.fields])
            state["awaiting_field"] = True
            state["reply"] = f"Share all details in one message: {requested}."
            log_end({"reply": state.get("reply"), "mode": "one-shot"})
            return state

        # Attempt very light extraction for one-shot inputs
        user_msg = state.get("last_user_message", "")
        if not state.get("llm_extraction_attempted") and os.getenv("LLM_EXTRACTION_ENABLED", "true").lower() == "true":
            try:
                extracted, meta = extract_fields(
                    user_msg,
                    [
                        {
                            "name": f.name,
                            "label": f.label,
                            "type": f.type,
                            "required": f.required,
                        }
                        for f in form.fields
                    ],
                )
                _trace_node_event(
                    state,
                    "form_orchestrator",
                    "event",
                    {"event": "field_extraction", "llm": meta},
                )
                state["llm_usage"] = meta.get("usage", {})
                for field in form.fields:
                    raw_value = extracted.get(field.name)
                    if raw_value is None:
                        continue
                    options = state.get("field_options", {}).get(field.name)
                    ok, _, parsed_value = _validate_field(field, str(raw_value), options)
                    if ok:
                        state["form_values"][field.name] = parsed_value
                state["llm_extraction_attempted"] = True
            except Exception:
                state["llm_extraction_attempted"] = True
        for field in form.fields:
            existing = state["form_values"].get(field.name)
            if existing is not None:
                continue
            options = state.get("field_options", {}).get(field.name)
            ok, _, parsed_value = _validate_field(field, user_msg if field.type in {"text", "date"} else None, options)
            if field.type == "number":
                import re

                match = re.search(r"([-+]?\d*\.\d+|[-+]?\d+)", user_msg)
                parsed_value = float(match.group(1)) if match else None
                ok = parsed_value is not None
            if field.type in {"dropdown", "enum"}:
                options = options or field.dropdown_options or []
                matched_option = next((opt for opt in options if opt.lower() in user_msg.lower()), None)
                parsed_value = matched_option
                ok = matched_option is not None
            if field.type == "boolean":
                ok, _, parsed_value = _validate_field(field, user_msg)

            if ok and parsed_value is not None:
                state["form_values"][field.name] = parsed_value

        missing = [f.label for f in form.fields if f.required and f.name not in state["form_values"]]
        if missing:
            state["reply"] = f"Missing fields: {', '.join(missing)}. Please provide them."
            log_end({"reply": state.get("reply"), "missing_fields": missing})
            return state

        state["completed"] = True
        state["reply"] = _summarize_form(state, form.id, forms_config)
        log_end({"reply": state.get("reply"), "completed": True, "form_values": state.get("form_values")})
        return state

    def response_node(state: AgentState) -> AgentState:
        state = _ensure_defaults(dict(state))
        _trace_node_event(
            state,
            "response_node",
            "start",
            {"input": {"reply": state.get("reply")}},
        )
        reply = state.get("reply")
        if not reply and state.get("current_form_id") and state.get("awaiting_field"):
            form = forms_config.form_by_id(state["current_form_id"])
            if form:
                idx = state.get("current_step_index", 0)
                if 0 <= idx < len(form.field_order):
                    field_name = form.field_order[idx]
                    field = form.field_by_name(field_name)
                    if field:
                        reply = f"Please provide {field.label} ({field.type})."
        reply = reply or "Acknowledged."
        state["reply"] = reply
        state["messages"].append({"role": "assistant", "content": reply})
        _trace_node_event(
            state,
            "response_node",
            "end",
            {"output": {"reply": reply}},
        )
        return state

    workflow.add_node("ingest_message", ingest_message)
    workflow.add_node("intent_router", intent_router)
    workflow.add_node("general_responder", general_responder)
    workflow.add_node("form_orchestrator", form_orchestrator)
    workflow.add_node("response_node", response_node)

    workflow.set_entry_point("ingest_message")
    workflow.add_edge("ingest_message", "intent_router")
    workflow.add_edge("intent_router", "general_responder")
    workflow.add_edge("general_responder", "form_orchestrator")
    workflow.add_edge("form_orchestrator", "response_node")
    workflow.add_edge("response_node", END)

    app = workflow.compile(checkpointer=memory)
    return app, memory
