// JSON API handlers (§13.7)

import type { OrchestratorState, RetryEntry, RuntimeEvent } from "../types.js";

interface StateResponse {
  running: Array<{
    issue_id: string;
    identifier: string;
    title: string;
    state: string;
    started_at: string;
    elapsed_ms: number;
    session: {
      turn_count: number;
      total_tokens: number;
      last_event: string | null;
    } | null;
  }>;
  retry_queue: Array<{
    identifier: string;
    attempt: number;
    due_in_ms: number;
    error: string | null;
  }>;
  completed_count: number;
  codex_totals: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    seconds_running: number;
  };
  rate_limits: unknown | null;
}

export function buildStateResponse(
  state: OrchestratorState,
  retryEntries: RetryEntry[],
): StateResponse {
  const now = Date.now();

  return {
    running: Array.from(state.running.values()).map((entry) => ({
      issue_id: entry.issue.id,
      identifier: entry.issue.identifier,
      title: entry.issue.title,
      state: entry.issue.state,
      started_at: entry.run_attempt.started_at,
      elapsed_ms: now - entry.started_at_ms,
      session: entry.session
        ? {
            turn_count: entry.session.turn_count,
            total_tokens: entry.session.codex_total_tokens,
            last_event: entry.session.last_codex_event,
          }
        : null,
    })),
    retry_queue: retryEntries.map((entry) => ({
      identifier: entry.identifier,
      attempt: entry.attempt,
      due_in_ms: Math.max(0, entry.due_at_ms - now),
      error: entry.error,
    })),
    completed_count: state.completed.size,
    codex_totals: { ...state.codex_totals },
    rate_limits: state.codex_rate_limits,
  };
}

interface IssueDetailResponse {
  issue: {
    id: string;
    identifier: string;
    title: string;
    state: string;
    priority: number | null;
    labels: string[];
  };
  workspace_path: string;
  run_attempt: {
    attempt: number | null;
    started_at: string;
    status: string;
    error?: string;
  };
  session: {
    session_id: string;
    turn_count: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    last_event: string | null;
    last_message: string;
  } | null;
  events: RuntimeEvent[];
}

export function buildIssueDetailResponse(
  state: OrchestratorState,
  identifier: string,
  allEvents: RuntimeEvent[],
): IssueDetailResponse | null {
  // Find running entry by identifier
  for (const [, entry] of state.running) {
    if (entry.issue.identifier === identifier) {
      const issueEvents = allEvents.filter((e) => e.issue_id === entry.issue.id);

      return {
        issue: {
          id: entry.issue.id,
          identifier: entry.issue.identifier,
          title: entry.issue.title,
          state: entry.issue.state,
          priority: entry.issue.priority,
          labels: entry.issue.labels,
        },
        workspace_path: entry.run_attempt.workspace_path,
        run_attempt: {
          attempt: entry.run_attempt.attempt,
          started_at: entry.run_attempt.started_at,
          status: entry.run_attempt.status,
          error: entry.run_attempt.error,
        },
        session: entry.session
          ? {
              session_id: entry.session.session_id,
              turn_count: entry.session.turn_count,
              input_tokens: entry.session.codex_input_tokens,
              output_tokens: entry.session.codex_output_tokens,
              total_tokens: entry.session.codex_total_tokens,
              last_event: entry.session.last_codex_event,
              last_message: entry.session.last_codex_message,
            }
          : null,
        events: issueEvents,
      };
    }
  }

  return null;
}
