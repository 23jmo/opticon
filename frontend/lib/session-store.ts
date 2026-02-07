import { v4 as uuidv4 } from "uuid";
import type { Session, Todo, Agent, SessionStatus } from "./types";

const sessions = new Map<string, Session>();

export function createSession(
  id: string,
  prompt: string,
  agentCount: number
): Session {
  const session: Session = {
    id,
    prompt,
    agentCount,
    status: "decomposing",
    todos: [],
    agents: [],
    createdAt: Date.now(),
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
  session.status = "running";
  return newTodos;
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
    agent.status = "working";
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
