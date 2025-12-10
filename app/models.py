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


class FieldDefinition(BaseModel):
    name: str
    label: str
    type: Literal["text", "number", "date", "boolean", "dropdown"]
    required: bool = False
    dropdown_options: Optional[List[str]] = None
    dropdown_tool: Optional[str] = None
    pattern: Optional[str] = None
    min_length: Optional[int] = Field(default=None, ge=0)
    max_length: Optional[int] = Field(default=None, ge=0)
    minimum: Optional[float] = None
    maximum: Optional[float] = None
    llm_validation_prompt: Optional[str] = None


class FormDefinition(BaseModel):
    id: str
    name: str
    description: str
    submission_url: Optional[HttpUrl] = None
    mode: Literal["step-by-step", "one-shot"] = "step-by-step"
    field_order: List[str]
    fields: List[FieldDefinition]

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
    enable_cosmos: bool = False
    use_managed_identity: bool = False
    cosmos_account_uri: Optional[HttpUrl] = None
    cosmos_key: Optional[str] = None
    database: Optional[str] = None
    container: Optional[str] = None
    partition_key: Optional[str] = None


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
