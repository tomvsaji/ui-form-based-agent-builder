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
  {
    id: "ops-sentinel",
    name: "Ops Sentinel",
    status: "Active",
    model: "gpt-4.1",
    lastRun: "12 mins ago",
    lastUpdatedBy: "Jordan Lee",
    description: "Watches runtime drift, triggers playbooks, and alerts.",
    tags: ["ops", "alerts"],
  },
  {
    id: "growth-copilot",
    name: "Growth Copilot",
    status: "Draft",
    model: "gpt-4o",
    lastRun: "Not run",
    lastUpdatedBy: "Avery Patel",
    description: "Recommends experiments and summarizes campaign learnings.",
    tags: ["growth", "insights"],
  },
  {
    id: "finance-reviewer",
    name: "Finance Reviewer",
    status: "Error",
    model: "gpt-4o",
    lastRun: "1 hour ago",
    lastUpdatedBy: "Morgan Cruz",
    description: "Validates invoices and reconciles AP workflows.",
    tags: ["finance", "compliance"],
  },
  {
    id: "research-synth",
    name: "Research Synthesizer",
    status: "Active",
    model: "gpt-4.1",
    lastRun: "35 mins ago",
    lastUpdatedBy: "Taylor Brooks",
    description: "Summarizes longform docs and curates citations.",
    tags: ["research", "knowledge"],
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
    enabled: true,
  },
];

export const knowledgeSources: KnowledgeSource[] = [
  {
    id: "kb-1",
    name: "Customer playbooks.pdf",
    type: "File",
    status: "Indexed",
    updatedAt: "Today, 9:12 AM",
  },
  {
    id: "kb-2",
    name: "https://docs.nimbus.ai/policies",
    type: "URL",
    status: "Indexing",
    updatedAt: "Today, 9:18 AM",
  },
  {
    id: "kb-3",
    name: "Product telemetry",
    type: "Database",
    status: "Error",
    updatedAt: "Yesterday, 6:42 PM",
  },
];
