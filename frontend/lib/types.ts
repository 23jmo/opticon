export type SessionStatus = "decomposing" | "running" | "completed" | "failed";

export interface Todo {
  id: string;
  description: string;
  status: "pending" | "assigned" | "completed";
  assignedTo: string | null;
  result?: string;
}

export interface Agent {
  id: string;
  sessionId: string;
  status: "booting" | "working" | "idle" | "terminated";
  currentTaskId: string | null;
  sandboxId?: string;
  streamUrl?: string;
}

export interface Session {
  id: string;
  prompt: string;
  agentCount: number;
  status: SessionStatus;
  todos: Todo[];
  agents: Agent[];
  createdAt: number;
}

export interface ServerToClientEvents {
  "task:created": (todo: Todo) => void;
  "task:assigned": (payload: { todoId: string; agentId: string }) => void;
  "task:completed": (payload: {
    todoId: string;
    agentId: string;
    result?: string;
  }) => void;
  "agent:thinking": (payload: {
    agentId: string;
    action: string;
    timestamp: number;
  }) => void;
  "agent:reasoning": (payload: {
    agentId: string;
    reasoning: string;
    timestamp: number;
  }) => void;
  "agent:terminated": (payload: { agentId: string }) => void;
  "session:complete": (payload: { sessionId: string }) => void;
}

export interface ClientToServerEvents {
  "session:join": (sessionId: string) => void;
  "session:leave": (sessionId: string) => void;
}
