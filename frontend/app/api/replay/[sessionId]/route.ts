import { NextResponse } from "next/server";
import { getSessionReplays, scanLocalReplays } from "@/lib/db/replay-persist";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    let replayRecords = await getSessionReplays(sessionId);

    // Fallback: scan local .replays/ directory when DB has no records
    if (replayRecords.length === 0) {
      const localReplays = await scanLocalReplays(sessionId);
      if (localReplays.length > 0) {
        return NextResponse.json({ replays: localReplays });
      }
    }

    return NextResponse.json({
      replays: replayRecords.map((r) => ({
        agentId: r.agentId,
        manifestUrl: r.manifestUrl,
        frameCount: r.frameCount,
      })),
    });
  } catch (error) {
    console.error("[api/replay] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch replays" },
      { status: 500 }
    );
  }
}
