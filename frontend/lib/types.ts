export type SessionStatus =
  | "decomposing"
  | "pending_approval"
  | "running"
  | "completed"
  | "failed";

export type AgentStatus =
  | "booting"
  | "active"
  | "idle"
  | "error"
  | "terminated";

export interface Todo {
  id: string;
  description: string;
  status: "pending" | "assigned" | "completed";
  assignedTo: string | null;
  result?: string;
  retryCount?: number;
}

export interface Agent {
  id: string;
  sessionId: string;
  status: AgentStatus;
  currentTaskId: string | null;
  sandboxId?: string;
  streamUrl?: string;
  tasksCompleted?: number;
  tasksTotal?: number;
}

export interface Session {
  id: string;
  prompt: string;
  agentCount: number;
  status: SessionStatus;
  todos: Todo[];
  agents: Agent[];
  createdAt: number;
  whiteboard?: string;
}

// Socket.io event payload types
export interface TaskCreatedEvent {
  id: string;
  description: string;
  status: string;
}

export interface TaskAssignedEvent {
  todoId: string;
  agentId: string;
}

export interface TaskCompletedEvent {
  todoId: string;
  agentId: string;
  result?: string;
}

export interface AgentThinkingEvent {
  agentId: string;
  action: string;
  timestamp: string;
  isError?: boolean;
}

export interface AgentReasoningEvent {
  agentId: string;
  reasoning: string;
  timestamp: string;
  actionId?: string;
}

export interface AgentStreamReadyEvent {
  agentId: string;
  streamUrl: string;
}

export interface AgentJoinEvent {
  agentId: string;
  sessionId: string;
}

export interface AgentErrorEvent {
  agentId: string;
  error: string;
}

export interface AgentTerminatedEvent {
  agentId: string;
}

export interface SessionCompleteEvent {
  sessionId: string;
}

export interface WhiteboardUpdatedEvent {
  sessionId: string;
  content: string;
}

export interface ServerToClientEvents {
  "task:created": (todo: Todo) => void;
  "task:assigned": (payload: TaskAssignedEvent) => void;
  "task:completed": (payload: TaskCompletedEvent) => void;
  "agent:join": (payload: AgentJoinEvent) => void;
  "agent:thinking": (payload: AgentThinkingEvent) => void;
  "agent:reasoning": (payload: AgentReasoningEvent) => void;
  "agent:stream_ready": (payload: AgentStreamReadyEvent) => void;
  "agent:error": (payload: AgentErrorEvent) => void;
  "agent:terminated": (payload: AgentTerminatedEvent) => void;
  "session:complete": (payload: SessionCompleteEvent) => void;
  "whiteboard:updated": (payload: WhiteboardUpdatedEvent) => void;
  "task:assign": (payload: {
    taskId: string;
    description: string;
    whiteboard?: string;
  }) => void;
  "task:none": () => void;
}

export interface ClientToServerEvents {
  "session:join": (sessionId: string) => void;
  "session:leave": (sessionId: string) => void;
  "agent:join": (payload: AgentJoinEvent) => void;
  "agent:stream_ready": (payload: AgentStreamReadyEvent) => void;
  "agent:thinking": (payload: AgentThinkingEvent) => void;
  "agent:reasoning": (payload: AgentReasoningEvent) => void;
  "agent:error": (payload: AgentErrorEvent) => void;
  "task:completed": (payload: TaskCompletedEvent) => void;
  "agent:terminated": (payload: AgentTerminatedEvent) => void;
  "whiteboard:updated": (payload: WhiteboardUpdatedEvent) => void;
}

// Alias for frontend components that use "Task" instead of "Todo"
export type Task = Todo;

// Frontend-specific types (used by UI components)
export interface ThinkingEntry {
  id: string;
  agentId: string;
  timestamp: string;
  action: string;
  reasoning?: string;
  expanded?: boolean;
  isError?: boolean;
}
