"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bot, CreditCard, Settings } from "lucide-react";

import { cn } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";

const navItems = [
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/billing", label: "Billing", icon: CreditCard },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [usage, setUsage] = useState<{ requests_7d: number; sessions_7d: number } | null>(null);
  const [agentCount, setAgentCount] = useState<number>(0);

  useEffect(() => {
    const load = async () => {
      try {
        const [usageRes, agentsRes] = await Promise.all([
          fetch(`${API_BASE}/stats/usage`),
          fetch(`${API_BASE}/agents`),
        ]);
        if (usageRes.ok) {
          const data = await usageRes.json();
          setUsage({ requests_7d: data.requests_7d || 0, sessions_7d: data.sessions_7d || 0 });
        }
        if (agentsRes.ok) {
          const data = await agentsRes.json();
          setAgentCount((data.items || []).length);
        }
      } catch {
        setUsage(null);
      }
    };
    void load();
  }, []);

  return (
    <aside className="fixed left-0 top-0 flex h-screen w-64 flex-col border-r bg-white px-4 py-6 shadow-sm">
      <div className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-900">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Bot className="h-5 w-5" />
        </div>
        Agent Builder
      </div>
      <div className="mt-8 space-y-1">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-primary/10 text-primary" : "text-slate-600 hover:bg-slate-100"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
      <div className="mt-auto rounded-lg border bg-slate-50 p-3 text-xs text-slate-500">
        <div className="font-medium text-slate-700">Usage this week</div>
        <div className="mt-2 flex items-center justify-between">
          <span>Requests</span>
          <span className="font-semibold text-slate-900">{usage ? usage.requests_7d : "—"}</span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span>Sessions</span>
          <span className="font-semibold text-slate-900">{usage ? usage.sessions_7d : "—"}</span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span>Active agents</span>
          <span className="font-semibold text-slate-900">{agentCount}</span>
        </div>
      </div>
    </aside>
  );
}
