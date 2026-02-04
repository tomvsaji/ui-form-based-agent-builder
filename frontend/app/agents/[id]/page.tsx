"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";

import { ChatPanel } from "@/components/ChatPanel";
import { BuilderPanel } from "@/components/BuilderPanel";
import { LogsPanel } from "@/components/panels/LogsPanel";
import { RunsPanel } from "@/components/panels/RunsPanel";
import { SubmissionsPanel } from "@/components/panels/SubmissionsPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { tools } from "@/lib/mock-data";

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
  POSTGRES_PASSWORD: string;
  POSTGRES_DB: string;
  POSTGRES_DSN: string;
  REDIS_URL: string;
  TENANT_ID: string;
  AGENT_ID: string;
  CACHE_TTL_SECONDS: number;
  OPENAI_API_KEY: string;
  EMBEDDING_MODEL: string;
  LLM_MODEL: string;
  LLM_ROUTING_ENABLED: boolean;
  LLM_EXTRACTION_ENABLED: boolean;
  AZURE_OPENAI_ENDPOINT: string;
  AZURE_OPENAI_API_KEY: string;
  AZURE_OPENAI_API_VERSION: string;
  AZURE_OPENAI_DEPLOYMENT: string;
  AZURE_OPENAI_EMBEDDING_DEPLOYMENT: string;
};

export default function AgentDetailPage({ params }: { params: { id: string } }) {
  const [agent, setAgent] = useState<{
    id: string;
    name: string;
    description: string;
    status: "Active" | "Draft" | "Error";
    model: string;
    last_run?: string | null;
    updated_by?: string | null;
    tags?: string[];
  } | null>(null);
  const [temperature, setTemperature] = useState([0.4]);
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
      if (!selectedKbId && items.length > 0) {
        setSelectedKbId(items[0].id);
      }
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
        const items = (data.items || []) as any[];
        const match = items.find((item) => item.id === params.id) || items[0];
        if (match) {
          setAgent({
            id: match.id,
            name: match.name,
            description: match.description || "",
            status: match.status || "Draft",
            model: match.model || "",
            last_run: match.last_run,
            updated_by: match.updated_by,
            tags: [],
          });
        }
      } catch (err) {
        toast({ title: "Failed to load agent", description: String(err) });
      }
    };
    void loadAgent();
  }, []);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-semibold text-slate-900">{agent?.name || "Agent"}</h2>
              <Badge className={statusBadgeStyles[agent?.status || "Draft"]}>{agent?.status || "Draft"}</Badge>
            </div>
            <p className="text-sm text-slate-500">{agent?.description || "No description available."}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary">Duplicate</Button>
            <Button variant="destructive">
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>

        <Tabs defaultValue="build" className="w-full">
          <TabsList>
            <TabsTrigger value="build">Build</TabsTrigger>
            <TabsTrigger value="runs">Runs</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="submissions">Submissions</TabsTrigger>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="tools">Tools</TabsTrigger>
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
          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Agent profile</CardTitle>
                <CardDescription>Define persona, goals, and routing metadata.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-600">Agent name</label>
                  <Input defaultValue={agent?.name || ""} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-600">Status</label>
                  <Select defaultValue={agent?.status || "Draft"}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Draft">Draft</SelectItem>
                      <SelectItem value="Error">Error</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-slate-600">Description</label>
                  <Textarea defaultValue={agent?.description || ""} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-600">Tags</label>
                  <Input defaultValue={agent?.tags?.join(", ") || ""} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-600">Model provider</label>
                  <Select defaultValue="openai">
                    <SelectTrigger>
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="azure-openai">Azure OpenAI</SelectItem>
                      <SelectItem value="anthropic" disabled>
                        Claude (soon)
                      </SelectItem>
                      <SelectItem value="google" disabled>
                        Google (soon)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-600">Model</label>
                  <Input defaultValue={agent?.model || ""} placeholder="e.g. gpt-4o-mini" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-slate-600">Temperature</label>
                  <div className="flex items-center gap-4">
                    <Slider value={temperature} max={1} step={0.1} onValueChange={setTemperature} />
                    <span className="text-sm font-medium text-slate-700">{temperature[0].toFixed(1)}</span>
                  </div>
                </div>
                <div className="flex justify-end md:col-span-2">
                  <Button
                    onClick={() =>
                      toast({
                        title: "Agent saved",
                        description: "Profile settings were updated.",
                      })
                    }
                  >
                    Save changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tools" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Tooling</CardTitle>
                <CardDescription>Enable tools and configure runtime behavior.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {tools.map((tool) => (
                  <div
                    key={tool.id}
                    className={`flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4 ${tool.enabled ? "" : "opacity-50"}`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold text-slate-900">{tool.name}</div>
                        {tool.badge && (
                          <Badge variant="secondary" className="uppercase">
                            {tool.badge}
                          </Badge>
                        )}
                        {!tool.enabled && (
                          <Badge variant="outline" className="uppercase">
                            Unavailable
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">{tool.description}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch defaultChecked={tool.enabled} disabled={!tool.enabled} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="knowledge" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Knowledge sources</CardTitle>
                  <CardDescription>Backed by Postgres (pgvector) for embeddings and retrieval.</CardDescription>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button>Add source</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add knowledge source</DialogTitle>
                      <DialogDescription>Register a new Postgres-backed source for this agent.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      <Input
                        placeholder="Source name or URL"
                        value={newKbName}
                        onChange={(event) => setNewKbName(event.target.value)}
                      />
                      <Select value={newKbProvider} onValueChange={setNewKbProvider}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pgvector">Postgres (pgvector)</SelectItem>
                        </SelectContent>
                      </Select>
                      <Textarea
                        placeholder="Optional description or tags"
                        value={newKbDescription}
                        onChange={(event) => setNewKbDescription(event.target.value)}
                      />
                    </div>
                    <DialogFooter>
                      <Button onClick={addKnowledgeBase}>Add source</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-dashed p-4">
                  <div className="text-sm font-semibold text-slate-900">Upload documents</div>
                  <p className="mt-1 text-xs text-slate-500">Upload PDFs or markdown files to the pgvector store.</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-[240px_1fr] md:items-center">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-500">Knowledge base</label>
                      <Select
                        value={selectedKbId ? String(selectedKbId) : ""}
                        onValueChange={(value) => setSelectedKbId(Number(value))}
                        disabled={knowledgeBases.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={knowledgeBases.length ? "Select a source" : "No sources yet"} />
                        </SelectTrigger>
                        <SelectContent>
                          {knowledgeBases.map((kb) => (
                            <SelectItem key={kb.id} value={String(kb.id)}>
                              {kb.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Input
                        type="file"
                        className="max-w-xs"
                        onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
                      />
                      <Button
                        variant="outline"
                        disabled={!selectedKbId || !uploadFile || uploading}
                        onClick={uploadKnowledgeFile}
                      >
                        {uploading ? "Uploading..." : "Upload"}
                      </Button>
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
                            {kb.description && (
                              <div className="text-xs text-slate-500">{kb.description}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={knowledgeStatusStyles[status]}>{status}</Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deleteKnowledgeBase(kb.id)}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                        <div className="mt-3 space-y-2">
                          {files.length === 0 ? (
                            <div className="text-xs text-slate-500">No indexed files yet.</div>
                          ) : (
                            files.map((file) => (
                              <div key={file.filename} className="flex flex-wrap items-center justify-between gap-3 rounded border p-2">
                                <div>
                                  <div className="text-xs font-semibold text-slate-900">{file.filename}</div>
                                  <div className="text-[11px] text-slate-500">
                                    {file.chunks} chunks {file.last_indexed_at ? `· ${file.last_indexed_at}` : ""}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">Indexed</Badge>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => deleteKnowledgeFile(kb.id, file.filename)}
                                  >
                                    Delete
                                  </Button>
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
                        <label className="text-sm font-medium text-slate-600">Postgres password</label>
                        <Input value={runtimeSettings.POSTGRES_PASSWORD} readOnly type="password" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-600">Postgres database</label>
                        <Input value={runtimeSettings.POSTGRES_DB} readOnly />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-600">Postgres DSN</label>
                        <Input value={runtimeSettings.POSTGRES_DSN} readOnly />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-600">Redis URL</label>
                        <Input value={runtimeSettings.REDIS_URL} readOnly />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-600">Cache TTL (seconds)</label>
                        <Input value={String(runtimeSettings.CACHE_TTL_SECONDS)} readOnly />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-600">Tenant ID</label>
                        <Input value={runtimeSettings.TENANT_ID} readOnly />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-600">Agent ID</label>
                        <Input value={runtimeSettings.AGENT_ID} readOnly />
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
                        <div className="flex items-center justify-between rounded border bg-white px-3 py-2">
                          <span className="text-sm text-slate-600">LLM routing enabled</span>
                          <Switch checked={runtimeSettings.LLM_ROUTING_ENABLED} disabled />
                        </div>
                        <div className="flex items-center justify-between rounded border bg-white px-3 py-2">
                          <span className="text-sm text-slate-600">LLM extraction enabled</span>
                          <Switch checked={runtimeSettings.LLM_EXTRACTION_ENABLED} disabled />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 rounded-lg border bg-slate-50 p-4">
                      <div>
                        <div className="text-sm font-medium text-slate-700">OpenAI / Azure OpenAI</div>
                        <p className="text-xs text-slate-500">Credentials and deployment configuration in use.</p>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-600">OpenAI API key</label>
                          <Input value={runtimeSettings.OPENAI_API_KEY} readOnly type="password" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-600">OpenAI endpoint</label>
                          <Input value={runtimeSettings.AZURE_OPENAI_ENDPOINT} readOnly />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-600">OpenAI API key (Azure)</label>
                          <Input value={runtimeSettings.AZURE_OPENAI_API_KEY} readOnly type="password" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-600">API version</label>
                          <Input value={runtimeSettings.AZURE_OPENAI_API_VERSION} readOnly />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-600">OpenAI deployment</label>
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
