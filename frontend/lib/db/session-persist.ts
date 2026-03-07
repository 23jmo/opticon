import { db } from "./index";
import { sessions, todos, agents } from "./schema";
import { eq, desc } from "drizzle-orm";
import type { Todo, Agent } from "../types";

/**
 * Persist a new session to the database
 */
export async function persistSession(
  id: string,
  userId: string,
  prompt: string,
  agentCount: number,
  status: string,
  isPanopticon: boolean = false
) {
  await db.insert(sessions).values({
    id,
    userId,
    prompt,
    agentCount,
    status,
    createdAt: new Date(),
    isPanopticon: isPanopticon ? "true" : "false",
  });
}

/**
 * Persist todos for a session
 */
export async function persistTodos(sessionId: string, todoList: Todo[]) {
  if (todoList.length === 0) return;

  await db.insert(todos).values(
    todoList.map((todo) => ({
      id: todo.id,
      sessionId,
      description: todo.description,
      status: todo.status,
      assignedTo: todo.assignedTo || null,
      result: todo.result || null,
    }))
  );
}

/**
 * Replace todos for a session (used when user edits tasks before approval)
 * Deletes all existing todos and inserts new ones in a transaction
 */
export async function replaceTodos(sessionId: string, todoList: Todo[]) {
  // neon-http doesn't support transactions — run as sequential queries
  await db.delete(todos).where(eq(todos.sessionId, sessionId));

  if (todoList.length > 0) {
    await db.insert(todos).values(
      todoList.map((todo) => ({
        id: todo.id,
        sessionId,
        description: todo.description,
        status: todo.status,
        assignedTo: todo.assignedTo || null,
        result: todo.result || null,
      }))
    );
  }
}

/**
 * Update session status and optionally set completion time
 */
export async function persistSessionStatus(
  sessionId: string,
  status: string,
  completedAt?: Date
) {
  await db
    .update(sessions)
    .set({
      status,
      ...(completedAt && { completedAt }),
    })
    .where(eq(sessions.id, sessionId));
}

/**
 * Update todo status and optionally set result
 */
export async function persistTodoStatus(
  todoId: string,
  status: string,
  result?: string
) {
  await db
    .update(todos)
    .set({
      status,
      ...(result && { result }),
    })
    .where(eq(todos.id, todoId));
}

// --- Agent persistence helpers ---

export async function persistAgent(agent: Agent) {
  await db.insert(agents).values({
    id: agent.id,
    sessionId: agent.sessionId,
    name: agent.name,
    status: agent.status,
    sandboxId: agent.sandboxId || null,
    streamUrl: agent.streamUrl || null,
    currentTaskId: agent.currentTaskId,
    tasksCompleted: agent.tasksCompleted || 0,
    tasksTotal: agent.tasksTotal || 0,
    createdAt: new Date(),
  });
}

export async function persistAgentStatus(agentId: string, status: string) {
  await db
    .update(agents)
    .set({ status })
    .where(eq(agents.id, agentId));
}

export async function persistAgentSandboxId(
  agentId: string,
  sandboxId: string
) {
  await db
    .update(agents)
    .set({ sandboxId })
    .where(eq(agents.id, agentId));
}

export async function persistAgentStreamUrl(
  agentId: string,
  streamUrl: string
) {
  await db
    .update(agents)
    .set({ streamUrl })
    .where(eq(agents.id, agentId));
}

export async function persistAgentHeartbeat(agentId: string) {
  await db
    .update(agents)
    .set({ lastHeartbeat: new Date() })
    .where(eq(agents.id, agentId));
}

export async function getSessionAgents(sessionId: string) {
  return db
    .select()
    .from(agents)
    .where(eq(agents.sessionId, sessionId));
}

export async function getSessionWithDetails(sessionId: string) {
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId));

  if (!session) return null;

  const sessionTodos = await db
    .select()
    .from(todos)
    .where(eq(todos.sessionId, sessionId));

  const sessionAgents = await db
    .select()
    .from(agents)
    .where(eq(agents.sessionId, sessionId));

  return { ...session, todos: sessionTodos, agents: sessionAgents };
}

/**
 * Get all sessions with their todos for a user, ordered by creation date DESC
 */
export async function getUserSessionsWithTodos(userId: string) {
  const userSessions = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.createdAt));

  const sessionsWithTodos = await Promise.all(
    userSessions.map(async (session) => {
      const sessionTodos = await db
        .select()
        .from(todos)
        .where(eq(todos.sessionId, session.id));

      return {
        ...session,
        todos: sessionTodos,
      };
    })
  );

  return sessionsWithTodos;
}
