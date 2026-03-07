import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSession, restoreSessionFromDb } from "@/lib/session-store";
import { getSessionWithDetails, persistSessionStatus } from "@/lib/db/session-persist";
import { respawnWorker } from "@/lib/worker-manager";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const authSession = await auth();
  if (!authSession?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // If already in memory, just return it
  const existing = getSession(id);
  if (existing) {
    return NextResponse.json(existing);
  }

  // Try to recover from database
  const dbSession = await getSessionWithDetails(id);
  if (!dbSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (dbSession.userId !== authSession.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Restore in-memory state
  const restored = restoreSessionFromDb(dbSession);

  // Respawn workers for agents with valid sandbox IDs
  if (restored.status === "running" || restored.status === "paused") {
    for (const agent of restored.agents) {
      if (
        agent.sandboxId &&
        (agent.status === "paused" || agent.status === "active" || agent.status === "idle")
      ) {
        try {
          respawnWorker(id, agent);
        } catch (err) {
          console.error(`[recover] Failed to respawn agent ${agent.id}:`, err);
        }
      }
    }

    // Transition from paused back to running
    if (restored.status === "paused") {
      restored.status = "running";
      persistSessionStatus(id, "running").catch(console.error);
    }
  }

  return NextResponse.json(restored);
}
