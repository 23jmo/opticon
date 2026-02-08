import { NextResponse } from "next/server";
import { getSessionReplays } from "@/lib/db/replay-persist";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const replayRecords = await getSessionReplays(sessionId);

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
