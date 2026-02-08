/**
 * K2 Think API client for task decomposition
 * Using IFM's advanced reasoning model
 */

const K2_API_URL = process.env.K2_API_URL || "https://api.k2think.ai/v1/chat/completions";
const K2_API_KEY = process.env.K2_THINK_API_KEY || "IFM-Zps61SP4gl0nSMPE";
const K2_MODEL = "MBZUAI-IFM/K2-Think-v2";

interface K2Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface K2Response {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
}

/**
 * Extract the first valid JSON object from a string by tracking balanced braces.
 * Handles cases where K2 Think returns reasoning text before/after the JSON.
 */
function extractJSON(text: string): string {
  // First try: extract from markdown code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim();
  }

  // Find the first '{' and walk forward tracking brace depth
  const start = text.indexOf("{");
  if (start === -1) throw new Error("No JSON object found in response");

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  throw new Error("No complete JSON object found (unbalanced braces)");
}

/**
 * Call K2 Think model with advanced reasoning
 */
export async function callK2Think(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const messages: K2Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  console.log(`[K2 Think] Calling API at ${K2_API_URL}`);

  const response = await fetch(K2_API_URL, {
    method: "POST",
    headers: {
      "accept": "application/json",
      "Authorization": `Bearer ${K2_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: K2_MODEL,
      messages,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`K2 Think API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as K2Response;
  const content = data.choices[0].message.content;
  console.log("[K2 Think] Raw response:", content.substring(0, 300));
  return content;
}

/**
 * Parse a K2 Think response, extracting the todos JSON.
 */
function parseTodosResponse(response: string): string[] {
  const json = extractJSON(response);
  console.log("[K2 Think] Extracted JSON:", json.substring(0, 200));

  const parsed = JSON.parse(json);
  if (!parsed.todos || !Array.isArray(parsed.todos)) {
    throw new Error("Response missing 'todos' array");
  }
  return parsed.todos.map((t: { description: string }) => t.description);
}

/**
 * Decompose a prompt into independent, parallelizable task descriptions
 * using K2 Think's advanced reasoning.
 */
export async function decomposeTasksWithK2(
  prompt: string,
  agentCount: number
): Promise<string[]> {
  const systemPrompt = `You are a task decomposition engine. Given a user's prompt, break it down into independent, parallelizable tasks that can each be executed by an AI agent controlling a cloud desktop (browser, file system, etc).

Rules:
- Each task must be independently executable
- Tasks should be roughly equal in complexity
- Return ONLY valid JSON: { "todos": [{ "description": "..." }] }
- Target exactly ${agentCount} tasks (one per available agent)
- Be specific and actionable in each task description
- Do NOT include any text before or after the JSON`;

  const response = await callK2Think(systemPrompt, prompt.trim());
  return parseTodosResponse(response);
}

/**
 * Refine a task list based on user feedback using K2 Think's reasoning
 */
export async function refineTasksWithK2(
  originalPrompt: string,
  currentTasks: string[],
  refinement: string
): Promise<string[]> {
  const systemPrompt = `You are a task refinement engine. Given the original prompt, current task list, and a user refinement request, update the task list accordingly.

Rules:
- Each task must be independently executable
- Tasks should be roughly equal in complexity
- Return ONLY valid JSON: { "todos": [{ "description": "..." }] }
- Honor the user's refinement request (add tasks, modify existing ones, remove tasks, etc.)
- Be specific and actionable in each task description
- Do NOT include any text before or after the JSON`;

  const userPrompt = `Original prompt: ${originalPrompt}

Current tasks:
${currentTasks.map((t, i) => `${i + 1}. ${t}`).join("\n")}

User refinement: ${refinement.trim()}`;

  const response = await callK2Think(systemPrompt, userPrompt);
  return parseTodosResponse(response);
}
