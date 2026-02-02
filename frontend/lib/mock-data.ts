import { Agent, AgentTool, KnowledgeSource } from "@/lib/types";

export const agents: Agent[] = [
  {
    id: "atlas-support",
    name: "Atlas Support Concierge",
    status: "Active",
    model: "gpt-4o-mini",
    lastRun: "2 mins ago",
    lastUpdatedBy: "Riley Chen",
    description: "Escalation-aware support agent with guardrails and routing.",
    tags: ["support", "triage", "handoff"],
  },
];

export const tools: AgentTool[] = [
  {
    id: "web-search",
    name: "Web search",
    description: "Query the web for fresh information.",
    enabled: true,
    badge: "beta",
  },
  {
    id: "vector-store",
    name: "Vector store",
    description: "Retrieve internal knowledge base chunks.",
    enabled: true,
  },
  {
    id: "ticketing",
    name: "Ticketing",
    description: "Create and update support tickets.",
    enabled: false,
    badge: "new",
  },
  {
    id: "workflow",
    name: "Workflow runner",
    description: "Trigger automation playbooks and workflows.",
    enabled: false,
  },
];

export const knowledgeSources: KnowledgeSource[] = [
  {
    id: "kb-1",
    name: "Postgres: agent_kb (pgvector)",
    type: "Database",
    status: "Indexed",
    updatedAt: "Today, 9:12 AM",
  },
  {
    id: "kb-2",
    name: "Postgres: runbooks (pgvector)",
    type: "Database",
    status: "Indexing",
    updatedAt: "Today, 9:18 AM",
  },
  {
    id: "kb-3",
    name: "Postgres: incidents_archive (pgvector)",
    type: "Database",
    status: "Error",
    updatedAt: "Yesterday, 6:42 PM",
  },
];
