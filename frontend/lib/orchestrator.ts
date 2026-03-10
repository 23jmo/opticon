import Dedalus from "dedalus-labs";

const client = new Dedalus();

/** A single task with its lane assignment from the orchestrator. */
export interface DecomposedTask {
  description: string;
  lane: number;
}

/**
 * Decompose a prompt into granular, step-by-step tasks grouped into parallel
 * lanes using Claude Sonnet via the Dedalus Labs API.
 *
 * Each lane represents an independent stream of work that one agent handles
 * sequentially. Different lanes run in parallel.
 *
 * When `taskCount` is provided the LLM produces exactly that many tasks.
 * When omitted the LLM decides (up to `maxTasks`). Lanes are capped at
 * `maxLanes`.
 */
export async function decomposeTasks(
  prompt: string,
  taskCount?: number,
  maxTasks: number = 10,
  maxLanes: number = 4,
): Promise<DecomposedTask[]> {
  const countInstruction = taskCount
    ? `exactly ${taskCount}`
    : `as many as needed (minimum 1, maximum ${maxTasks})`;

  const response = await client.chat.completions.create({
    model: "anthropic/claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "system",
        content: `You are a JSON API that breaks user requests into small, simple, granular tasks grouped into parallel lanes. You respond with raw JSON only, never natural language.

Each lane is assigned to one AI agent on its own cloud desktop with a browser and terminal. Tasks within a lane run sequentially (the agent does task 1, then task 2, etc.). Different lanes run in parallel on separate machines.

Deciding lanes:
- Group tasks into the same lane when they depend on each other or share state (same browser session, same terminal, same files)
- Use separate lanes only for work that is truly independent (e.g. researching two different companies, setting up two unrelated services)
- Most requests need just 1 lane. Use multiple lanes only when there's a clear parallelism opportunity.
- Maximum ${maxLanes} lanes.

Bias toward simplicity and granularity:
- Each task should be ONE simple action or a very short sequence (2-3 steps max)
- Prefer many small tasks over fewer complex ones
- Bad: "Set up a Node.js project with Express, add routes, configure middleware, and deploy"
- Good: "Open terminal. Run npm init -y && npm install express. Create index.js with a hello world Express server listening on port 3000."
- Bad: "Research competitors and create a comparison spreadsheet"
- Good: "Open browser and go to google.com. Search for [specific competitor]. Find their pricing page and note the plan names and prices."

Rules for each task description:
- Start with the literal first action: "Open browser and go to ..." or "Open terminal and run ..."
- Use specific URLs, commands, file paths, and values — never say "appropriate" or "as needed"
- End with how the agent knows it's done: "Confirm the page shows ..." or "Verify the file exists"
- No branching, conditionals, or "if X then Y" logic — keep it linear
- One sentence is fine. Three sentences is the max.`,
      },
      {
        role: "user",
        content: `Break the following request into ${countInstruction} small, granular tasks grouped into lanes. Each task should be a simple, concrete action. Err on the side of more tasks — it's better to have 5 small todos than 2 big ones.

Request: ${prompt.trim()}

Return a JSON object with a "todos" array where each item has:
- "description": the task instruction
- "lane": integer lane number (starting from 0)

Tasks within the same lane will run in order. Different lanes run in parallel.`,
      },
    ],
  });

  let text = response.choices[0].message.content || "";
  console.log("[orchestrator] Sonnet response:", text.substring(0, 500));

  // Strip markdown code fences if present
  text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");

  const parsed = JSON.parse(text);
  if (!parsed.todos || !Array.isArray(parsed.todos)) {
    throw new Error("Response missing 'todos' array");
  }

  const todos: DecomposedTask[] = parsed.todos
    .slice(0, maxTasks)
    .map((t: { description: string; lane?: number }) => ({
      description: t.description,
      lane: Math.min(t.lane ?? 0, maxLanes - 1),
    }));

  return todos;
}
