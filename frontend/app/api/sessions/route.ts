import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { createSession, addTodos, getSession } from "@/lib/session-store";
import { auth } from "@/auth";
import { getMaxAgentsForUser } from "@/lib/billing";
import {
  persistSession,
  persistTodos,
  persistSessionStatus,
} from "@/lib/db/session-persist";
import { decomposeTasks } from "@/lib/orchestrator";

export async function POST(request: Request) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { prompt, agentCount } = body as {
    prompt: string;
    agentCount: number;
  };

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  if (
    !agentCount ||
    typeof agentCount !== "number" ||
    agentCount < 1 ||
    agentCount > 4
  ) {
    return NextResponse.json(
      { error: "agentCount must be between 1 and 4" },
      { status: 400 },
    );
  }

  const maxAgents = await getMaxAgentsForUser(authSession.user.id);
  if (agentCount > maxAgents) {
    return NextResponse.json(
      {
        error: `Your plan allows up to ${maxAgents} agents.`,
        code: "PLAN_LIMIT_EXCEEDED",
        maxAgents,
      },
      { status: 403 },
    );
  }

  const sessionId = uuidv4();
  createSession(sessionId, prompt.trim(), agentCount, authSession.user.id);

  // Persist session to database
  persistSession(
    sessionId,
    authSession.user.id,
    prompt.trim(),
    agentCount,
    "decomposing"
  ).catch(console.error);

  // Decompose prompt into TODOs via Dedalus
  let todoDescriptions: string[];
  try {
    todoDescriptions = await decomposeTasks(prompt.trim(), agentCount);
  } catch (error) {
    console.error("[orchestrator] Failed to decompose prompt:", error);
    const failedSession = getSession(sessionId);
    if (failedSession) failedSession.status = "failed";
    return NextResponse.json(
      { error: "Failed to decompose prompt" },
      { status: 500 },
    );
  }

  // Add TODOs to session — do NOT start workers yet
  const todos = addTodos(sessionId, todoDescriptions);

  // Persist todos to database
  persistTodos(sessionId, todos).catch(console.error);

  // Set session to pending_approval so the user can review tasks
  const opticonSession = getSession(sessionId);
  if (opticonSession) {
    opticonSession.status = "pending_approval";
    // Persist status update
    persistSessionStatus(sessionId, "pending_approval").catch(console.error);
  }

  return NextResponse.json({ sessionId, tasks: todos }, { status: 201 });
}
