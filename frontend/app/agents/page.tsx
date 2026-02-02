"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { agents } from "@/lib/mock-data";
import { AgentStatus } from "@/lib/types";

const statusStyles: Record<AgentStatus, string> = {
  Active: "bg-emerald-100 text-emerald-700",
  Draft: "bg-slate-100 text-slate-600",
  Error: "bg-rose-100 text-rose-700",
};

export default function AgentsPage() {
  const [filter, setFilter] = useState<AgentStatus | "All">("All");

  const filteredAgents = useMemo(() => {
    if (filter === "All") return agents;
    return agents.filter((agent) => agent.status === filter);
  }, [filter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Agents</h2>
          <p className="text-sm text-slate-500">Manage AI agents, safety controls, and runtime policies.</p>
        </div>
        <Button asChild>
          <Link href="/agents/atlas-support">
            <Plus className="h-4 w-4" />
            New agent
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Requests (7d)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">48.2k</div>
            <p className="text-xs text-emerald-600">+12% vs last week</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Active agents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">6</div>
            <p className="text-xs text-slate-500">2 in staging</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Avg. latency</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">412ms</div>
            <p className="text-xs text-slate-500">p95 response time</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Escalations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">3</div>
            <p className="text-xs text-rose-600">2 failed handoffs</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <Tabs defaultValue="All" onValueChange={(value) => setFilter(value as AgentStatus | "All")}>
          <TabsList>
            {(["All", "Active", "Draft", "Error"] as const).map((tab) => (
              <TabsTrigger key={tab} value={tab}>
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button variant="outline">Filters</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-hidden rounded-lg">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-6 py-3">Agent</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Model</th>
                  <th className="px-6 py-3">Last run</th>
                  <th className="px-6 py-3">Updated by</th>
                </tr>
              </thead>
              <tbody>
                {filteredAgents.map((agent) => (
                  <tr key={agent.id} className="border-t border-slate-200 hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <Link href={`/agents/${agent.id}`} className="font-semibold text-slate-900">
                        {agent.name}
                      </Link>
                      <p className="text-xs text-slate-500">{agent.description}</p>
                    </td>
                    <td className="px-6 py-4">
                      <Badge className={statusStyles[agent.status]}>{agent.status}</Badge>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{agent.model}</td>
                    <td className="px-6 py-4 text-slate-600">{agent.lastRun}</td>
                    <td className="px-6 py-4 text-slate-600">{agent.lastUpdatedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
