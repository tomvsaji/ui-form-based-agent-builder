import os
from typing import Dict, Optional, Tuple

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from .llm import extract_fields, select_intent
from .models import AgentState, FieldDefinition, FormsConfig, ToolsConfig


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
    return state


def _validate_field(field: FieldDefinition, raw_value: Optional[str]) -> Tuple[bool, str, Optional[object]]:
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
        if field.dropdown_options and raw_value.lower() in {o.lower() for o in field.dropdown_options}:
            # Preserve canonical casing from the options list
            canonical = next(o for o in field.dropdown_options if o.lower() == raw_value.lower())
            return True, "", canonical
        return False, f"Please choose one of: {', '.join(field.dropdown_options or [])}", None

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


def build_graph(forms_config: FormsConfig, tools_config: ToolsConfig):
    """Return a LangGraph app plus checkpointer."""
    workflow = StateGraph(AgentState)
    memory = MemorySaver()

    def ingest_message(state: AgentState) -> AgentState:
        state = _ensure_defaults(dict(state))
        if state.get("last_user_message"):
            state["messages"].append({"role": "user", "content": state["last_user_message"]})
        return state

    def intent_router(state: AgentState) -> AgentState:
        state = _ensure_defaults(dict(state))
        if state.get("current_form_id"):
            return state

        last_message = state.get("last_user_message") or ""
        chosen_intent = None
        if os.getenv("LLM_ROUTING_ENABLED", "true").lower() == "true" and forms_config.intents:
            try:
                intent_id, meta = select_intent(
                    last_message,
                    [{"id": i.id, "name": i.name, "description": i.description} for i in forms_config.intents],
                )
                chosen_intent = next((i for i in forms_config.intents if i.id == intent_id), None)
                state["trace_events"].append({"stage": "intent_router", "llm": meta})
                state["llm_usage"] = meta.get("usage", {})
            except Exception:
                chosen_intent = None
        for intent in forms_config.intents:
            if intent.name.lower() in last_message.lower() or any(
                token in last_message.lower() for token in intent.description.lower().split()
            ):
                chosen_intent = intent
                break

        if not chosen_intent and forms_config.intents:
            chosen_intent = forms_config.intents[0]

        if chosen_intent:
            state["current_intent"] = chosen_intent.id
            state["current_form_id"] = chosen_intent.target_form
            state["current_step_index"] = 0
            state["form_values"] = {}
            state["awaiting_field"] = False
        return state

    def form_orchestrator(state: AgentState) -> AgentState:
        state = _ensure_defaults(dict(state))
        if not state.get("current_form_id"):
            state["reply"] = "I was not able to route to a form."
            return state

        form = forms_config.form_by_id(state["current_form_id"])
        if not form:
            state["reply"] = f"Configured form '{state['current_form_id']}' was not found."
            return state

        if state.get("completed"):
            state["reply"] = "Form already completed. Say 'restart' to begin again."
            return state

        # Step-by-step flow
        if form.mode == "step-by-step":
            idx = state.get("current_step_index", 0)
            if idx >= len(form.field_order):
                state["completed"] = True
                state["reply"] = _summarize_form(state, form.id, forms_config)
                return state

            field_name = form.field_order[idx]
            field = form.field_by_name(field_name)
            if not field:
                state["reply"] = f"Unknown field '{field_name}'."
                return state

            if state.get("awaiting_field"):
                ok, error_msg, parsed_value = _validate_field(field, state.get("last_user_message"))
                if not ok:
                    state["reply"] = f"{error_msg} Please provide {field.label}."
                    return state
                state["form_values"][field_name] = parsed_value
                state["current_step_index"] = idx + 1
                state["awaiting_field"] = False
                if state["current_step_index"] >= len(form.field_order):
                    state["completed"] = True
                    state["reply"] = _summarize_form(state, form.id, forms_config)
                    return state

            next_field_name = form.field_order[state["current_step_index"]]
            next_field = form.field_by_name(next_field_name)
            state["awaiting_field"] = True
            state["reply"] = f"Please provide {next_field.label} ({next_field.type})."
            return state

        # One-shot flow
        if not state.get("awaiting_field"):
            requested = ", ".join([f"{f.label} ({f.type})" for f in form.fields])
            state["awaiting_field"] = True
            state["reply"] = f"Share all details in one message: {requested}."
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
                state["trace_events"].append({"stage": "field_extraction", "llm": meta})
                state["llm_usage"] = meta.get("usage", {})
                for field in form.fields:
                    raw_value = extracted.get(field.name)
                    if raw_value is None:
                        continue
                    ok, _, parsed_value = _validate_field(field, str(raw_value))
                    if ok:
                        state["form_values"][field.name] = parsed_value
                state["llm_extraction_attempted"] = True
            except Exception:
                state["llm_extraction_attempted"] = True
        for field in form.fields:
            existing = state["form_values"].get(field.name)
            if existing is not None:
                continue
            ok, _, parsed_value = _validate_field(field, user_msg if field.type in {"text", "date"} else None)
            if field.type == "number":
                import re

                match = re.search(r"([-+]?\d*\.\d+|[-+]?\d+)", user_msg)
                parsed_value = float(match.group(1)) if match else None
                ok = parsed_value is not None
            if field.type in {"dropdown", "enum"} and field.dropdown_options:
                matched_option = next((opt for opt in field.dropdown_options if opt.lower() in user_msg.lower()), None)
                parsed_value = matched_option
                ok = matched_option is not None
            if field.type == "boolean":
                ok, _, parsed_value = _validate_field(field, user_msg)

            if ok and parsed_value is not None:
                state["form_values"][field.name] = parsed_value

        missing = [f.label for f in form.fields if f.required and f.name not in state["form_values"]]
        if missing:
            state["reply"] = f"Missing fields: {', '.join(missing)}. Please provide them."
            return state

        state["completed"] = True
        state["reply"] = _summarize_form(state, form.id, forms_config)
        return state

    def response_node(state: AgentState) -> AgentState:
        state = _ensure_defaults(dict(state))
        reply = state.get("reply") or "Acknowledged."
        state["messages"].append({"role": "assistant", "content": reply})
        return state

    workflow.add_node("ingest_message", ingest_message)
    workflow.add_node("intent_router", intent_router)
    workflow.add_node("form_orchestrator", form_orchestrator)
    workflow.add_node("response_node", response_node)

    workflow.set_entry_point("ingest_message")
    workflow.add_edge("ingest_message", "intent_router")
    workflow.add_edge("intent_router", "form_orchestrator")
    workflow.add_edge("form_orchestrator", "response_node")
    workflow.add_edge("response_node", END)

    app = workflow.compile(checkpointer=memory)
    return app, memory
