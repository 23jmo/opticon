import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserSessionsWithTodos } from "@/lib/db/session-persist";
import { getLatestThumbnail } from "@/lib/session-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sessions = await getUserSessionsWithTodos(authSession.user.id);

    const sessionsWithThumbnails = sessions.map(
      (s: { id: string; status: string }) => ({
        ...s,
        latestThumbnail:
          s.status === "running" ? getLatestThumbnail(s.id) : undefined,
      })
    );

    return NextResponse.json({ sessions: sessionsWithThumbnails });
  } catch (error) {
    console.error("[history] Failed to fetch session history:", error);
    return NextResponse.json(
      { error: "Failed to fetch session history" },
      { status: 500 }
    );
  }
}
