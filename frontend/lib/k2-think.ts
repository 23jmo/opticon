/**
 * K2 Think API client for task decomposition
 * Using IFM's advanced reasoning model
 *
 * API is OpenAI-compatible. Try these endpoints in order:
 * 1. https://k2think.ai/v1/chat/completions (k2think.ai)
 * 2. https://api.k2think.ai/v1/chat/completions (subdomain)
 * 3. https://api.openai.com/v1/chat/completions (fallback with custom base)
 */

const K2_API_URL = process.env.K2_API_URL || "https://k2think.ai/v1/chat/completions";
const K2_API_KEY = process.env.K2_THINK_API_KEY || "IFM-Zps61SP4gl0nSMPE";

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
 * Call K2 Think model with advanced reasoning
 */
export async function callK2Think(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 2048
): Promise<string> {
  const messages: K2Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  console.log(`[K2 Think] Calling API at ${K2_API_URL}`);

  try {
    const response = await fetch(K2_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${K2_API_KEY}`,
      },
      body: JSON.stringify({
        model: "k2-think",
        messages,
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[K2 Think] API error (${response.status}):`, errorText);
      throw new Error(
        `K2 Think API error (${response.status}): ${errorText}`
      );
    }

    const data = (await response.json()) as K2Response;
    return data.choices[0].message.content;
  } catch (error) {
    console.error("[K2 Think] Fetch failed:", error);
    throw new Error(
      `K2 Think API unavailable. Please check the endpoint: ${K2_API_URL}. Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Decompose a prompt into independent, parallelizable task descriptions
 * using K2 Think's advanced reasoning.
 */
export async function decomposeTasksWithK2(
  prompt: string,
  agentCount: number
): Promise<string[]> {
  const systemPrompt = `You are a task decomposition engine using advanced multi-step reasoning. Given a user's prompt, break it down into independent, parallelizable tasks that can each be executed by an AI agent controlling a cloud desktop (browser, file system, etc).

Rules:
- Each task must be independently executable
- Tasks should be roughly equal in complexity
- Use your reasoning capabilities to think through task dependencies and optimal parallelization
- Return ONLY valid JSON: { "todos": [{ "description": "..." }] }
- Target exactly ${agentCount} tasks (one per available agent)
- Be specific and actionable in each task description`;

  const userPrompt = prompt.trim();

  const response = await callK2Think(systemPrompt, userPrompt, 2048);

  // Parse JSON response
  const raw = response
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const parsed = JSON.parse(raw);
  return parsed.todos.map((t: { description: string }) => t.description);
}

/**
 * Refine a task list based on user feedback using K2 Think's reasoning
 */
export async function refineTasksWithK2(
  originalPrompt: string,
  currentTasks: string[],
  refinement: string
): Promise<string[]> {
  const systemPrompt = `You are a task refinement engine using advanced multi-step reasoning. Given the original prompt, current task list, and a user refinement request, update the task list accordingly.

Rules:
- Each task must be independently executable
- Tasks should be roughly equal in complexity
- Use your reasoning to understand the user's intent and make intelligent modifications
- Return ONLY valid JSON: { "todos": [{ "description": "..." }] }
- Honor the user's refinement request (add tasks, modify existing ones, remove tasks, etc.)
- Be specific and actionable in each task description`;

  const userPrompt = `Original prompt: ${originalPrompt}

Current tasks:
${currentTasks.map((t, i) => `${i + 1}. ${t}`).join("\n")}

User refinement: ${refinement.trim()}`;

  const response = await callK2Think(systemPrompt, userPrompt, 2048);

  // Parse JSON response
  const raw = response
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const parsed = JSON.parse(raw);
  return parsed.todos.map((t: { description: string }) => t.description);
}
