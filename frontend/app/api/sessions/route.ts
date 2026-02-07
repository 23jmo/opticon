import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import Dedalus from "dedalus-labs";
import { DedalusRunner } from "dedalus-labs";
import { createSession, addTodos, getSession } from "@/lib/session-store";

let runner: DedalusRunner | null = null;

function getRunner(): DedalusRunner {
  if (!runner) {
    const client = new Dedalus({ apiKey: process.env.DEDALUS_API_KEY });
    runner = new DedalusRunner(client);
  }
  return runner;
}

export async function POST(request: Request) {
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

  const sessionId = uuidv4();
  createSession(sessionId, prompt.trim(), agentCount);

  // Decompose prompt into TODOs via Dedalus
  let todoDescriptions: string[];
  try {
    const response = await getRunner().run({
      input: prompt.trim(),
      model: "anthropic/claude-sonnet-4-5-20250929",
      instructions: `You are a task decomposition engine. Given a user's prompt, break it down into independent, parallelizable tasks that can each be executed by an AI agent controlling a cloud desktop (browser, file system, etc).

Rules:
- Each task must be independently executable
- Tasks should be roughly equal in complexity
- Return ONLY valid JSON: { "todos": [{ "description": "..." }] }
- Target exactly ${agentCount} tasks (one per available agent)
- Be specific and actionable in each task description`,
      max_tokens: 1024,
    });

    const raw = (response as { finalOutput: string }).finalOutput
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    const parsed = JSON.parse(raw);
    todoDescriptions = parsed.todos.map(
      (t: { description: string }) => t.description,
    );
  } catch (error) {
    console.error("[orchestrator] Failed to decompose prompt:", error);
    const session = getSession(sessionId);
    if (session) session.status = "failed";
    return NextResponse.json(
      { error: "Failed to decompose prompt" },
      { status: 500 },
    );
  }

  // Add TODOs to session — do NOT start workers yet
  const todos = addTodos(sessionId, todoDescriptions);

  // Set session to pending_approval so the user can review tasks
  const session = getSession(sessionId);
  if (session) session.status = "pending_approval";

  return NextResponse.json({ sessionId, tasks: todos }, { status: 201 });
}
