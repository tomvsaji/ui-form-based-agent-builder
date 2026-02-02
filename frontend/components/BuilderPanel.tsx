"use client";

import { useEffect, useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";

type Intent = { id: string; name: string; description: string; target_form: string };
type Field = {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "boolean" | "dropdown" | "enum" | "file";
  required?: boolean;
  dropdown_options?: string[];
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
  submission_url: string;
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
type BuilderTab = "configure" | "test" | "threads" | "traces" | "knowledge";
type ThreadSummary = { thread_id: string; last_activity?: string | null };
type ThreadMessage = { role: string; content: string; created_at?: string | null };
type TraceLog = { trace_id: string; thread_id: string; version: number; data: Record<string, unknown>; created_at?: string | null };
type PublishedVersion = { version: number; created_at?: string | null };
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

export function BuilderPanel() {
  const [project, setProject] = useState<ProjectConfig | null>(null);
  const [formsCfg, setFormsCfg] = useState<FormsConfig | null>(null);
  const [persistence, setPersistence] = useState<PersistenceConfig | null>(null);
  const [loggingCfg, setLoggingCfg] = useState<LoggingConfig | null>(null);
  const [knowledgeCfg, setKnowledgeCfg] = useState<KnowledgeBaseConfig | null>(null);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<BuilderTab>("configure");
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [threadSearch, setThreadSearch] = useState<string>("");
  const [selectedThreadId, setSelectedThreadId] = useState<string>("");
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [traces, setTraces] = useState<TraceLog[]>([]);
  const [publishedVersions, setPublishedVersions] = useState<PublishedVersion[]>([]);
  const [versionConfigs, setVersionConfigs] = useState<Record<number, Record<string, unknown> | null>>({});
  const [loadingVersions, setLoadingVersions] = useState<boolean>(false);
  const [loadingVersionId, setLoadingVersionId] = useState<number | null>(null);

  const selectedForm = useMemo(
    () => formsCfg?.forms.find((f) => f.id === selectedFormId) || null,
    [formsCfg, selectedFormId]
  );

  const loadAll = async () => {
    setLoading(true);
    try {
      const [p, f, s, l, k] = await Promise.all(
        ["project", "forms", "persistence", "logging", "knowledge"].map((name) =>
          fetch(`${API_BASE}/config/${name}`).then((r) => r.json())
        )
      );
      setProject(p);
      setFormsCfg(f);
      setPersistence(s);
      setLoggingCfg(l ? { ...l, emit_trace_logs: true } : l);
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

  useEffect(() => {
    if (activeTab === "configure") {
      void loadPublishedVersions();
    }
  }, [activeTab]);

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
      void loadTraces(threadId);
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

  useEffect(() => {
    if (activeTab === "threads") {
      void loadThreads();
    } else if (activeTab === "traces") {
      void loadThreads();
      void loadTraces();
    }
  }, [activeTab]);

  const loadPublishedVersions = async () => {
    setLoadingVersions(true);
    try {
      const res = await fetch(`${API_BASE}/versions`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPublishedVersions(data.versions || []);
    } catch (err) {
      setMessage(`Failed to load versions: ${String(err)}`);
    } finally {
      setLoadingVersions(false);
    }
  };

  const loadPublishedVersionConfig = async (version: number) => {
    setLoadingVersionId(version);
    try {
      const res = await fetch(`${API_BASE}/versions/${version}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setVersionConfigs((prev) => ({ ...prev, [version]: data }));
    } catch (err) {
      setMessage(`Failed to load version ${version}: ${String(err)}`);
    } finally {
      setLoadingVersionId(null);
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
      const missingWebhook = formsCfg?.forms.find((form) => !form.submission_url?.trim());
      if (missingWebhook) {
        setMessage(`Submission webhook URL required for form: ${missingWebhook.name}`);
        return;
      }
      const invalidWebhook = formsCfg?.forms.find((form) => {
        try {
          new URL(form.submission_url);
          return false;
        } catch {
          return true;
        }
      });
      if (invalidWebhook) {
        setMessage(`Submission webhook URL must be a valid URL for form: ${invalidWebhook.name}`);
        return;
      }
      setLoading(true);
      await saveConfig("project", project);
      await saveConfig("forms", formsCfg);
      await saveConfig("persistence", persistence);
      await saveConfig("logging", loggingCfg ? { ...loggingCfg, emit_trace_logs: true } : loggingCfg);
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

  const formatEventTime = (ts?: number) => {
    if (!ts) return "";
    return new Date(ts * 1000).toLocaleTimeString();
  };

  const renderEventDetail = (evt: any, idx: number) => {
    const title = evt?.node || evt?.event || `event_${idx + 1}`;
    const phase = evt?.phase ? ` · ${evt.phase}` : "";
    const timestamp = formatEventTime(evt?.ts);
    const input = evt?.input;
    const output = evt?.output;
    const llm = evt?.llm;
    const error = evt?.error;
    return (
      <details key={`evt-${idx}`} className="border rounded p-2">
        <summary className="cursor-pointer text-sm font-medium">
          {title}
          {phase}
          {timestamp ? ` · ${timestamp}` : ""}
        </summary>
        <div className="space-y-2" style={{ marginTop: 8 }}>
          {error && (
            <div className="border rounded p-2 text-sm" style={{ background: "#fef2f2", borderColor: "#fecaca" }}>
              <strong>Error:</strong> {String(error)}
            </div>
          )}
          {input !== undefined && (
            <div className="border rounded p-2 text-sm" style={{ background: "#f8fafc" }}>
              <div className="text-slate-600">Input</div>
              <pre style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{JSON.stringify(input, null, 2)}</pre>
            </div>
          )}
          {output !== undefined && (
            <div className="border rounded p-2 text-sm" style={{ background: "#f8fafc" }}>
              <div className="text-slate-600">Output</div>
              <pre style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{JSON.stringify(output, null, 2)}</pre>
            </div>
          )}
          {llm && (
            <div className="border rounded p-2 text-sm" style={{ background: "#f0fdf4", borderColor: "#bbf7d0" }}>
              <div className="text-slate-600">LLM</div>
              <pre style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{JSON.stringify(llm, null, 2)}</pre>
            </div>
          )}
        </div>
      </details>
    );
  };

  return (
    <main className="builder-legacy" style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 16px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Agent Builder UI</h1>
          <p style={{ color: "#475569", margin: "4px 0" }}>
            Structured editor for project, intents, forms, and logging. API: {API_BASE}
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
          </div>
        </aside>

        <div>
          {activeTab === "configure" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16, marginBottom: 16 }}>
        <div className="card" style={{ minHeight: 240 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 0 }}>Project</h2>
          <p className="text-sm text-slate-600">Define the bot’s identity, base URL, and deployment metadata.</p>
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
          <p className="text-sm text-slate-600">Route user requests to a form by matching on intent.</p>
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
        <p className="text-sm text-slate-600">Define fields and the webhook URL used to submit captured data.</p>
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
                    placeholder="Submission webhook URL"
                    required
                  />
                  <div className="text-sm text-slate-600">Required. Runtime calls this URL when the form is completed.</div>
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
                          </div>
                        )}
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
          <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 0 }}>Published versions</h2>
          <button className="btn secondary" onClick={loadPublishedVersions} disabled={loadingVersions}>
            {loadingVersions ? "Loading..." : "Refresh"}
          </button>
        </div>
        <p className="text-sm text-slate-600">Browse older published bot versions and inspect their configs.</p>
        <div className="space-y-2">
          {publishedVersions.length === 0 && <div className="text-sm text-slate-600">No published versions yet.</div>}
          {publishedVersions.map((item) => (
            <details key={item.version} className="border rounded p-2">
              <summary className="cursor-pointer text-sm font-medium">
                Version {item.version}
                {item.created_at ? ` · ${item.created_at}` : ""}
              </summary>
              <div className="space-y-2" style={{ marginTop: 8 }}>
                <button
                  className="btn secondary"
                  onClick={() => loadPublishedVersionConfig(item.version)}
                  disabled={loadingVersionId === item.version}
                >
                  {loadingVersionId === item.version ? "Loading..." : "Load config"}
                </button>
                {versionConfigs[item.version] && (
                  <pre style={{ whiteSpace: "pre-wrap" }}>
                    {JSON.stringify(versionConfigs[item.version], null, 2)}
                  </pre>
                )}
              </div>
            </details>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 0 }}>Logging</h2>
        <p className="text-sm text-slate-600">Controls how runtime logs and trace events are stored.</p>
        {loggingCfg && (
          <div className="space-y-2">
            <select
              value={loggingCfg.mode}
              onChange={(e) => setLoggingCfg({ ...loggingCfg, mode: e.target.value as LoggingConfig["mode"] })}
            >
              <option value="console">Console</option>
              <option value="file">File</option>
              <option value="appinsights">Azure App Insights</option>
            </select>
            <select
              value={loggingCfg.level}
              onChange={(e) => setLoggingCfg({ ...loggingCfg, level: e.target.value as LoggingConfig["level"] })}
            >
              {["DEBUG", "INFO", "WARNING", "ERROR"].map((lvl) => (
                <option key={lvl}>{lvl}</option>
              ))}
            </select>
          </div>
        )}
      </div>
            </>
          )}

          {activeTab === "test" && (
            <div className="card">
              <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 0 }}>Test the bot</h2>
              <p>Use the chat panel on the right to test responses.</p>
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
              <p className="text-sm text-slate-600">Search threads by ID and inspect conversation history.</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <input
                    className="w-full"
                    placeholder="Filter by thread id"
                    value={threadSearch}
                    onChange={(e) => setThreadSearch(e.target.value)}
                  />
                  {threads.length === 0 && <p>No threads yet.</p>}
                  {threads
                    .filter((t) => t.thread_id.toLowerCase().includes(threadSearch.trim().toLowerCase()))
                    .map((t) => (
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
              <p className="text-sm text-slate-600">Click a trace to expand the full inputs, outputs, and state.</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <div className="text-sm text-slate-600">Threads</div>
                  {threads.length === 0 && <p>No threads yet.</p>}
                  <input
                    className="w-full"
                    placeholder="Filter by thread id"
                    value={threadSearch}
                    onChange={(e) => setThreadSearch(e.target.value)}
                  />
                  {threads
                    .filter((t) => t.thread_id.toLowerCase().includes(threadSearch.trim().toLowerCase()))
                    .map((t) => (
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
                    const events = data.events || [];
                    const stateBefore = data.state_before || {};
                    const stateAfter = data.state_after || data.state || {};
                    const tokenSummary = Object.entries(tokens as Record<string, unknown>)
                      .map(([key, value]) => `${key}: ${String(value)}`)
                      .join(", ");
                    return (
                      <details key={trace.trace_id} className="border rounded p-3">
                        <summary className="cursor-pointer">
                          <div style={{ fontWeight: 600 }}>Trace {trace.trace_id}</div>
                          <div className="text-sm text-slate-600">
                            Version: {trace.version}
                            {trace.created_at ? ` · ${trace.created_at}` : ""}
                          </div>
                          <div className="text-sm text-slate-600">Input: {String(input).slice(0, 120)}</div>
                        </summary>
                        <div className="space-y-2" style={{ marginTop: 8 }}>
                          <div className="text-sm">
                            <strong>Input:</strong> {String(input).slice(0, 160)}
                          </div>
                          <div className="text-sm">
                            <strong>Output:</strong> {String(output).slice(0, 160)}
                          </div>
                          {tokenSummary && (
                            <div className="text-sm">
                              <strong>Tokens:</strong> {tokenSummary}
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="border rounded p-2 text-sm" style={{ background: "#f8fafc" }}>
                              <div className="text-slate-600">Input</div>
                              <pre style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{JSON.stringify(input, null, 2)}</pre>
                            </div>
                            <div className="border rounded p-2 text-sm" style={{ background: "#f8fafc" }}>
                              <div className="text-slate-600">Output</div>
                              <pre style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{JSON.stringify(output, null, 2)}</pre>
                            </div>
                          </div>
                          <details className="border rounded p-2">
                            <summary className="cursor-pointer font-medium">Event timeline</summary>
                            <div className="space-y-2" style={{ marginTop: 8 }}>
                              {Array.isArray(events) && events.length > 0 ? (
                                events.map((evt: any, idx: number) => renderEventDetail(evt, idx))
                              ) : (
                                <div className="text-sm text-slate-600">No events recorded.</div>
                              )}
                            </div>
                          </details>
                          <details className="border rounded p-2">
                            <summary className="cursor-pointer font-medium">Tokens</summary>
                            <pre style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{JSON.stringify(tokens, null, 2)}</pre>
                          </details>
                          <details className="border rounded p-2">
                            <summary className="cursor-pointer font-medium">State before</summary>
                            <pre style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                              {JSON.stringify(stateBefore, null, 2)}
                            </pre>
                          </details>
                          <details className="border rounded p-2">
                            <summary className="cursor-pointer font-medium">State after</summary>
                            <pre style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                              {JSON.stringify(stateAfter, null, 2)}
                            </pre>
                          </details>
                        </div>
                      </details>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </main>
  );
}
