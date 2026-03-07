/**
 * Slack-to-Panopticon session adapter.
 *
 * Bridges Slack threads and the existing Panopticon session system by
 * maintaining an in-memory mapping of Slack threads to sessions and
 * delegating to the existing session-store, orchestrator, worker-manager,
 * and persistence layer.
 */

import { v4 as uuidv4 } from "uuid";
import type { SlackThreadSession, SlackThreadSessionStatus } from "./types";
import { createSession, getSession, addTodos } from "../session-store";
import { decomposeTasks } from "../orchestrator";
import { spawnWorkers, killAllWorkers } from "../worker-manager";
import {
  persistSession,
  persistTodos,
  persistSessionStatus,
} from "../db/session-persist";

// ---------------------------------------------------------------------------
// In-memory store (survives HMR in dev via globalThis)
// ---------------------------------------------------------------------------

const globalAdapter = globalThis as unknown as {
  __slack_sessions?: Map<string, SlackThreadSession>;
};
const slackSessions = (globalAdapter.__slack_sessions ??= new Map<
  string,
  SlackThreadSession
>());

/** Build the map key for a Slack thread. */
function threadKey(channelId: string, threadTs: string): string {
  return `${channelId}:${threadTs}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new Panopticon session linked to a Slack thread.
 *
 * Generates a UUID session ID, creates the in-memory SlackThreadSession
 * (status "clarifying"), registers it in the Panopticon session-store,
 * and persists the session to the database.
 */
export async function createSlackSession(
  threadTs: string,
  channelId: string,
  slackUserId: string,
  teamId: string,
  prompt: string,
  agentCount: number = 1,
): Promise<SlackThreadSession> {
  const sessionId = uuidv4();

  const slackSession: SlackThreadSession = {
    threadTs,
    channelId,
    sessionId,
    userId: slackUserId,
    teamId,
    status: "clarifying",
    createdAt: Date.now(),
  };

  slackSessions.set(threadKey(channelId, threadTs), slackSession);

  // Register in the Panopticon in-memory session store
  createSession(sessionId, prompt, agentCount, slackUserId);

  // Persist to database
  await persistSession(sessionId, slackUserId, prompt, agentCount, "clarifying");

  return slackSession;
}

/**
 * Start a previously created Slack session: decompose the prompt into tasks,
 * persist them, update statuses, and spawn Python agent workers.
 *
 * Returns the decomposed task descriptions.
 */
export async function startSlackSession(
  threadTs: string,
  channelId: string,
): Promise<{ descriptions: string[] }> {
  const slackSession = slackSessions.get(threadKey(channelId, threadTs));
  if (!slackSession) {
    throw new Error(
      `No Slack session found for channel=${channelId} thread=${threadTs}`,
    );
  }

  const session = getSession(slackSession.sessionId);
  if (!session) {
    throw new Error(`Panopticon session ${slackSession.sessionId} not found`);
  }

  // Decompose the prompt into independent tasks
  const descriptions = await decomposeTasks(session.prompt, session.agentCount);

  // Add tasks to the in-memory session store
  const todos = addTodos(slackSession.sessionId, descriptions);

  // Persist tasks to the database
  await persistTodos(slackSession.sessionId, todos);

  // Transition to running
  slackSession.status = "running";
  session.status = "running";

  // Spawn Python agent workers
  spawnWorkers(slackSession.sessionId, session.agentCount);

  return { descriptions };
}

/**
 * Look up a SlackThreadSession by its Slack thread coordinates.
 */
export function getSlackSession(
  threadTs: string,
  channelId: string,
): SlackThreadSession | undefined {
  return slackSessions.get(threadKey(channelId, threadTs));
}

/**
 * Look up a SlackThreadSession by its Panopticon session ID.
 */
export function getSlackSessionBySessionId(
  sessionId: string,
): SlackThreadSession | undefined {
  const entries = Array.from(slackSessions.values());
  return entries.find((s) => s.sessionId === sessionId);
}

/**
 * Update the in-memory status of a Slack thread session.
 */
export function updateSlackSessionStatus(
  threadTs: string,
  channelId: string,
  status: SlackThreadSessionStatus,
): void {
  const slackSession = slackSessions.get(threadKey(channelId, threadTs));
  if (slackSession) {
    slackSession.status = status;
  }
}

/**
 * Mark a Slack session as completed and persist the status with a
 * completion timestamp.
 */
export async function completeSlackSession(
  threadTs: string,
  channelId: string,
): Promise<void> {
  const slackSession = slackSessions.get(threadKey(channelId, threadTs));
  if (!slackSession) return;

  slackSession.status = "completed";
  await persistSessionStatus(
    slackSession.sessionId,
    "completed",
    new Date(),
  );
}

/**
 * Stop a Slack session: kill all agent workers, mark as failed, and
 * persist the status.
 */
export async function stopSlackSession(
  threadTs: string,
  channelId: string,
): Promise<void> {
  const slackSession = slackSessions.get(threadKey(channelId, threadTs));
  if (!slackSession) return;

  slackSession.status = "failed";
  killAllWorkers(slackSession.sessionId);
  await persistSessionStatus(slackSession.sessionId, "failed");
}
