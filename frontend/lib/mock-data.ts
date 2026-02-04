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
    enabled: false,
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
    name: "pgvector: Customer playbooks.pdf",
    type: "Document",
    status: "Indexed",
    updatedAt: "Today, 9:12 AM",
  },
  {
    id: "kb-2",
    name: "pgvector: Escalation policies.md",
    type: "Document",
    status: "Indexed",
    updatedAt: "Yesterday, 4:05 PM",
  },
  {
    id: "kb-3",
    name: "pgvector: SLA guardrails.txt",
    type: "Document",
    status: "Indexed",
    updatedAt: "Monday, 2:31 PM",
  },
];
