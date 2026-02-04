"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

type UsageStats = {
  requests_7d: number;
  sessions_7d: number;
};

const statusStyles: Record<string, string> = {
  Active: "bg-emerald-100 text-emerald-700",
  Draft: "bg-slate-100 text-slate-600",
  Error: "bg-rose-100 text-rose-700",
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [usage, setUsage] = useState<UsageStats | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [agentsRes, usageRes] = await Promise.all([
          fetch(`${API_BASE}/agents`),
          fetch(`${API_BASE}/stats/usage`),
        ]);
        if (agentsRes.ok) {
          const data = await agentsRes.json();
          setAgents(data.items || []);
        }
        if (usageRes.ok) {
          const data = await usageRes.json();
          setUsage({ requests_7d: data.requests_7d || 0, sessions_7d: data.sessions_7d || 0 });
        }
      } catch {
        setAgents([]);
      }
    };
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Agent</h2>
          <p className="text-sm text-slate-500">Single-agent workspace.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Requests (7d)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">{usage ? usage.requests_7d : "—"}</div>
            <p className="text-xs text-slate-500">From chat logs</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Sessions (7d)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">{usage ? usage.sessions_7d : "—"}</div>
            <p className="text-xs text-slate-500">Distinct threads</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Active agents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">{agents.length}</div>
            <p className="text-xs text-slate-500">Configured agents</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Latest activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">
              {agents[0]?.last_run ? new Date(agents[0].last_run).toLocaleDateString() : "—"}
            </div>
            <p className="text-xs text-slate-500">Most recent run</p>
          </CardContent>
        </Card>
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
                {agents.map((agent) => (
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
                    <td className="px-6 py-4 text-slate-600">{agent.model || "—"}</td>
                    <td className="px-6 py-4 text-slate-600">
                      {agent.last_run ? new Date(agent.last_run).toLocaleString() : "—"}
                    </td>
                    <td className="px-6 py-4 text-slate-600">{agent.updated_by || "—"}</td>
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
