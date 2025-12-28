from typing import Any, Dict, List, Literal, Optional, TypedDict

from pydantic import BaseModel, Field, HttpUrl


class AzureAppServiceSettings(BaseModel):
    app_name: str
    resource_group: str
    region: str
    auth_mode: Literal["publish_profile", "managed_identity"] = "publish_profile"


class ProjectConfig(BaseModel):
    project_name: str
    system_message: str
    base_url: HttpUrl
    deploy_to_azure: bool = False
    azure_app_service: Optional[AzureAppServiceSettings] = None


class KnowledgeBaseConfig(BaseModel):
    enable_knowledge_base: bool = False
    provider: Literal["azure_ai_search", "none"] = "azure_ai_search"
    endpoint: Optional[HttpUrl] = None
    api_key: Optional[str] = None
    index_name: Optional[str] = None
    retrieval_mode: Literal["single-pass", "agentic"] = "single-pass"
    max_agentic_passes: int = 3
    use_semantic_ranker: bool = True


class FieldUIConfig(BaseModel):
    placeholder: Optional[str] = None
    help_text: Optional[str] = None
    options: Optional[List[str]] = None


class FieldConstraintConfig(BaseModel):
    min_length: Optional[int] = Field(default=None, ge=0)
    max_length: Optional[int] = Field(default=None, ge=0)
    minimum: Optional[float] = None
    maximum: Optional[float] = None
    regex: Optional[str] = None


class RuleCondition(BaseModel):
    field: str
    operator: Literal["equals", "not_equals", "contains", "gt", "gte", "lt", "lte", "is_empty", "not_empty"]
    value: Optional[Any] = None


class VisibilityRule(BaseModel):
    match: Literal["all", "any"] = "all"
    conditions: List[RuleCondition] = Field(default_factory=list)


class DerivedFieldConfig(BaseModel):
    expression: str
    input_fields: List[str] = Field(default_factory=list)


class FieldDefinition(BaseModel):
    id: Optional[str] = None
    name: str
    label: str
    type: Literal["text", "number", "date", "boolean", "dropdown", "enum", "file"]
    required: bool = False
    dropdown_options: Optional[List[str]] = None
    dropdown_tool: Optional[str] = None
    pattern: Optional[str] = None
    min_length: Optional[int] = Field(default=None, ge=0)
    max_length: Optional[int] = Field(default=None, ge=0)
    minimum: Optional[float] = None
    maximum: Optional[float] = None
    llm_validation_prompt: Optional[str] = None
    constraints: Optional[FieldConstraintConfig] = None
    ui: Optional[FieldUIConfig] = None
    visibility: Optional[VisibilityRule] = None
    enablement: Optional[VisibilityRule] = None
    derived: Optional[DerivedFieldConfig] = None


class ValidatorDefinition(BaseModel):
    id: str
    name: str
    message: str
    conditions: List[RuleCondition] = Field(default_factory=list)
    match: Literal["all", "any"] = "all"


class SubmissionDefinition(BaseModel):
    type: Literal["api", "tool"] = "api"
    tool_name: Optional[str] = None
    url: Optional[HttpUrl] = None
    http_method: Optional[Literal["GET", "POST", "PUT", "PATCH", "DELETE"]] = None
    headers: Dict[str, str] = Field(default_factory=dict)
    body_template: Dict[str, Any] = Field(default_factory=dict)


class TransitionDefinition(BaseModel):
    to: str
    condition: Optional[str] = None
    priority: int = 0
    label: Optional[str] = None


class StepDefinition(BaseModel):
    id: str
    type: Literal["capture_field", "confirm", "call_tool", "branch", "escalate", "end"]
    inputs: Dict[str, str] = Field(default_factory=dict)
    outputs: Dict[str, str] = Field(default_factory=dict)
    tool_name: Optional[str] = None
    retry_limit: int = 0
    timeout_seconds: Optional[int] = None
    error_handling: Optional[str] = None
    transitions: List[TransitionDefinition] = Field(default_factory=list)


class FormDefinition(BaseModel):
    id: str
    name: str
    title: Optional[str] = None
    description: str
    submission_url: Optional[HttpUrl] = None
    mode: Literal["step-by-step", "one-shot"] = "step-by-step"
    field_order: List[str]
    fields: List[FieldDefinition]
    validators: List[ValidatorDefinition] = Field(default_factory=list)
    submission: Optional[SubmissionDefinition] = None
    steps: List[StepDefinition] = Field(default_factory=list)
    version: int = 1

    def field_by_name(self, name: str) -> Optional[FieldDefinition]:
        return next((f for f in self.fields if f.name == name), None)


class IntentDefinition(BaseModel):
    id: str
    name: str
    description: str
    target_form: str


class FormsConfig(BaseModel):
    intents: List[IntentDefinition]
    forms: List[FormDefinition]
    workflows: List[StepDefinition] = Field(default_factory=list)

    def form_by_id(self, form_id: str) -> Optional[FormDefinition]:
        return next((f for f in self.forms if f.id == form_id), None)


class ToolDefinition(BaseModel):
    name: str
    description: str
    http_method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"]
    url: HttpUrl
    headers: Dict[str, str] = Field(default_factory=dict)
    query_schema: Dict[str, Any] = Field(default_factory=dict)
    body_schema: Dict[str, Any] = Field(default_factory=dict)
    auth: Literal["none", "api_key", "bearer", "managed_identity"] = "none"
    role: Literal["pre-submit-validator", "data-enricher", "submit-form"]


class ToolsConfig(BaseModel):
    tools: List[ToolDefinition]

    def by_role(self, role: str) -> List[ToolDefinition]:
        return [t for t in self.tools if t.role == role]


class PersistenceConfig(BaseModel):
    storage_backend: Literal["none", "cosmos", "postgres", "mongo"] = "none"
    postgres_dsn: Optional[str] = None
    mongo_uri: Optional[str] = None
    enable_chat_logs: bool = True
    enable_config_versions: bool = True
    enable_cosmos: bool = False
    use_managed_identity: bool = False
    cosmos_account_uri: Optional[HttpUrl] = None
    cosmos_key: Optional[str] = None
    database: Optional[str] = None
    container: Optional[str] = None
    partition_key: Optional[str] = None
    enable_semantic_cache: bool = False
    redis_connection_string: Optional[str] = None
    redis_password: Optional[str] = None
    semantic_ttl_seconds: int = 3600


class LoggingConfig(BaseModel):
    emit_trace_logs: bool = True
    mode: Literal["console", "file", "appinsights"] = "console"
    level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"


class MessageRequest(BaseModel):
    thread_id: str
    message: str


class ChatResponse(BaseModel):
    reply: str
    state: Dict[str, Any]


class AgentState(TypedDict, total=False):
    thread_id: str
    messages: List[Dict[str, str]]
    last_user_message: Optional[str]
    current_intent: Optional[str]
    current_form_id: Optional[str]
    current_step_index: int
    form_values: Dict[str, Any]
    completed: bool
    awaiting_field: bool
