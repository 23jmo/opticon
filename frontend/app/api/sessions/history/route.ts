import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserSessionsWithTodos } from "@/lib/db/session-persist";

export async function GET() {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sessions = await getUserSessionsWithTodos(authSession.user.id);
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("[history] Failed to fetch session history:", error);
    return NextResponse.json(
      { error: "Failed to fetch session history" },
      { status: 500 }
    );
  }
}
