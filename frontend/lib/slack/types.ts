/**
 * Slack integration type definitions for the Opticon Slack bot.
 *
 * These types model the mapping between Slack threads and Panopticon sessions,
 * clarification questions rendered via Block Kit, milestone updates during
 * execution, and task completion results delivered back to Slack.
 */

/** Status of a Slack thread session through its lifecycle. */
export type SlackThreadSessionStatus =
  | "clarifying"
  | "pending_approval"
  | "running"
  | "waiting_input"
  | "completed"
  | "failed";

/** Maps a Slack thread to a Panopticon orchestration session. */
export interface SlackThreadSession {
  /** Slack thread timestamp, used as the unique thread identifier. */
  threadTs: string;
  /** Slack channel ID where the thread lives. */
  channelId: string;
  /** Panopticon session ID (from session-store). */
  sessionId: string;
  /** Slack user ID of the person who triggered the bot. */
  userId: string;
  /** Slack workspace (team) ID, for future multi-tenant support. */
  teamId: string;
  /** Current status of this thread session. */
  status: SlackThreadSessionStatus;
  /** Epoch milliseconds when the session was created. */
  createdAt: number;
}

/**
 * A clarification question to present to the user via Block Kit.
 * If `options` is provided, the question is rendered as a row of buttons.
 * Otherwise it is displayed as plain text and the user replies in-thread.
 */
export interface ClarificationQuestion {
  /** Unique identifier for this question, used in action_id construction. */
  id: string;
  /** The question text shown to the user. */
  text: string;
  /** Optional predefined answer choices rendered as buttons. */
  options?: string[];
}

/** A milestone update emitted by an agent during task execution. */
export interface MilestoneUpdate {
  /** Identifier of the agent that produced this milestone. */
  agentId: string;
  /** Human-readable milestone description. */
  message: string;
  /** ISO 8601 timestamp of the milestone event. */
  timestamp: string;
}

/** Result payload delivered to Slack when a task completes. */
export interface SlackTaskResult {
  /** Panopticon session ID. */
  sessionId: string;
  /** Slack thread timestamp to reply into. */
  threadTs: string;
  /** Slack channel ID to post the result in. */
  channelId: string;
  /** Human-readable summary of what was accomplished. */
  summary: string;
  /** Local filesystem path to the timelapse GIF, if one was generated. */
  gifPath?: string;
  /** Local filesystem paths to any output files produced by the agents. */
  outputFiles?: string[];
}
