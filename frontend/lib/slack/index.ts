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
} from "./app";

export {
  createSlackSession,
  startSlackSession,
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
} from "./blocks";

export type {
  SlackThreadSession,
  SlackThreadSessionStatus,
  ClarificationQuestion,
  MilestoneUpdate,
  SlackTaskResult,
} from "./types";
