import { v4 as uuidv4 } from "uuid";
import type { Session, Todo, Agent } from "./types";

const globalStore = globalThis as unknown as {
  __panopticon_sessions?: Map<string, Session>;
};
const sessions = (globalStore.__panopticon_sessions ??= new Map<string, Session>());

export function createSession(
  id: string,
  prompt: string,
  agentCount: number,
  userId?: string
): Session {
  const session: Session = {
    id,
    prompt,
    agentCount,
    status: "decomposing",
    todos: [],
    agents: [],
    createdAt: Date.now(),
    whiteboard: "",
    userId,
  };
  sessions.set(id, session);
  return session;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function addTodos(sessionId: string, descriptions: string[]): Todo[] {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const newTodos: Todo[] = descriptions.map((description) => ({
    id: uuidv4(),
    description,
    status: "pending",
    assignedTo: null,
  }));

  session.todos.push(...newTodos);
  return newTodos;
}

export function updateTodos(sessionId: string, todos: Todo[]): void {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);
  session.todos = todos;
}

export function approveSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);
  if (session.status !== "pending_approval") {
    throw new Error(`Session ${sessionId} is not pending approval`);
  }
  session.status = "running";
}

export function assignTask(
  sessionId: string,
  todoId: string,
  agentId: string
): Todo {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const todo = session.todos.find((t) => t.id === todoId);
  if (!todo) throw new Error(`Todo ${todoId} not found`);

  todo.status = "assigned";
  todo.assignedTo = agentId;

  const agent = session.agents.find((a) => a.id === agentId);
  if (agent) {
    agent.currentTaskId = todoId;
    agent.status = "active";
  }

  return todo;
}

export function completeTask(
  sessionId: string,
  todoId: string,
  result?: string
): Todo {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const todo = session.todos.find((t) => t.id === todoId);
  if (!todo) throw new Error(`Todo ${todoId} not found`);

  todo.status = "completed";
  if (result) todo.result = result;

  const agent = session.agents.find((a) => a.id === todo.assignedTo);
  if (agent) {
    agent.currentTaskId = null;
    agent.status = "idle";
    agent.tasksCompleted = (agent.tasksCompleted || 0) + 1;
  }

  if (session.todos.every((t) => t.status === "completed")) {
    session.status = "completed";
  }

  return todo;
}

export function getNextPendingTask(sessionId: string): Todo | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  return session.todos.find((t) => t.status === "pending");
}

export function addAgent(sessionId: string, agent: Agent): void {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);
  session.agents.push(agent);
}

export function updateAgentStatus(
  sessionId: string,
  agentId: string,
  status: Agent["status"]
): void {
  const session = sessions.get(sessionId);
  if (!session) return;

  const agent = session.agents.find((a) => a.id === agentId);
  if (agent) agent.status = status;
}

export function getWhiteboard(sessionId: string): string {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);
  return session.whiteboard || "";
}

export function updateWhiteboard(sessionId: string, content: string): void {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);
  session.whiteboard = content;
}

export function updateAgentStreamUrl(
  sessionId: string,
  agentId: string,
  streamUrl: string
): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  const agent = session.agents.find((a) => a.id === agentId);
  if (agent) agent.streamUrl = streamUrl;
}
