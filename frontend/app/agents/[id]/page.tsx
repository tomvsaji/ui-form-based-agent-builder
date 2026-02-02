"use client";

import { useMemo, useState } from "react";
import { Copy, PlayCircle, Trash2 } from "lucide-react";

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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { knowledgeSources, tools, agents } from "@/lib/mock-data";

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

export default function AgentDetailPage({ params }: { params: { id: string } }) {
  const agent = useMemo(() => agents.find((item) => item.id === params.id) ?? agents[0], [params.id]);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [temperature, setTemperature] = useState([0.4]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-semibold text-slate-900">{agent.name}</h2>
              <Badge className={statusBadgeStyles[agent.status]}>{agent.status}</Badge>
            </div>
            <p className="text-sm text-slate-500">{agent.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline">
              <PlayCircle className="h-4 w-4" />
              Test in chat
            </Button>
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
                  <Input defaultValue={agent.name} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-600">Status</label>
                  <Select defaultValue={agent.status}>
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
                  <Textarea defaultValue={agent.description} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-600">Tags</label>
                  <Input defaultValue={agent.tags.join(", ")} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-600">Model</label>
                  <Select defaultValue={agent.model}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-4.1">gpt-4.1</SelectItem>
                      <SelectItem value="gpt-4o">gpt-4o</SelectItem>
                      <SelectItem value="gpt-4o-mini">gpt-4o-mini</SelectItem>
                    </SelectContent>
                  </Select>
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
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedTool(tool.id)}
                        disabled={!tool.enabled}
                      >
                        Configure
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Sheet open={Boolean(selectedTool)} onOpenChange={(open) => !open && setSelectedTool(null)}>
              <SheetContent side="right" className="w-[420px]">
                <SheetHeader>
                  <SheetTitle>Tool configuration</SheetTitle>
                  <SheetDescription>Edit the JSON payload and permissions.</SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-4">
                  <div className="rounded-lg border bg-slate-50 p-3 text-xs text-slate-600">
                    Tool ID: {selectedTool}
                  </div>
                  <Textarea defaultValue={`{\n  "rate_limit": 120,\n  "timeout_ms": 8000,\n  "retry": true\n}`} className="min-h-[200px] font-mono" />
                  <Button
                    className="w-full"
                    onClick={() =>
                      toast({
                        title: "Tool updated",
                        description: "Configuration saved successfully.",
                      })
                    }
                  >
                    Save configuration
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
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
                      <Input placeholder="Source name or URL" />
                      <Select defaultValue="Postgres">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Postgres">Postgres (pgvector)</SelectItem>
                        </SelectContent>
                      </Select>
                      <Textarea placeholder="Optional description or tags" />
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={() =>
                          toast({
                            title: "Source added",
                            description: "Indexing has started.",
                          })
                        }
                      >
                        Add source
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="space-y-4">
                {knowledgeSources.map((source) => (
                  <div key={source.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{source.name}</div>
                      <div className="text-xs text-slate-500">{source.type} · {source.updatedAt}</div>
                    </div>
                    <Badge className={knowledgeStatusStyles[source.status]}>{source.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="runtime" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Runtime settings</CardTitle>
                <CardDescription>Control logging, webhooks, and environment values.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-600">Logging level</label>
                    <Select defaultValue="info">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="debug">Debug</SelectItem>
                        <SelectItem value="info">Info</SelectItem>
                        <SelectItem value="warn">Warn</SelectItem>
                        <SelectItem value="error">Error</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-600">Webhook URL</label>
                    <Input defaultValue="https://hooks.nimbus.ai/agents/atlas" />
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium text-slate-600">Environment variables</div>
                  <div className="mt-3 overflow-hidden rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-4 py-2 text-left">Key</th>
                          <th className="px-4 py-2 text-left">Value</th>
                          <th className="px-4 py-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { key: "SLACK_WEBHOOK", value: "https://hooks.slack.com/xyz" },
                          { key: "PAGERDUTY_KEY", value: "pd_live_...2a" },
                        ].map((row) => (
                          <tr key={row.key} className="border-t">
                            <td className="px-4 py-3 text-slate-700">{row.key}</td>
                            <td className="px-4 py-3 text-slate-500">{row.value}</td>
                            <td className="px-4 py-3 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  toast({
                                    title: "Copied",
                                    description: `${row.key} copied to clipboard.`,
                                  })
                                }
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-lg border bg-slate-50 p-4">
                  <div className="text-sm font-medium text-slate-700">API Keys</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">sk-live-92fc••••</Badge>
                    <Badge variant="secondary">sk-live-18bc••••</Badge>
                    <Button variant="outline" size="sm">Rotate keys</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <div className="xl:sticky xl:top-24 xl:h-[calc(100vh-6rem)]">
        <ChatPanel agentName={agent.name} />
      </div>
    </div>
  );
}
