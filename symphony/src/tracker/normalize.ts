// Issue normalization helpers (§11.3)

import type { Issue } from "../types.js";

/**
 * Sort issues by: priority asc → created_at asc → identifier asc (§8.2)
 * Null priority sorts last.
 */
export function sortCandidates(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => {
    // Priority ascending (null/undefined sorts last as Infinity)
    const pa = a.priority ?? Infinity;
    const pb = b.priority ?? Infinity;
    if (pa !== pb) return pa - pb;

    // Created_at ascending (null sorts last)
    const ca = a.created_at ?? "";
    const cb = b.created_at ?? "";
    if (ca !== cb) return ca < cb ? -1 : 1;

    // Identifier ascending (lexicographic)
    return a.identifier.localeCompare(b.identifier);
  });
}

/**
 * Check if an issue has non-terminal blockers (§8.2 Todo blocker rule).
 */
export function hasNonTerminalBlockers(issue: Issue, terminalStates: string[]): boolean {
  return issue.blocked_by.some(
    (blocker) => !terminalStates.includes(blocker.state),
  );
}

/**
 * Filter candidates for eligibility (§8.2).
 */
export function filterEligible(
  issues: Issue[],
  activeStates: string[],
  terminalStates: string[],
  runningIds: Set<string>,
  claimedIds: Set<string>,
): Issue[] {
  return issues.filter((issue) => {
    // Must have required fields
    if (!issue.id || !issue.identifier || !issue.title || !issue.state) return false;

    // Must be in an active state
    if (!activeStates.includes(issue.state)) return false;

    // Not already running or claimed
    if (runningIds.has(issue.id) || claimedIds.has(issue.id)) return false;

    // No non-terminal blockers
    if (hasNonTerminalBlockers(issue, terminalStates)) return false;

    return true;
  });
}
