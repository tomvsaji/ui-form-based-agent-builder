"use client";

import { useEffect, useState } from "react";

import { ChatPanel } from "@/components/ChatPanel";
import { BuilderPanel } from "@/components/BuilderPanel";
import { LogsPanel } from "@/components/panels/LogsPanel";
import { RunsPanel } from "@/components/panels/RunsPanel";
import { SubmissionsPanel } from "@/components/panels/SubmissionsPanel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/use-toast";

const statusBadgeStyles: Record<string, string> = {
  Active: "bg-emerald-100 text-emerald-700",
  Draft: "bg-slate-100 text-slate-600",
  Error: "bg-rose-100 text-rose-700",
};

const knowledgeStatusStyles: Record<string, string> = {
  Indexed: "bg-emerald-100 text-emerald-700",
  Indexing: "bg-amber-100 text-amber-700",
  Error: "bg-rose-100 text-rose-700",
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";

type AgentItem = {
  id: string;
  name: string;
  description: string;
  status: "Active" | "Draft" | "Error";
  model: string;
  last_run?: string | null;
  updated_by?: string | null;
};

type KnowledgeBaseItem = {
  id: number;
  name: string;
  description?: string | null;
  provider?: string | null;
  created_at?: string | null;
};

type KnowledgeFile = {
  filename: string;
  chunks: number;
  last_indexed_at?: string | null;
};

type RuntimeSettings = {
  POSTGRES_USER: string;
  POSTGRES_DB: string;
  TENANT_ID: string;
  AGENT_ID: string;
  CACHE_TTL_SECONDS: number;
  EMBEDDING_MODEL: string;
  LLM_MODEL: string;
  LLM_ROUTING_ENABLED: boolean;
  LLM_EXTRACTION_ENABLED: boolean;
  AZURE_OPENAI_ENDPOINT: string;
  AZURE_OPENAI_API_VERSION: string;
  AZURE_OPENAI_DEPLOYMENT: string;
  AZURE_OPENAI_EMBEDDING_DEPLOYMENT: string;
  POSTGRES_PASSWORD_SET: boolean;
  POSTGRES_DSN_SET: boolean;
  REDIS_URL_SET: boolean;
  OPENAI_API_KEY_SET: boolean;
  AZURE_OPENAI_API_KEY_SET: boolean;
};

export function SingleAgentWorkspace() {
  const [agent, setAgent] = useState<AgentItem | null>(null);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseItem[]>([]);
  const [knowledgeFiles, setKnowledgeFiles] = useState<Record<number, KnowledgeFile[]>>({});
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [selectedKbId, setSelectedKbId] = useState<number | null>(null);
  const [newKbName, setNewKbName] = useState("");
  const [newKbDescription, setNewKbDescription] = useState("");
  const [newKbProvider, setNewKbProvider] = useState("pgvector");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettings | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(false);

  const loadKnowledge = async () => {
    setKnowledgeLoading(true);
    try {
      const res = await fetch(`${API_BASE}/knowledge-bases`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const items = (data.items || []) as KnowledgeBaseItem[];
      setKnowledgeBases(items);
      setSelectedKbId((current) => {
        if (current && items.some((item) => item.id === current)) {
          return current;
        }
        return items[0]?.id ?? null;
      });
      const entries = await Promise.all(
        items.map(async (kb) => {
          try {
            const filesRes = await fetch(`${API_BASE}/knowledge-bases/${kb.id}/files`);
            if (!filesRes.ok) throw new Error(await filesRes.text());
            const filesData = await filesRes.json();
            return [kb.id, (filesData.files || []) as KnowledgeFile[]] as const;
          } catch {
            return [kb.id, []] as const;
          }
        })
      );
      setKnowledgeFiles(Object.fromEntries(entries));
    } catch (err) {
      toast({ title: "Failed to load knowledge", description: String(err) });
    } finally {
      setKnowledgeLoading(false);
    }
  };

  const loadRuntimeSettings = async () => {
    setRuntimeLoading(true);
    try {
      const res = await fetch(`${API_BASE}/runtime-settings`);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as RuntimeSettings;
      setRuntimeSettings(data);
    } catch (err) {
      toast({ title: "Failed to load runtime settings", description: String(err) });
    } finally {
      setRuntimeLoading(false);
    }
  };

  const addKnowledgeBase = async () => {
    const name = newKbName.trim();
    if (!name) {
      toast({ title: "Name required", description: "Provide a knowledge base name." });
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/knowledge-bases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: newKbDescription.trim(),
          provider: newKbProvider,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setNewKbName("");
      setNewKbDescription("");
      setNewKbProvider("pgvector");
      await loadKnowledge();
      toast({ title: "Source added", description: "Indexing has started." });
    } catch (err) {
      toast({ title: "Failed to add source", description: String(err) });
    }
  };

  const uploadKnowledgeFile = async () => {
    if (!selectedKbId) {
      toast({ title: "Select a knowledge base", description: "Choose a target before uploading." });
      return;
    }
    if (!uploadFile) {
      toast({ title: "File required", description: "Choose a file to upload." });
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", uploadFile);
      const res = await fetch(`${API_BASE}/knowledge-bases/${selectedKbId}/upload`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(await res.text());
      setUploadFile(null);
      await loadKnowledge();
      toast({ title: "Upload complete", description: "Documents indexed successfully." });
    } catch (err) {
      toast({ title: "Upload failed", description: String(err) });
    } finally {
      setUploading(false);
    }
  };

  const deleteKnowledgeBase = async (kbId: number) => {
    try {
      const res = await fetch(`${API_BASE}/knowledge-bases/${kbId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      await loadKnowledge();
      toast({ title: "Source deleted", description: "Knowledge base removed." });
    } catch (err) {
      toast({ title: "Failed to delete source", description: String(err) });
    }
  };

  const deleteKnowledgeFile = async (kbId: number, filename: string) => {
    try {
      const res = await fetch(
        `${API_BASE}/knowledge-bases/${kbId}/files?filename=${encodeURIComponent(filename)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(await res.text());
      await loadKnowledge();
      toast({ title: "Document deleted", description: filename });
    } catch (err) {
      toast({ title: "Failed to delete document", description: String(err) });
    }
  };

  useEffect(() => {
    void loadKnowledge();
    void loadRuntimeSettings();
    const loadAgent = async () => {
      try {
        const res = await fetch(`${API_BASE}/agents`);
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const currentAgent = ((data.items || []) as AgentItem[])[0] || null;
        setAgent(currentAgent);
      } catch (err) {
        toast({ title: "Failed to load agent", description: String(err) });
      }
    };
    void loadAgent();
  }, []);

  const credentialLabel = (enabled: boolean, emptyLabel = "Not configured") =>
    enabled ? "Configured" : emptyLabel;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-semibold text-slate-900">{agent?.name || "Agent"}</h2>
              <Badge className={statusBadgeStyles[agent?.status || "Draft"]}>{agent?.status || "Draft"}</Badge>
            </div>
            <p className="text-sm text-slate-500">
              {agent?.description || "Single-agent workspace for builder, runtime testing, and operations."}
            </p>
          </div>
        </div>

        <Tabs defaultValue="build" className="w-full">
          <TabsList>
            <TabsTrigger value="build">Build</TabsTrigger>
            <TabsTrigger value="runs">Runs</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="submissions">Submissions</TabsTrigger>
            <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
            <TabsTrigger value="runtime">Runtime</TabsTrigger>
          </TabsList>

          <TabsContent value="build" className="space-y-4">
            <BuilderPanel />
          </TabsContent>
          <TabsContent value="runs" className="space-y-4">
            <RunsPanel />
          </TabsContent>
          <TabsContent value="logs" className="space-y-4">
            <LogsPanel />
          </TabsContent>
          <TabsContent value="submissions" className="space-y-4">
            <SubmissionsPanel />
          </TabsContent>
          <TabsContent value="knowledge" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Knowledge sources</CardTitle>
                <CardDescription>Backed by Postgres (pgvector) for embeddings and retrieval.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-dashed p-4">
                  <div className="text-sm font-semibold text-slate-900">Add a source</div>
                  <p className="mt-1 text-xs text-slate-500">Create a knowledge base and upload source files.</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <Input
                      placeholder="Source name"
                      value={newKbName}
                      onChange={(event) => setNewKbName(event.target.value)}
                    />
                    <Input
                      placeholder="Provider"
                      value={newKbProvider}
                      onChange={(event) => setNewKbProvider(event.target.value)}
                    />
                    <Input
                      placeholder="Optional description"
                      value={newKbDescription}
                      onChange={(event) => setNewKbDescription(event.target.value)}
                    />
                  </div>
                  <div className="mt-3">
                    <button
                      className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                      onClick={addKnowledgeBase}
                    >
                      Add source
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-dashed p-4">
                  <div className="text-sm font-semibold text-slate-900">Upload documents</div>
                  <p className="mt-1 text-xs text-slate-500">PDF, markdown, and text uploads are supported.</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-[240px_1fr] md:items-center">
                    <select
                      className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                      value={selectedKbId ? String(selectedKbId) : ""}
                      onChange={(event) => setSelectedKbId(event.target.value ? Number(event.target.value) : null)}
                      disabled={knowledgeBases.length === 0}
                    >
                      <option value="">{knowledgeBases.length ? "Select a source" : "No sources yet"}</option>
                      {knowledgeBases.map((kb) => (
                        <option key={kb.id} value={kb.id}>
                          {kb.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex flex-wrap items-center gap-3">
                      <Input
                        type="file"
                        className="max-w-xs"
                        onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
                      />
                      <button
                        className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!selectedKbId || !uploadFile || uploading}
                        onClick={uploadKnowledgeFile}
                      >
                        {uploading ? "Uploading..." : "Upload"}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {knowledgeLoading && <div className="text-sm text-slate-500">Loading knowledge sources...</div>}
                  {!knowledgeLoading && knowledgeBases.length === 0 && (
                    <div className="text-sm text-slate-500">No knowledge sources indexed yet.</div>
                  )}
                  {knowledgeBases.map((kb) => {
                    const files = knowledgeFiles[kb.id] || [];
                    const status = files.length > 0 ? "Indexed" : "Indexing";
                    return (
                      <div key={kb.id} className="rounded-lg border p-4">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{kb.name}</div>
                            <div className="text-xs text-slate-500">
                              {(kb.provider || "pgvector").toString()} {kb.created_at ? `· ${kb.created_at}` : ""}
                            </div>
                            {kb.description && <div className="text-xs text-slate-500">{kb.description}</div>}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={knowledgeStatusStyles[status]}>{status}</Badge>
                            <button
                              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                              onClick={() => deleteKnowledgeBase(kb.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        <div className="mt-3 space-y-2">
                          {files.length === 0 ? (
                            <div className="text-xs text-slate-500">No indexed files yet.</div>
                          ) : (
                            files.map((file) => (
                              <div
                                key={file.filename}
                                className="flex flex-wrap items-center justify-between gap-3 rounded border p-2"
                              >
                                <div>
                                  <div className="text-xs font-semibold text-slate-900">{file.filename}</div>
                                  <div className="text-[11px] text-slate-500">
                                    {file.chunks} chunks {file.last_indexed_at ? `· ${file.last_indexed_at}` : ""}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">Indexed</Badge>
                                  <button
                                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                    onClick={() => deleteKnowledgeFile(kb.id, file.filename)}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="runtime" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Runtime settings</CardTitle>
                <CardDescription>Loaded from the active runtime environment.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {runtimeLoading && <div className="text-sm text-slate-500">Loading runtime settings...</div>}
                {!runtimeLoading && !runtimeSettings && (
                  <div className="text-sm text-slate-500">Runtime settings are unavailable.</div>
                )}
                {runtimeSettings && (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-600">Postgres user</label>
                        <Input value={runtimeSettings.POSTGRES_USER} readOnly />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-600">Postgres database</label>
                        <Input value={runtimeSettings.POSTGRES_DB} readOnly />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-600">Tenant ID</label>
                        <Input value={runtimeSettings.TENANT_ID} readOnly />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-600">Agent ID</label>
                        <Input value={runtimeSettings.AGENT_ID} readOnly />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-600">Cache TTL (seconds)</label>
                        <Input value={String(runtimeSettings.CACHE_TTL_SECONDS)} readOnly />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-600">Redis</label>
                        <Input value={credentialLabel(runtimeSettings.REDIS_URL_SET)} readOnly />
                      </div>
                    </div>

                    <div className="space-y-4 rounded-lg border bg-slate-50 p-4">
                      <div>
                        <div className="text-sm font-medium text-slate-700">Model routing</div>
                        <p className="text-xs text-slate-500">Controls LLM defaults and routing flags.</p>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-600">Embedding model</label>
                          <Input value={runtimeSettings.EMBEDDING_MODEL} readOnly />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-600">LLM model</label>
                          <Input value={runtimeSettings.LLM_MODEL} readOnly />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-600">OpenAI key</label>
                          <Input value={credentialLabel(runtimeSettings.OPENAI_API_KEY_SET)} readOnly />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-600">Azure OpenAI key</label>
                          <Input value={credentialLabel(runtimeSettings.AZURE_OPENAI_API_KEY_SET)} readOnly />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-600">Postgres credentials</label>
                          <Input value={credentialLabel(runtimeSettings.POSTGRES_PASSWORD_SET)} readOnly />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-600">Postgres DSN</label>
                          <Input value={credentialLabel(runtimeSettings.POSTGRES_DSN_SET)} readOnly />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 rounded-lg border bg-slate-50 p-4">
                      <div>
                        <div className="text-sm font-medium text-slate-700">Azure OpenAI</div>
                        <p className="text-xs text-slate-500">Deployment metadata without raw credentials.</p>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-600">Endpoint</label>
                          <Input value={runtimeSettings.AZURE_OPENAI_ENDPOINT} readOnly />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-600">API version</label>
                          <Input value={runtimeSettings.AZURE_OPENAI_API_VERSION} readOnly />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-600">Chat deployment</label>
                          <Input value={runtimeSettings.AZURE_OPENAI_DEPLOYMENT} readOnly />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-600">Embedding deployment</label>
                          <Input value={runtimeSettings.AZURE_OPENAI_EMBEDDING_DEPLOYMENT} readOnly />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <div className="xl:sticky xl:top-24 xl:h-[calc(100vh-6rem)]">
        <ChatPanel agentName={agent?.name || "Agent"} />
      </div>
    </div>
  );
}
