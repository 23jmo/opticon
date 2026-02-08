import { NextResponse } from "next/server";
import { getSession, updateTodos } from "@/lib/session-store";
import { auth } from "@/auth";
import { persistTodos } from "@/lib/db/session-persist";
import Dedalus from "dedalus-labs";
import { DedalusRunner } from "dedalus-labs";

let runner: DedalusRunner | null = null;

function getRunner(): DedalusRunner {
  if (!runner) {
    const client = new Dedalus({ apiKey: process.env.DEDALUS_API_KEY });
    runner = new DedalusRunner(client);
  }
  return runner;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: sessionId } = await params;
  const session = getSession(sessionId);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.status !== "pending_approval") {
    return NextResponse.json(
      { error: "Session is not pending approval" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const { refinement, currentTasks } = body as {
    refinement: string;
    currentTasks: string[];
  };

  if (
    !refinement ||
    typeof refinement !== "string" ||
    refinement.trim().length === 0
  ) {
    return NextResponse.json(
      { error: "Refinement is required" },
      { status: 400 }
    );
  }

  // Use Claude Sonnet to refine the task list
  let todoDescriptions: string[];
  try {
    const response = await getRunner().run({
      input: `Original prompt: ${session.prompt}

Current tasks:
${currentTasks.map((t, i) => `${i + 1}. ${t}`).join("\n")}

User refinement: ${refinement.trim()}`,
      model: "anthropic/claude-sonnet-4-5-20250929",
      instructions: `You are a task refinement engine. Given the original prompt, current task list, and a user refinement request, update the task list accordingly.

Rules:
- Each task must be independently executable
- Tasks should be roughly equal in complexity
- Return ONLY valid JSON: { "todos": [{ "description": "..." }] }
- Honor the user's refinement request (add tasks, modify existing ones, remove tasks, etc.)
- Be specific and actionable in each task description`,
      max_tokens: 1024,
    });

    const raw = (response as { finalOutput: string }).finalOutput
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    const parsed = JSON.parse(raw);
    todoDescriptions = parsed.todos.map(
      (t: { description: string }) => t.description
    );
  } catch (error) {
    console.error("[refine] Failed to refine tasks:", error);
    return NextResponse.json(
      { error: "Failed to refine tasks" },
      { status: 500 }
    );
  }

  // Update todos in session
  const todos = updateTodos(sessionId, todoDescriptions);

  // Persist updated todos to database
  persistTodos(sessionId, todos).catch(console.error);

  return NextResponse.json({ todos }, { status: 200 });
}
