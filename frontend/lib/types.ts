export type AgentStatus = "Active" | "Draft" | "Error";

export interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  model: string;
  lastRun: string;
  lastUpdatedBy: string;
  description: string;
  tags: string[];
}

export interface AgentTool {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  badge?: "beta" | "new";
}

export type KnowledgeStatus = "Indexed" | "Indexing" | "Error";

export interface KnowledgeSource {
  id: string;
  name: string;
  type: "File" | "URL" | "Database";
  status: KnowledgeStatus;
  updatedAt: string;
}
