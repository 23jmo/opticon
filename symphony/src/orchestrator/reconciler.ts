// Stall detection + tracker state refresh (§8.5)

import type { OrchestratorState, RunningEntry } from "../types.js";
import type { LinearClient } from "../tracker/linear-client.js";
import type { WorkspaceManager } from "../workspace/workspace-manager.js";
import { createLogger } from "../util/logger.js";

const log = createLogger("reconciler");

export interface ReconcileResult {
  stalled: string[];
  terminal: string[];
  updated: string[];
  unknown: string[];
}

/**
 * Reconcile running issues (§8.5).
 *
 * Part A: Stall detection — if elapsed > stall_timeout_ms, kill + retry
 * Part B: Tracker refresh — check issue states against tracker
 */
export async function reconcileRunningIssues(
  state: OrchestratorState,
  tracker: LinearClient,
  workspaceManager: WorkspaceManager,
  stallTimeoutMs: number,
  terminalStates: string[],
  activeStates: string[],
): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    stalled: [],
    terminal: [],
    updated: [],
    unknown: [],
  };

  const runningEntries = Array.from(state.running.entries());
  if (runningEntries.length === 0) return result;

  // Part A: Stall detection
  const now = Date.now();
  for (const [issueId, entry] of runningEntries) {
    const lastActivity = entry.session?.last_codex_timestamp
      ? new Date(entry.session.last_codex_timestamp).getTime()
      : entry.started_at_ms;

    const elapsed = now - lastActivity;

    if (elapsed > stallTimeoutMs) {
      log.warn(
        `Issue ${entry.issue.identifier} stalled (${Math.round(elapsed / 1000)}s since last activity)`,
        { identifier: entry.issue.identifier },
      );
      result.stalled.push(issueId);
      // Kill the stalled agent
      entry.abort_controller.abort();
    }
  }

  // Part B: Tracker state refresh
  const issueIds = runningEntries
    .filter(([id]) => !result.stalled.includes(id))
    .map(([id]) => id);

  if (issueIds.length === 0) return result;

  try {
    const stateMap = await tracker.fetchIssueStatesByIds(issueIds);

    for (const [issueId, entry] of runningEntries) {
      if (result.stalled.includes(issueId)) continue;

      const currentState = stateMap.get(issueId);
      if (!currentState) {
        // Issue not found in tracker
        log.warn(`Issue ${entry.issue.identifier} not found in tracker`, {
          identifier: entry.issue.identifier,
        });
        result.unknown.push(issueId);
        entry.abort_controller.abort();
        continue;
      }

      if (terminalStates.includes(currentState)) {
        // Terminal state — kill agent and clean workspace
        log.info(
          `Issue ${entry.issue.identifier} moved to terminal state "${currentState}"`,
          { identifier: entry.issue.identifier },
        );
        result.terminal.push(issueId);
        entry.abort_controller.abort();
        // Workspace cleanup will be handled by the orchestrator after agent stops
      } else if (activeStates.includes(currentState)) {
        // Still active — update snapshot
        if (entry.issue.state !== currentState) {
          log.info(
            `Issue ${entry.issue.identifier} state updated: "${entry.issue.state}" → "${currentState}"`,
            { identifier: entry.issue.identifier },
          );
          entry.issue.state = currentState;
          result.updated.push(issueId);
        }
      } else {
        // Neither terminal nor active — kill, no cleanup
        log.warn(
          `Issue ${entry.issue.identifier} in unexpected state "${currentState}", stopping agent`,
          { identifier: entry.issue.identifier },
        );
        result.unknown.push(issueId);
        entry.abort_controller.abort();
      }
    }
  } catch (err) {
    log.error(`Reconciliation tracker refresh failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}
