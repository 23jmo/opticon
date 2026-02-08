import { db } from "./index";
import { replays } from "./schema";
import { eq } from "drizzle-orm";

/**
 * Persist a replay record after an agent uploads its frames to R2.
 */
export async function persistReplay(
  sessionId: string,
  agentId: string,
  manifestUrl: string,
  frameCount: number
) {
  await db.insert(replays).values({
    sessionId,
    agentId,
    manifestUrl,
    frameCount,
  });
}

/**
 * Get all replay records for a session.
 */
export async function getSessionReplays(sessionId: string) {
  return db
    .select()
    .from(replays)
    .where(eq(replays.sessionId, sessionId));
}
