import { decomposeTasksWithK2 } from "./k2-think";

/**
 * Decompose a prompt into independent, parallelizable task descriptions
 * using K2 Think's advanced reasoning.
 */
export async function decomposeTasks(
  prompt: string,
  agentCount: number
): Promise<string[]> {
  return decomposeTasksWithK2(prompt, agentCount);
}
