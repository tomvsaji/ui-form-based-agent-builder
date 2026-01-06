"use client";

import { useEffect, useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";

type Intent = { id: string; name: string; description: string; target_form: string };
type ToolCallConfig = {
  tool_name: string;
  input_map?: Record<string, string>;
  output_map?: Record<string, string>;
  output_path?: string | null;
};
type Field = {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "boolean" | "dropdown" | "enum" | "file";
  required?: boolean;
  dropdown_options?: string[];
  dropdown_tool?: string | null;
  dropdown_tool_config?: ToolCallConfig | null;
  tool_hook?: ToolCallConfig | null;
  pattern?: string;
  min_length?: number | null;
  max_length?: number | null;
  minimum?: number | null;
  maximum?: number | null;
  constraints?: {
    min_length?: number | null;
    max_length?: number | null;
    minimum?: number | null;
    maximum?: number | null;
    regex?: string | null;
  } | null;
  ui?: { placeholder?: string | null; help_text?: string | null; options?: string[] | null } | null;
};
type Form = {
  id: string;
  name: string;
  title?: string | null;
  description: string;
  submission_url?: string | null;
  submission?: {
    type: "api" | "tool";
    tool_name?: string | null;
    url?: string | null;
    http_method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | null;
    headers?: Record<string, string>;
    body_template?: Record<string, unknown>;
  } | null;
  mode: "step-by-step" | "one-shot";
  field_order: string[];
  fields: Field[];
  validators?: Array<{
    id: string;
    name: string;
    message: string;
    match?: "all" | "any";
    conditions?: Array<{ field: string; operator: string; value?: unknown }>;
  }>;
  version?: number;
};
type Tool = {
  name: string;
  description: string;
  http_method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  headers?: Record<string, string>;
  query_schema?: Record<string, unknown>;
  body_schema?: Record<string, unknown>;
  auth: "none" | "api_key" | "bearer" | "managed_identity";
  role: "pre-submit-validator" | "data-enricher" | "submit-form";
  cache_enabled?: boolean;
  cache_ttl_seconds?: number | null;
};

type ProjectConfig = {
  project_name: string;
  system_message: string;
  base_url: string;
  deploy_to_azure: boolean;
  azure_app_service?: {
    app_name?: string;
    resource_group?: string;
    region?: string;
    auth_mode?: string;
  } | null;
};

type KnowledgeBaseConfig = {
  enable_knowledge_base: boolean;
  provider: "azure_ai_search" | "pgvector" | "none";
  endpoint?: string | null;
  api_key?: string | null;
  index_name?: string | null;
  knowledge_base_id?: number | null;
  retrieval_mode: "single-pass" | "agentic";
  max_agentic_passes: number;
  use_semantic_ranker: boolean;
};

type FormsConfig = { intents: Intent[]; forms: Form[] };
type ToolsConfig = { tools: Tool[] };
type ThreadSummary = { thread_id: string; last_activity?: string | null };
type ThreadMessage = { role: string; content: string; created_at?: string | null };
type TraceLog = { trace_id: string; thread_id: string; version: number; data: Record<string, unknown>; created_at?: string | null };
type KnowledgeBase = { id: number; name: string; description: string; provider: string; created_at?: string | null };
type PersistenceConfig = {
  storage_backend?: "none" | "postgres" | "mongo" | "cosmos";
  postgres_dsn?: string | null;
  mongo_uri?: string | null;
  enable_chat_logs?: boolean;
  enable_config_versions?: boolean;
  enable_cosmos?: boolean;
  use_managed_identity?: boolean;
  cosmos_account_uri?: string | null;
  cosmos_key?: string | null;
  database?: string | null;
  container?: string | null;
  partition_key?: string | null;
  enable_semantic_cache?: boolean;
  redis_connection_string?: string | null;
  redis_password?: string | null;
  semantic_ttl_seconds?: number;
};
type LoggingConfig = { emit_trace_logs: boolean; mode: "console" | "file" | "appinsights"; level: "DEBUG" | "INFO" | "WARNING" | "ERROR" };

export default function Home() {
  const [project, setProject] = useState<ProjectConfig | null>(null);
  const [formsCfg, setFormsCfg] = useState<FormsConfig | null>(null);
  const [toolsCfg, setToolsCfg] = useState<ToolsConfig | null>(null);
  const [persistence, setPersistence] = useState<PersistenceConfig | null>(null);
  const [loggingCfg, setLoggingCfg] = useState<LoggingConfig | null>(null);
  const [knowledgeCfg, setKnowledgeCfg] = useState<KnowledgeBaseConfig | null>(null);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"configure" | "test" | "threads" | "traces" | "knowledge">("configure");
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string>("");
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [traces, setTraces] = useState<TraceLog[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [kbName, setKbName] = useState<string>("");
  const [kbDescription, setKbDescription] = useState<string>("");
  const [kbProvider, setKbProvider] = useState<"pgvector" | "azure_ai_search">("pgvector");
  const [kbDocContent, setKbDocContent] = useState<string>("");
  const [kbQuery, setKbQuery] = useState<string>("");
  const [kbResults, setKbResults] = useState<{ content: string; distance: number | null }[]>([]);
  const [kbFile, setKbFile] = useState<File | null>(null);
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, string>>({});

  const selectedForm = useMemo(
    () => formsCfg?.forms.find((f) => f.id === selectedFormId) || null,
    [formsCfg, selectedFormId]
  );

  const updateFieldDraft = (key: string, value: string) => {
    setFieldDrafts((prev) => ({ ...prev, [key]: value }));
  };

  const getFieldDraft = (key: string, fallback: string) => {
    return fieldDrafts[key] ?? fallback;
  };

  const parseJsonMap = (raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("JSON must be an object.");
      }
      return parsed as Record<string, string>;
    } catch (err) {
      setMessage(`Invalid JSON map: ${String(err)}`);
      return null;
    }
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [p, f, t, s, l, k] = await Promise.all(
        ["project", "forms", "tools", "persistence", "logging", "knowledge"].map((name) =>
          fetch(`${API_BASE}/config/${name}`).then((r) => r.json())
        )
      );
      setProject(p);
      setFormsCfg(f);
      setToolsCfg(t);
      setPersistence(s);
      setLoggingCfg(l);
      setKnowledgeCfg(k);
      setSelectedFormId(f.forms?.[0]?.id || null);
      setMessage("Loaded configs.");
    } catch (err) {
      setMessage(`Failed to load: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const loadThreads = async () => {
    try {
      const res = await fetch(`${API_BASE}/threads`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setThreads(data.threads || []);
      setMessage("Loaded threads.");
    } catch (err) {
      setMessage(`Failed to load threads: ${String(err)}`);
    }
  };

  const loadThreadMessages = async (threadId: string) => {
    if (!threadId) return;
    try {
      const res = await fetch(`${API_BASE}/threads/${threadId}/messages`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setThreadMessages(data.messages || []);
      setSelectedThreadId(threadId);
    } catch (err) {
      setMessage(`Failed to load thread: ${String(err)}`);
    }
  };

  const loadTraces = async (threadId?: string) => {
    try {
      const url = threadId ? `${API_BASE}/traces?thread_id=${encodeURIComponent(threadId)}` : `${API_BASE}/traces`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setTraces(data.traces || []);
    } catch (err) {
      setMessage(`Failed to load traces: ${String(err)}`);
    }
  };

  const loadKnowledgeBases = async () => {
    try {
      const res = await fetch(`${API_BASE}/knowledge-bases`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setKnowledgeBases(data.items || []);
    } catch (err) {
      setMessage(`Failed to load knowledge bases: ${String(err)}`);
    }
  };

  const createKnowledgeBase = async () => {
    if (!kbName.trim()) {
      setMessage("Knowledge base name is required.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/knowledge-bases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: kbName, description: kbDescription, provider: kbProvider }),
      });
      if (!res.ok) throw new Error(await res.text());
      setKbName("");
      setKbDescription("");
      await loadKnowledgeBases();
      setMessage("Knowledge base created.");
    } catch (err) {
      setMessage(`Create KB failed: ${String(err)}`);
    }
  };

  const addKnowledgeDocument = async (kbId: number) => {
    if (!kbDocContent.trim()) {
      setMessage("Document content is required.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/knowledge-bases/${kbId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: kbDocContent }),
      });
      if (!res.ok) throw new Error(await res.text());
      setKbDocContent("");
      setMessage("Document indexed.");
    } catch (err) {
      setMessage(`Indexing failed: ${String(err)}`);
    }
  };

  const uploadKnowledgeFile = async (kbId: number) => {
    if (!kbFile) {
      setMessage("Choose a file to upload.");
      return;
    }
    const formData = new FormData();
    formData.append("file", kbFile);
    try {
      const res = await fetch(`${API_BASE}/knowledge-bases/${kbId}/upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      setKbFile(null);
      setMessage("File indexed.");
    } catch (err) {
      setMessage(`Upload failed: ${String(err)}`);
    }
  };

  const searchKnowledgeBase = async (kbId: number) => {
    if (!kbQuery.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/knowledge-bases/${kbId}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: kbQuery, limit: 5 }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setKbResults(data.results || []);
    } catch (err) {
      setMessage(`Search failed: ${String(err)}`);
    }
  };

  const saveConfig = async (name: string, data: unknown) => {
    const res = await fetch(`${API_BASE}/config/${name}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
  };

  const saveAll = async () => {
    try {
      setLoading(true);
      await saveConfig("project", project);
      await saveConfig("forms", formsCfg);
      await saveConfig("tools", toolsCfg);
      await saveConfig("persistence", persistence);
      await saveConfig("logging", loggingCfg);
      await saveConfig("knowledge", knowledgeCfg);
      setMessage("Saved all configs.");
    } catch (err) {
      setMessage(`Save failed: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const publishConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/publish`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setMessage(`Published version ${data.version}.`);
    } catch (err) {
      setMessage(`Publish failed: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const updateFormField = (fieldName: string, updates: Partial<Field>) => {
    if (!formsCfg || !selectedForm) return;
    const updatedForms = formsCfg.forms.map((form) => {
      if (form.id !== selectedForm.id) return form;
      const updatedFields = form.fields.map((fld) => (fld.name === fieldName ? { ...fld, ...updates } : fld));
      let updatedOrder = [...form.field_order];
      if (updates.name && updates.name !== fieldName) {
        updatedOrder = updatedOrder.map((n) => (n === fieldName ? updates.name as string : n));
      }
      const forceStepByStep = updates.type === "dropdown" || updates.type === "enum";
      return {
        ...form,
        fields: updatedFields,
        field_order: updatedOrder,
        mode: forceStepByStep ? "step-by-step" : form.mode,
      };
    });
    setFormsCfg({ ...formsCfg, forms: updatedForms });
  };

  const addField = () => {
    if (!formsCfg || !selectedForm) return;
    const newField: Field = { name: `field_${Date.now()}`, label: "New field", type: "text", required: false };
    const updatedForms = formsCfg.forms.map((form) => {
      if (form.id !== selectedForm.id) return form;
      return {
        ...form,
        fields: [...form.fields, newField],
        field_order: [...form.field_order, newField.name],
      };
    });
    setFormsCfg({ ...formsCfg, forms: updatedForms });
  };

  const deleteField = (name: string) => {
    if (!formsCfg || !selectedForm) return;
    const updatedForms = formsCfg.forms.map((form) => {
      if (form.id !== selectedForm.id) return form;
      return {
        ...form,
        fields: form.fields.filter((f) => f.name !== name),
        field_order: form.field_order.filter((n) => n !== name),
      };
    });
    setFormsCfg({ ...formsCfg, forms: updatedForms });
  };

  const moveField = (name: string, direction: "up" | "down") => {
    if (!formsCfg || !selectedForm) return;
    const updatedForms = formsCfg.forms.map((form) => {
      if (form.id !== selectedForm.id) return form;
      const order = [...form.field_order];
      const idx = order.indexOf(name);
      if (idx === -1) return form;
      const swapWith = direction === "up" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= order.length) return form;
      [order[idx], order[swapWith]] = [order[swapWith], order[idx]];
      return { ...form, field_order: order };
    });
    setFormsCfg({ ...formsCfg, forms: updatedForms });
  };

  const upsertForm = (updates: Partial<Form>) => {
    if (!formsCfg || !selectedForm) return;
    const updatedForms = formsCfg.forms.map((form) => {
      if (form.id !== selectedForm.id) return form;
      const hasDropdown = form.fields.some((f) => f.type === "dropdown" || f.type === "enum");
      if (hasDropdown && updates.mode && updates.mode !== "step-by-step") {
        setMessage("Dropdown fields require step-by-step mode.");
        return { ...form, mode: "step-by-step" };
      }
      return { ...form, ...updates };
    });
    setFormsCfg({ ...formsCfg, forms: updatedForms });
  };

  const addForm = () => {
    if (!formsCfg) return;
    const newForm: Form = {
      id: `form_${Date.now()}`,
      name: "New Form",
      description: "",
      mode: "step-by-step",
      field_order: [],
      fields: [],
      submission_url: "",
    };
    const updated = { ...formsCfg, forms: [...formsCfg.forms, newForm] };
    setFormsCfg(updated);
    setSelectedFormId(newForm.id);
  };

  const deleteForm = (id: string) => {
    if (!formsCfg) return;
    const updated = { ...formsCfg, forms: formsCfg.forms.filter((f) => f.id !== id) };
    setFormsCfg(updated);
    if (selectedFormId === id) setSelectedFormId(updated.forms[0]?.id || null);
  };

  const updateIntent = (id: string, updates: Partial<Intent>) => {
    if (!formsCfg) return;
    const updated = formsCfg.intents.map((i) => (i.id === id ? { ...i, ...updates } : i));
    setFormsCfg({ ...formsCfg, intents: updated });
  };

  const addIntent = () => {
    if (!formsCfg) return;
    const newIntent: Intent = {
      id: `intent_${Date.now()}`,
      name: "New Intent",
      description: "",
      target_form: formsCfg.forms[0]?.id || "",
    };
    setFormsCfg({ ...formsCfg, intents: [...formsCfg.intents, newIntent] });
  };

  const deleteIntent = (id: string) => {
    if (!formsCfg) return;
    setFormsCfg({ ...formsCfg, intents: formsCfg.intents.filter((i) => i.id !== id) });
  };

  const updateTool = (name: string, updates: Partial<Tool>) => {
    if (!toolsCfg) return;
    const updated = toolsCfg.tools.map((t) => (t.name === name ? { ...t, ...updates } : t));
    setToolsCfg({ ...toolsCfg, tools: updated });
  };

  const addTool = () => {
    if (!toolsCfg) return;
    const newTool: Tool = {
      name: `tool_${Date.now()}`,
      description: "",
      http_method: "GET",
      url: "https://api.example.com",
      auth: "none",
      role: "data-enricher",
      headers: {},
      query_schema: {},
      body_schema: {},
      cache_enabled: false,
      cache_ttl_seconds: null,
    };
    setToolsCfg({ ...toolsCfg, tools: [...toolsCfg.tools, newTool] });
  };

  const deleteTool = (name: string) => {
    if (!toolsCfg) return;
    setToolsCfg({ ...toolsCfg, tools: toolsCfg.tools.filter((t) => t.name !== name) });
  };

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 16px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Agent Builder UI</h1>
          <p style={{ color: "#475569", margin: "4px 0" }}>
            Structured editor for project, intents, forms, tools, persistence, logging. API: {API_BASE}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn secondary" onClick={loadAll} disabled={loading}>
            Refresh
          </button>
          <button className="btn secondary" onClick={publishConfig} disabled={loading}>
            Publish version
          </button>
          <button className="btn" onClick={saveAll} disabled={loading}>
            Save all
          </button>
        </div>
      </header>

      {message && <div className="card" style={{ marginBottom: 12 }}>{message}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, alignItems: "start" }}>
        <aside className="card" style={{ position: "sticky", top: 24 }}>
          <div className="space-y-2">
            <button className="btn secondary" onClick={() => setActiveTab("configure")}>
              Configure flow
            </button>
            <button className="btn secondary" onClick={() => setActiveTab("test")}>
              Test bot
            </button>
            <button className="btn secondary" onClick={() => { setActiveTab("threads"); void loadThreads(); }}>
              View threads
            </button>
            <button className="btn secondary" onClick={() => { setActiveTab("traces"); void loadThreads(); void loadTraces(); }}>
              Inspect traces
            </button>
            <button className="btn secondary" onClick={() => { setActiveTab("knowledge"); void loadKnowledgeBases(); }}>
              Knowledge base
            </button>
          </div>
        </aside>

        <div>
          {activeTab === "configure" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16, marginBottom: 16 }}>
        <div className="card" style={{ minHeight: 240 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 0 }}>Project</h2>
          {project && (
            <div className="space-y-2">
              <input
                className="w-full"
                placeholder="Project name"
                value={project.project_name}
                onChange={(e) => setProject({ ...project, project_name: e.target.value })}
              />
              <textarea
                className="w-full"
                placeholder="System message"
                value={project.system_message}
                onChange={(e) => setProject({ ...project, system_message: e.target.value })}
              />
              <input
                className="w-full"
                placeholder="Base URL"
                value={project.base_url}
                onChange={(e) => setProject({ ...project, base_url: e.target.value })}
              />
              <label>
                <input
                  type="checkbox"
                  checked={project.deploy_to_azure}
                  onChange={(e) => setProject({ ...project, deploy_to_azure: e.target.checked })}
                />{" "}
                Deploy to Azure App Service
              </label>
              {project.deploy_to_azure && (
                <div className="grid grid-cols-3 gap-2">
                  <input
                    placeholder="App name"
                    value={project.azure_app_service?.app_name || ""}
                    onChange={(e) =>
                      setProject({
                        ...project,
                        azure_app_service: { ...(project.azure_app_service || {}), app_name: e.target.value },
                      })
                    }
                  />
                  <input
                    placeholder="Resource group"
                    value={project.azure_app_service?.resource_group || ""}
                    onChange={(e) =>
                      setProject({
                        ...project,
                        azure_app_service: { ...(project.azure_app_service || {}), resource_group: e.target.value },
                      })
                    }
                  />
                  <input
                    placeholder="Region"
                    value={project.azure_app_service?.region || ""}
                    onChange={(e) =>
                      setProject({
                        ...project,
                        azure_app_service: { ...(project.azure_app_service || {}), region: e.target.value },
                      })
                    }
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="card" style={{ minHeight: 240 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 0 }}>Intents</h2>
            <button className="btn secondary" onClick={addIntent}>
              + Add intent
            </button>
          </div>
          <div className="space-y-3">
            {formsCfg?.intents.map((intent) => (
              <div key={intent.id} className="border p-3 rounded">
                <div className="flex justify-between">
                  <input
                    value={intent.name}
                    onChange={(e) => updateIntent(intent.id, { name: e.target.value })}
                    placeholder="Intent name"
                  />
                  <button className="btn secondary" onClick={() => deleteIntent(intent.id)}>
                    Remove
                  </button>
                </div>
                <input
                  className="w-full mt-1"
                  value={intent.description}
                  onChange={(e) => updateIntent(intent.id, { description: e.target.value })}
                  placeholder="Description / routing hint"
                />
                <select
                  className="w-full mt-1"
                  value={intent.target_form}
                  onChange={(e) => updateIntent(intent.id, { target_form: e.target.value })}
                >
                  {formsCfg.forms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 0 }}>Forms</h2>
          <div className="space-x-2">
            <button className="btn secondary" onClick={addForm}>
              + Add form
            </button>
            {selectedForm && (
              <button className="btn secondary" onClick={() => deleteForm(selectedForm.id)}>
                Delete form
              </button>
            )}
          </div>
        </div>
        {formsCfg && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {formsCfg.forms.map((form) => (
                <button
                  key={form.id}
                  className={`btn secondary w-full ${form.id === selectedFormId ? "ring-2 ring-slate-800" : ""}`}
                  onClick={() => setSelectedFormId(form.id)}
                >
                  {form.name}
                </button>
              ))}
            </div>
            {selectedForm && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <input
                  className="w-full"
                  value={selectedForm.name}
                  onChange={(e) => upsertForm({ name: e.target.value })}
                  placeholder="Form name"
                />
                <textarea
                  className="w-full"
                  value={selectedForm.description}
                  onChange={(e) => upsertForm({ description: e.target.value })}
                  placeholder="Description"
                />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
                  <select
                    value={selectedForm.mode}
                    onChange={(e) => upsertForm({ mode: e.target.value as Form["mode"] })}
                    disabled={selectedForm.fields.some((f) => f.type === "dropdown" || f.type === "enum")}
                  >
                    <option value="step-by-step">Step-by-step</option>
                    <option value="one-shot">One-shot</option>
                  </select>
                  {selectedForm.fields.some((f) => f.type === "dropdown" || f.type === "enum") && (
                    <div className="text-sm text-slate-600">
                      Dropdown fields require step-by-step mode.
                    </div>
                  )}
                  <input
                    value={selectedForm.submission_url || ""}
                    onChange={(e) => upsertForm({ submission_url: e.target.value })}
                    placeholder="Submission URL (optional)"
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ fontWeight: 600, margin: 0 }}>Fields (drag via arrows)</h3>
                  <button className="btn secondary" onClick={addField}>
                    + Add field
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {selectedForm.field_order.map((fname) => {
                    const field = selectedForm.fields.find((f) => f.name === fname);
                    if (!field) return null;
                    const dropdownToolKey = `${selectedForm.id}:${fname}:dropdown_input`;
                    const hookInputKey = `${selectedForm.id}:${fname}:hook_input`;
                    const hookOutputKey = `${selectedForm.id}:${fname}:hook_output`;
                    return (
                      <div key={fname} className="border rounded p-3 space-y-2">
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <input
                            value={field.label}
                            onChange={(e) => updateFormField(fname, { label: e.target.value })}
                            placeholder="Label"
                          />
                          <div className="space-x-2">
                            <button className="btn secondary" onClick={() => moveField(fname, "up")}>
                              ↑
                            </button>
                            <button className="btn secondary" onClick={() => moveField(fname, "down")}>
                              ↓
                            </button>
                            <button className="btn secondary" onClick={() => deleteField(fname)}>
                              Delete
                            </button>
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                          <input
                            value={field.name}
                            onChange={(e) => updateFormField(fname, { name: e.target.value })}
                            placeholder="Field key"
                          />
                          <select
                            value={field.type}
                            onChange={(e) => updateFormField(fname, { type: e.target.value as Field["type"] })}
                          >
                            {["text", "number", "date", "boolean", "dropdown", "enum"].map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                        <label>
                          <input
                            type="checkbox"
                            checked={field.required || false}
                            onChange={(e) => updateFormField(fname, { required: e.target.checked })}
                          />{" "}
                          Required
                        </label>
                        {(field.type === "dropdown" || field.type === "enum") && (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                            <input
                              value={(field.dropdown_options || []).join(",")}
                              onChange={(e) =>
                                updateFormField(fname, { dropdown_options: e.target.value.split(",").map((s) => s.trim()) })
                              }
                              placeholder="Static options (comma separated)"
                            />
                            <select
                              value={field.dropdown_tool_config?.tool_name || field.dropdown_tool || ""}
                              onChange={(e) => {
                                const toolName = e.target.value || null;
                                updateFormField(fname, {
                                  dropdown_tool: toolName,
                                  dropdown_tool_config: toolName
                                    ? {
                                        tool_name: toolName,
                                        input_map: field.dropdown_tool_config?.input_map || {},
                                        output_path: field.dropdown_tool_config?.output_path || null,
                                      }
                                    : null,
                                });
                              }}
                            >
                              <option value="">Dropdown from tool (optional)</option>
                              {toolsCfg?.tools.map((t) => (
                                <option key={t.name} value={t.name}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        {(field.type === "dropdown" || field.type === "enum") && field.dropdown_tool_config?.tool_name && (
                          <div className="border rounded p-2 space-y-2">
                            <div className="text-sm font-medium">Dropdown tool mapping</div>
                            <textarea
                              value={getFieldDraft(
                                dropdownToolKey,
                                JSON.stringify(field.dropdown_tool_config?.input_map || {}, null, 2)
                              )}
                              onChange={(e) => updateFieldDraft(dropdownToolKey, e.target.value)}
                              onBlur={(e) => {
                                const parsed = parseJsonMap(e.target.value);
                                if (!parsed) return;
                                updateFormField(fname, {
                                  dropdown_tool_config: {
                                    ...(field.dropdown_tool_config || { tool_name: "" }),
                                    input_map: parsed,
                                  },
                                });
                              }}
                              placeholder='{"query":"form.company"}'
                            />
                            <input
                              value={field.dropdown_tool_config?.output_path || ""}
                              onChange={(e) =>
                                updateFormField(fname, {
                                  dropdown_tool_config: {
                                    ...(field.dropdown_tool_config || { tool_name: "" }),
                                    output_path: e.target.value || null,
                                  },
                                })
                              }
                              placeholder="Options output path (optional, e.g. data.items)"
                            />
                          </div>
                        )}
                        <div className="border rounded p-2 space-y-2">
                          <div className="text-sm font-medium">Tool hook (optional)</div>
                          <select
                            value={field.tool_hook?.tool_name || ""}
                            onChange={(e) => {
                              const toolName = e.target.value || null;
                              updateFormField(fname, {
                                tool_hook: toolName
                                  ? {
                                      tool_name: toolName,
                                      input_map: field.tool_hook?.input_map || {},
                                      output_map: field.tool_hook?.output_map || {},
                                    }
                                  : null,
                              });
                            }}
                          >
                            <option value="">No tool hook</option>
                            {toolsCfg?.tools.map((t) => (
                              <option key={t.name} value={t.name}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                          {field.tool_hook?.tool_name && (
                            <>
                              <textarea
                                value={getFieldDraft(
                                  hookInputKey,
                                  JSON.stringify(field.tool_hook?.input_map || {}, null, 2)
                                )}
                                onChange={(e) => updateFieldDraft(hookInputKey, e.target.value)}
                                onBlur={(e) => {
                                  const parsed = parseJsonMap(e.target.value);
                                  if (!parsed) return;
                                  updateFormField(fname, {
                                    tool_hook: {
                                      ...(field.tool_hook || { tool_name: "" }),
                                      input_map: parsed,
                                      output_map: field.tool_hook?.output_map || {},
                                    },
                                  });
                                }}
                                placeholder='{"customer_id":"form.customer_id"}'
                              />
                              <textarea
                                value={getFieldDraft(
                                  hookOutputKey,
                                  JSON.stringify(field.tool_hook?.output_map || {}, null, 2)
                                )}
                                onChange={(e) => updateFieldDraft(hookOutputKey, e.target.value)}
                                onBlur={(e) => {
                                  const parsed = parseJsonMap(e.target.value);
                                  if (!parsed) return;
                                  updateFormField(fname, {
                                    tool_hook: {
                                      ...(field.tool_hook || { tool_name: "" }),
                                      input_map: field.tool_hook?.input_map || {},
                                      output_map: parsed,
                                    },
                                  });
                                }}
                                placeholder='{"plan_name":"plan.name"}'
                              />
                            </>
                          )}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
                          <input
                            value={field.pattern || ""}
                            onChange={(e) => updateFormField(fname, { pattern: e.target.value })}
                            placeholder="Regex pattern"
                          />
                          <input
                            type="number"
                            value={field.min_length ?? ""}
                            onChange={(e) => updateFormField(fname, { min_length: Number(e.target.value) || null })}
                            placeholder="Min length"
                          />
                          <input
                            type="number"
                            value={field.max_length ?? ""}
                            onChange={(e) => updateFormField(fname, { max_length: Number(e.target.value) || null })}
                            placeholder="Max length"
                          />
                          <input
                            type="number"
                            value={field.minimum ?? ""}
                            onChange={(e) => updateFormField(fname, { minimum: Number(e.target.value) || null })}
                            placeholder="Min value"
                          />
                          <input
                            type="number"
                            value={field.maximum ?? ""}
                            onChange={(e) => updateFormField(fname, { maximum: Number(e.target.value) || null })}
                            placeholder="Max value"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 0 }}>Tools</h2>
          <button className="btn secondary" onClick={addTool}>
            + Add tool
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          {toolsCfg?.tools.map((tool) => (
            <div key={tool.name} className="border rounded p-3 space-y-2">
              <div className="flex justify-between items-center">
                <input value={tool.name} onChange={(e) => updateTool(tool.name, { name: e.target.value })} />
                <button className="btn secondary" onClick={() => deleteTool(tool.name)}>
                  Remove
                </button>
              </div>
              <input
                className="w-full"
                value={tool.description}
                onChange={(e) => updateTool(tool.name, { description: e.target.value })}
                placeholder="Description"
              />
              <input
                className="w-full"
                value={tool.url}
                onChange={(e) => updateTool(tool.name, { url: e.target.value })}
                placeholder="URL"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={tool.http_method}
                  onChange={(e) => updateTool(tool.name, { http_method: e.target.value as Tool["http_method"] })}
                >
                  {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
                <select
                  value={tool.auth}
                  onChange={(e) => updateTool(tool.name, { auth: e.target.value as Tool["auth"] })}
                >
                  <option value="none">None</option>
                  <option value="api_key">API key</option>
                  <option value="bearer">Bearer</option>
                  <option value="managed_identity">Managed identity</option>
                </select>
                <select
                  value={tool.role}
                  onChange={(e) => updateTool(tool.name, { role: e.target.value as Tool["role"] })}
                >
                  <option value="pre-submit-validator">Pre-submit validator</option>
                  <option value="data-enricher">Data enricher</option>
                  <option value="submit-form">Submit form</option>
                </select>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={tool.cache_enabled || false}
                    onChange={(e) => updateTool(tool.name, { cache_enabled: e.target.checked })}
                  />
                  Cache responses
                </label>
                <input
                  type="number"
                  placeholder="Cache TTL (seconds)"
                  value={tool.cache_ttl_seconds ?? ""}
                  onChange={(e) =>
                    updateTool(tool.name, { cache_ttl_seconds: Number(e.target.value) || null })
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 0 }}>Knowledge base</h2>
        {knowledgeCfg && (
          <div className="space-y-3">
            <label>
              <input
                type="checkbox"
                checked={knowledgeCfg.enable_knowledge_base}
                onChange={(e) => setKnowledgeCfg({ ...knowledgeCfg, enable_knowledge_base: e.target.checked })}
              />{" "}
              Enable FAQ / AI search knowledge base
            </label>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={knowledgeCfg.provider}
                onChange={(e) => setKnowledgeCfg({ ...knowledgeCfg, provider: e.target.value as KnowledgeBaseConfig["provider"] })}
              >
                <option value="azure_ai_search">Azure AI Search</option>
                <option value="pgvector">Postgres pgvector</option>
                <option value="none">None</option>
              </select>
              <input
                type="number"
                placeholder="Default KB ID (optional)"
                value={knowledgeCfg.knowledge_base_id ?? ""}
                onChange={(e) =>
                  setKnowledgeCfg({
                    ...knowledgeCfg,
                    knowledge_base_id: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
              <select
                value={knowledgeCfg.retrieval_mode}
                onChange={(e) =>
                  setKnowledgeCfg({ ...knowledgeCfg, retrieval_mode: e.target.value as KnowledgeBaseConfig["retrieval_mode"] })
                }
              >
                <option value="single-pass">Single-pass retrieval</option>
                <option value="agentic">Agentic multi-step retrieval</option>
              </select>
            </div>
            <input
              className="w-full"
              placeholder="Search endpoint"
              value={knowledgeCfg.endpoint || ""}
              onChange={(e) => setKnowledgeCfg({ ...knowledgeCfg, endpoint: e.target.value })}
            />
            <input
              className="w-full"
              placeholder="Index name"
              value={knowledgeCfg.index_name || ""}
              onChange={(e) => setKnowledgeCfg({ ...knowledgeCfg, index_name: e.target.value })}
            />
            <input
              className="w-full"
              type="password"
              placeholder="API key"
              value={knowledgeCfg.api_key || ""}
              onChange={(e) => setKnowledgeCfg({ ...knowledgeCfg, api_key: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2 items-center">
              <label>Max agentic passes (for iterative retrieval)</label>
              <input
                type="number"
                min={1}
                value={knowledgeCfg.max_agentic_passes}
                onChange={(e) => setKnowledgeCfg({ ...knowledgeCfg, max_agentic_passes: Number(e.target.value) || 1 })}
              />
            </div>
            <label>
              <input
                type="checkbox"
                checked={knowledgeCfg.use_semantic_ranker}
                onChange={(e) => setKnowledgeCfg({ ...knowledgeCfg, use_semantic_ranker: e.target.checked })}
              />{" "}
              Use semantic ranker
            </label>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        <div className="card">
          <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 0 }}>Persistence</h2>
          {persistence && (
            <div className="space-y-2">
              <label>
                <input
                  type="checkbox"
                  checked={persistence.enable_cosmos}
                  onChange={(e) => setPersistence({ ...persistence, enable_cosmos: e.target.checked })}
                />{" "}
                Enable Cosmos DB
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={persistence.use_managed_identity}
                  onChange={(e) => setPersistence({ ...persistence, use_managed_identity: e.target.checked })}
                />{" "}
                Use managed identity
              </label>
              <input
                className="w-full"
                placeholder="Cosmos URI"
                value={persistence.cosmos_account_uri || ""}
                onChange={(e) => setPersistence({ ...persistence, cosmos_account_uri: e.target.value })}
              />
              {!persistence.use_managed_identity && (
                <input
                  className="w-full"
                  placeholder="Cosmos key"
                  value={persistence.cosmos_key || ""}
                  onChange={(e) => setPersistence({ ...persistence, cosmos_key: e.target.value })}
                />
              )}
              <div className="grid grid-cols-3 gap-2">
                <input
                  placeholder="Database"
                  value={persistence.database || ""}
                  onChange={(e) => setPersistence({ ...persistence, database: e.target.value })}
                />
                <input
                  placeholder="Container"
                  value={persistence.container || ""}
                  onChange={(e) => setPersistence({ ...persistence, container: e.target.value })}
                />
                <input
                  placeholder="Partition key"
                  value={persistence.partition_key || ""}
                  onChange={(e) => setPersistence({ ...persistence, partition_key: e.target.value })}
                />
              </div>
              <div className="border rounded p-2 space-y-2">
                <label>
                  <input
                    type="checkbox"
                    checked={persistence.enable_semantic_cache}
                    onChange={(e) => setPersistence({ ...persistence, enable_semantic_cache: e.target.checked })}
                  />{" "}
                  Enable semantic caching (Azure Cache for Redis)
                </label>
                {persistence.enable_semantic_cache && (
                  <div className="space-y-2">
                    <input
                      className="w-full"
                      placeholder="Redis connection string"
                      value={persistence.redis_connection_string || ""}
                      onChange={(e) => setPersistence({ ...persistence, redis_connection_string: e.target.value })}
                    />
                    <input
                      className="w-full"
                      placeholder="Redis password"
                      type="password"
                      value={persistence.redis_password || ""}
                      onChange={(e) => setPersistence({ ...persistence, redis_password: e.target.value })}
                    />
                    <div className="grid grid-cols-2 gap-2 items-center">
                      <label>Semantic TTL (seconds)</label>
                      <input
                        type="number"
                        value={persistence.semantic_ttl_seconds}
                        onChange={(e) =>
                          setPersistence({ ...persistence, semantic_ttl_seconds: Number(e.target.value) || 0 })
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 0 }}>Logging</h2>
          {loggingCfg && (
            <div className="space-y-2">
              <label>
                <input
                  type="checkbox"
                  checked={loggingCfg.emit_trace_logs}
                  onChange={(e) => setLoggingCfg({ ...loggingCfg, emit_trace_logs: e.target.checked })}
                />{" "}
                Emit trace logs
              </label>
              <select value={loggingCfg.mode} onChange={(e) => setLoggingCfg({ ...loggingCfg, mode: e.target.value as LoggingConfig["mode"] })}>
                <option value="console">Console</option>
                <option value="file">File</option>
                <option value="appinsights">Azure App Insights</option>
              </select>
              <select value={loggingCfg.level} onChange={(e) => setLoggingCfg({ ...loggingCfg, level: e.target.value as LoggingConfig["level"] })}>
                {["DEBUG", "INFO", "WARNING", "ERROR"].map((lvl) => (
                  <option key={lvl}>{lvl}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
            </>
          )}

          {activeTab === "test" && (
            <div className="card">
              <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 0 }}>Test the bot</h2>
              <p>Open the chat tester to run messages against the published runtime.</p>
              <a className="btn secondary" href="/chat">
                Open chat tester
              </a>
            </div>
          )}

          {activeTab === "threads" && (
            <div className="card space-y-2">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 0 }}>Chat threads</h2>
                <button className="btn secondary" onClick={loadThreads}>
                  Refresh threads
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  {threads.length === 0 && <p>No threads yet.</p>}
                  {threads.map((t) => (
                    <button
                      key={t.thread_id}
                      className="btn secondary"
                      onClick={() => loadThreadMessages(t.thread_id)}
                    >
                      {t.thread_id}
                    </button>
                  ))}
                </div>
                <div className="space-y-2">
                  {selectedThreadId && (
                    <div className="text-sm text-slate-600">Thread: {selectedThreadId}</div>
                  )}
                  {threadMessages.map((m, idx) => (
                    <div key={idx} className="border rounded p-3">
                      <div style={{ fontWeight: 600 }}>{m.role}</div>
                      <div>{m.content}</div>
                      {m.created_at && <div className="text-sm text-slate-500">{m.created_at}</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "traces" && (
            <div className="card space-y-2">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 0 }}>Trace logs</h2>
                <button className="btn secondary" onClick={() => loadTraces(selectedThreadId || undefined)}>
                  Refresh traces
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <div className="text-sm text-slate-600">Threads</div>
                  {threads.length === 0 && <p>No threads yet.</p>}
                  {threads.map((t) => (
                    <button
                      key={t.thread_id}
                      className={`btn secondary w-full ${selectedThreadId === t.thread_id ? "ring-2 ring-slate-800" : ""}`}
                      onClick={() => {
                        setSelectedThreadId(t.thread_id);
                        void loadTraces(t.thread_id);
                      }}
                    >
                      {t.thread_id}
                    </button>
                  ))}
                </div>
                <div className="space-y-2 col-span-2">
                  {selectedThreadId && (
                    <div className="text-sm text-slate-600">Thread: {selectedThreadId}</div>
                  )}
                  {traces.length === 0 && <p>No trace logs yet.</p>}
                  {traces.map((trace) => {
                    const data = trace.data || {};
                    const input = data.input || "";
                    const output = data.output || "";
                    const tokens = data.tokens || {};
                    const tools = data.tools || {};
                    const events = data.events || [];
                    const state = data.state || {};
                    return (
                      <div key={trace.trace_id} className="border rounded p-3 space-y-2">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontWeight: 600 }}>Trace {trace.trace_id}</div>
                            <div className="text-sm text-slate-600">
                              Version: {trace.version}
                              {trace.created_at ? ` · ${trace.created_at}` : ""}
                            </div>
                          </div>
                        </div>
                        <div className="text-sm">
                          <strong>Input:</strong> {String(input).slice(0, 160)}
                        </div>
                        <div className="text-sm">
                          <strong>Output:</strong> {String(output).slice(0, 160)}
                        </div>
                        <details className="border rounded p-2">
                          <summary className="cursor-pointer font-medium">Input</summary>
                          <pre style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{JSON.stringify(input, null, 2)}</pre>
                        </details>
                        <details className="border rounded p-2">
                          <summary className="cursor-pointer font-medium">Output</summary>
                          <pre style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{JSON.stringify(output, null, 2)}</pre>
                        </details>
                        <details className="border rounded p-2">
                          <summary className="cursor-pointer font-medium">Tokens</summary>
                          <pre style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{JSON.stringify(tokens, null, 2)}</pre>
                        </details>
                        <details className="border rounded p-2">
                          <summary className="cursor-pointer font-medium">Tools</summary>
                          <pre style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{JSON.stringify(tools, null, 2)}</pre>
                        </details>
                        <details className="border rounded p-2">
                          <summary className="cursor-pointer font-medium">Events</summary>
                          {Array.isArray(events) && events.length > 0 ? (
                            <div className="space-y-2" style={{ marginTop: 8 }}>
                              {events.map((evt: any, idx: number) => {
                                const title = evt?.node || evt?.stage || `event_${idx + 1}`;
                                return (
                                  <details key={`${trace.trace_id}-evt-${idx}`} className="border rounded p-2">
                                    <summary className="cursor-pointer text-sm font-medium">
                                      {title}
                                      {evt?.ts ? ` · ${new Date(evt.ts * 1000).toLocaleTimeString()}` : ""}
                                    </summary>
                                    <pre style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                                      {JSON.stringify(evt, null, 2)}
                                    </pre>
                                  </details>
                                );
                              })}
                            </div>
                          ) : (
                            <pre style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{JSON.stringify(events, null, 2)}</pre>
                          )}
                        </details>
                        <details className="border rounded p-2">
                          <summary className="cursor-pointer font-medium">State</summary>
                          <pre style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{JSON.stringify(state, null, 2)}</pre>
                        </details>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === "knowledge" && (
            <div className="space-y-3">
              <div className="card">
                <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 0 }}>Knowledge bases</h2>
                <div className="space-y-2">
                <input
                  className="w-full"
                  placeholder="Knowledge base name"
                  value={kbName}
                  onChange={(e) => setKbName(e.target.value)}
                />
                <select value={kbProvider} onChange={(e) => setKbProvider(e.target.value as "pgvector" | "azure_ai_search")}>
                  <option value="pgvector">Postgres pgvector</option>
                  <option value="azure_ai_search">Azure AI Search</option>
                </select>
                <textarea
                  className="w-full"
                  placeholder="Description"
                  value={kbDescription}
                  onChange={(e) => setKbDescription(e.target.value)}
                  />
                  <button className="btn secondary" onClick={createKnowledgeBase}>
                    Create knowledge base
                  </button>
                </div>
                <div className="space-y-2" style={{ marginTop: 12 }}>
                  {knowledgeBases.length === 0 && <p>No knowledge bases yet.</p>}
                  {knowledgeBases.map((kb) => (
                    <div key={kb.id} className="border rounded p-3">
                      <div style={{ fontWeight: 600 }}>{kb.name}</div>
                      <div className="text-sm text-slate-600">{kb.description}</div>
                      <div className="space-y-2" style={{ marginTop: 8 }}>
                        <input
                          type="file"
                          accept=".txt,.md,.pdf"
                          onChange={(e) => setKbFile(e.target.files?.[0] || null)}
                        />
                        <button className="btn secondary" onClick={() => uploadKnowledgeFile(kb.id)}>
                          Upload file
                        </button>
                        <textarea
                          className="w-full"
                          placeholder="Paste content to index"
                          value={kbDocContent}
                          onChange={(e) => setKbDocContent(e.target.value)}
                        />
                        <button className="btn secondary" onClick={() => addKnowledgeDocument(kb.id)}>
                          Index content
                        </button>
                        <input
                          className="w-full"
                          placeholder="Search query"
                          value={kbQuery}
                          onChange={(e) => setKbQuery(e.target.value)}
                        />
                        <button className="btn secondary" onClick={() => searchKnowledgeBase(kb.id)}>
                          Search
                        </button>
                        {kbResults.length > 0 && (
                          <div className="space-y-2">
                            {kbResults.map((r, idx) => (
                              <div key={idx} className="border rounded p-2">
                                <div className="text-sm text-slate-600">Distance: {r.distance ?? "n/a"}</div>
                                <div>{r.content}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
