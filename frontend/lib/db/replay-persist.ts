import { db } from "./index";
import { replays } from "./schema";
import { eq } from "drizzle-orm";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const REPLAY_DIR =
  process.env.REPLAY_DIR || join(process.cwd(), ".replays");

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

/**
 * Scan local .replays/{sessionId}/ directory for agent replay data.
 * Used as a fallback when the DB has no records (e.g. replay:complete
 * socket event never persisted to DB).
 */
export async function scanLocalReplays(sessionId: string) {
  const sessionDir = join(REPLAY_DIR, sessionId);

  let agentDirs: string[];
  try {
    const entries = await readdir(sessionDir, { withFileTypes: true });
    agentDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }

  const results: { agentId: string; manifestUrl: string; frameCount: number }[] = [];

  for (const agentId of agentDirs) {
    const manifestPath = join(sessionDir, agentId, "manifest.json");
    try {
      const raw = await readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(raw);
      results.push({
        agentId,
        manifestUrl: `/api/replay/serve/${sessionId}/${agentId}/manifest.json`,
        frameCount: manifest.frameCount ?? 0,
      });
    } catch {
      // No manifest for this agent directory — skip
    }
  }

  return results;
}
