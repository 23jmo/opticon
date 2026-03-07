import { v4 as uuidv4 } from "uuid";
import type { Session, Todo, Agent } from "./types";
import {
  persistAgent,
  persistAgentStatus,
  persistAgentStreamUrl,
} from "./db/session-persist";

const globalStore = globalThis as unknown as {
  __opticon_sessions?: Map<string, Session>;
  __opticon_thumbnails?: Map<string, string>;
};
const sessions = (globalStore.__opticon_sessions ??= new Map<string, Session>());
const thumbnails = (globalStore.__opticon_thumbnails ??= new Map<string, string>());

export function createSession(
  id: string,
  prompt: string,
  agentCount: number,
  userId?: string,
  isPanopticon: boolean = false
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
    isPanopticon,
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

export function updateTodos(sessionId: string, descriptions: string[]): Todo[] {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const newTodos: Todo[] = descriptions.map((description) => ({
    id: uuidv4(),
    description,
    status: "pending" as const,
    assignedTo: null,
  }));

  session.todos = newTodos;
  return newTodos;
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
  persistAgent(agent).catch(console.error);
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
  persistAgentStatus(agentId, status).catch(console.error);
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
  persistAgentStreamUrl(agentId, streamUrl).catch(console.error);
}

export function updateAgentSandboxId(
  sessionId: string,
  agentId: string,
  sandboxId: string
): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  const agent = session.agents.find((a) => a.id === agentId);
  if (agent) agent.sandboxId = sandboxId;
}

export function restoreSessionFromDb(dbSession: {
  id: string;
  prompt: string;
  agentCount: number;
  status: string;
  userId: string;
  createdAt: Date | null;
  completedAt: Date | null;
  todos: Array<{ id: string; description: string; status: string; assignedTo: string | null; result: string | null }>;
  agents: Array<{ id: string; name: string; status: string; sandboxId: string | null; streamUrl: string | null; currentTaskId: string | null; tasksCompleted: number; tasksTotal: number; sessionId: string }>;
}): Session {
  const session: Session = {
    id: dbSession.id,
    prompt: dbSession.prompt,
    agentCount: dbSession.agentCount,
    status: dbSession.status as Session["status"],
    todos: dbSession.todos.map((t) => ({
      id: t.id,
      description: t.description,
      status: t.status as Todo["status"],
      assignedTo: t.assignedTo,
      result: t.result || undefined,
    })),
    agents: dbSession.agents.map((a) => ({
      id: a.id,
      name: a.name,
      sessionId: a.sessionId,
      status: a.status as Agent["status"],
      currentTaskId: a.currentTaskId,
      sandboxId: a.sandboxId || undefined,
      streamUrl: a.streamUrl || undefined,
      tasksCompleted: a.tasksCompleted,
      tasksTotal: a.tasksTotal,
    })),
    createdAt: dbSession.createdAt?.getTime() || Date.now(),
    whiteboard: "",
    userId: dbSession.userId,
  };
  sessions.set(session.id, session);
  return session;
}

export function updateAgentThumbnail(
  sessionId: string,
  agentId: string,
  thumbnail: string
): void {
  thumbnails.set(`${sessionId}:${agentId}`, thumbnail);
}

export function getLatestThumbnail(sessionId: string): string | undefined {
  let latest: string | undefined;
  for (const [key, value] of thumbnails) {
    if (key.startsWith(`${sessionId}:`)) {
      latest = value;
    }
  }
  return latest;
}

export function getAllActiveSessions(): Session[] {
  const active: Session[] = [];
  for (const session of sessions.values()) {
    if (
      session.status === "running" ||
      session.status === "decomposing" ||
      session.status === "pending_approval" ||
      session.status === "paused"
    ) {
      active.push(session);
    }
  }
  return active;
}

// Panopticon-specific functions
export function setSession(sessionId: string, session: Session): void {
  sessions.set(sessionId, session);
}

export function getUserSessions(userId: string): Session[] {
  const userSessions = Array.from(sessions.values()).filter(
    (session) => session.userId === userId
  );
  return userSessions.sort((a, b) => b.createdAt - a.createdAt);
}

export function getPanopticonSessions(userId: string): Session[] {
  return getUserSessions(userId).filter((session) => session.isPanopticon);
}

export function getSessionStore() {
  return {
    setSession,
    getSession,
    getUserSessions,
    getPanopticonSessions,
    createSession,
    addTodos,
    updateTodos,
    approveSession,
    assignTask,
    completeTask,
    getNextPendingTask,
    addAgent,
    updateAgentStatus,
    getWhiteboard,
    updateWhiteboard,
    updateAgentStreamUrl,
  };
}
