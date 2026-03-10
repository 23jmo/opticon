/**
 * Slack integration module for the Opticon bot.
 *
 * Re-exports all public APIs from the Slack subsystem.
 */

export { createSlackApp, getSlackApp } from "./app";
export {
  postMilestoneToSlack,
  postCompletionToSlack,
  postErrorToSlack,
  postDestructiveConfirmToSlack,
  postCheckpointToSlack,
} from "./app";

export {
  createSlackSession,
  decomposeSlackSession,
  executeSlackSession,
  getSlackSession,
  getSlackSessionBySessionId,
  updateSlackSessionStatus,
  completeSlackSession,
  stopSlackSession,
} from "./session-adapter";

export {
  buildClarificationMessage,
  buildConfirmationMessage,
  buildMilestoneMessage,
  buildCompletionMessage,
  buildErrorMessage,
  buildDestructiveConfirmMessage,
  buildCheckpointMessage,
} from "./blocks";

export { summarizeActions } from "./summarize-actions";
export type { BufferedAction } from "./summarize-actions";

export type {
  SlackThreadSession,
  SlackThreadSessionStatus,
  ClarificationQuestion,
  MilestoneUpdate,
  SlackTaskResult,
  TaskResultLine,
} from "./types";
