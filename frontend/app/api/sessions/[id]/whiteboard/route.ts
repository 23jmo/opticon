import { NextResponse } from "next/server";
import { getSession } from "@/lib/session-store";
import { auth } from "@/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Allow demo mode without auth
  if (id === "demo") {
    const session = getSession(id);
    return session
      ? NextResponse.json({ content: session.whiteboard || "" })
      : NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const authSession = await auth();
  if (!authSession?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = getSession(id);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.userId && session.userId !== authSession.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ content: session.whiteboard || "" });
}
