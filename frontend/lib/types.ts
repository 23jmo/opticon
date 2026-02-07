export interface Session {
  id: string;
  prompt: string;
  agentCount: number;
  status: "pending" | "running" | "completed" | "error";
  createdAt: string;
}

export interface Task {
  id: string;
  description: string;
  status: "pending" | "assigned" | "completed";
  assignedTo?: string; // agent ID
}

export interface Agent {
  id: string;
  sessionId: string;
  status: "initializing" | "active" | "terminated";
  streamUrl?: string;
}

export interface ThinkingEntry {
  id: string;
  agentId: string;
  timestamp: string;
  action: string;
  reasoning?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  expanded?: boolean;
}

// Socket.io event payloads
export interface TaskCreatedEvent {
  task: Task;
}

export interface TaskAssignedEvent {
  taskId: string;
  agentId: string;
}

export interface AgentThinkingEvent {
  agentId: string;
  action: string;
  timestamp: string;
}

export interface AgentReasoningEvent {
  agentId: string;
  reasoning: string;
  timestamp: string;
  actionId?: string; // Link to thinking entry
}

export interface AgentStreamReadyEvent {
  agentId: string;
  streamUrl: string;
}

export interface AgentTerminatedEvent {
  agentId: string;
}

export interface SessionCompleteEvent {
  sessionId: string;
  tasks: Task[];
  agents: Agent[];
}

export interface AgentCommandEvent {
  agentId: string;
  message: string;
}
