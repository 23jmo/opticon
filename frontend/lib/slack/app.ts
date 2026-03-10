/**
 * Slack Bolt app initialization and event handlers for the Opticon bot.
 *
 * Creates a Socket Mode Slack app that handles @mentions, button interactions,
 * and posts updates (milestones, completions, errors) back to Slack threads.
 */

import { App } from "@slack/bolt";
import type { KnownBlock } from "@slack/types";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  createSlackSession,
  decomposeSlackSession,
  executeSlackSession,
  getSlackSession,
  getSlackSessionBySessionId,
  stopSlackSession,
} from "./session-adapter";

import {
  buildConfirmationMessage,
  buildMilestoneMessage,
  buildCompletionMessage,
  buildErrorMessage,
  buildDestructiveConfirmMessage,
  buildCheckpointMessage,
} from "./blocks";

import { getIO } from "../socket";
import type { SlackTaskResult, TaskResultLine } from "./types";
import { getSession } from "../session-store";

// ---------------------------------------------------------------------------
// Module-level app instance
// ---------------------------------------------------------------------------

let slackApp: App | undefined;

/**
 * Get the initialized Slack App instance.
 * Returns `undefined` if `createSlackApp()` has not been called yet.
 */
export function getSlackApp(): App | undefined {
  return slackApp;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create and configure a Slack Bolt App in Socket Mode.
 *
 * Reads tokens from environment variables:
 * - `SLACK_BOT_TOKEN`   - Bot User OAuth Token (xoxb-...)
 * - `SLACK_SIGNING_SECRET` - Request signing secret
 * - `SLACK_APP_TOKEN`   - App-Level Token for Socket Mode (xapp-...)
 */
export function createSlackApp(): App {
  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN,
  });

  registerEventHandlers(app);
  slackApp = app;
  return app;
}

// ---------------------------------------------------------------------------
// Event & action handler registration
// ---------------------------------------------------------------------------

function registerEventHandlers(app: App): void {
  // ---- @mention handler ---------------------------------------------------
  app.event("app_mention", async ({ event, client, logger }) => {
    try {
      const rawText: string = event.text ?? "";
      // Strip the @mention (e.g. "<@U0123ABC> do something" -> "do something")
      const prompt = rawText.replace(/<@[A-Z0-9]+>/gi, "").trim();

      if (!prompt) {
        await client.chat.postMessage({
          channel: event.channel,
          thread_ts: event.ts,
          text: "Please include a task description when mentioning me.",
        });
        return;
      }

      const threadTs = event.thread_ts ?? event.ts;
      const channelId = event.channel;
      const slackUserId = event.user ?? "unknown";
      const teamId = event.team ?? "unknown";

      // If a session already exists for this thread, treat as follow-up context
      const existingSession = getSlackSession(threadTs, channelId);
      if (existingSession) {
        await client.reactions.add({
          channel: channelId,
          timestamp: event.ts,
          name: "eyes",
        });
        return;
      }

      // Create a new session linked to this thread
      await createSlackSession(
        threadTs,
        channelId,
        slackUserId,
        teamId,
        prompt,
      );

      // Post a simple text ack while we decompose
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: "Got it — I'm breaking this down into tasks...",
      });

      // Decompose the prompt into subtasks (does NOT spawn workers yet)
      const { descriptions } = await decomposeSlackSession(threadTs, channelId);

      // Look up the sessionId for the dashboard link
      const slackSess = getSlackSession(threadTs, channelId);
      const sessionId = slackSess?.sessionId;

      // Post the real confirmation as a new message (with dashboard link)
      const confirmBlocks = buildConfirmationMessage(
        prompt,
        descriptions,
        sessionId,
      );
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: prompt,
        blocks: confirmBlocks,
      });
    } catch (error) {
      logger.error("Error handling app_mention event", error);
      try {
        await client.chat.postMessage({
          channel: event.channel,
          thread_ts: event.thread_ts ?? event.ts,
          text: "Sorry, something went wrong while processing your request.",
        });
      } catch {
        // If even the error message fails, just log it
        logger.error("Failed to post error message to Slack");
      }
    }
  });

  // ---- Confirm action (user approved task plan) ---------------------------
  app.action("opticon_confirm", async ({ ack, body, client, logger }) => {
    await ack();
    try {
      if (body.type !== "block_actions" || !body.message) return;

      const channelId = body.channel?.id;
      const messageTs = body.message.ts;
      const threadTs: string | undefined =
        body.message.thread_ts ?? body.message.ts;
      if (!channelId || !messageTs || !threadTs) return;

      // Actually spawn workers now that the user confirmed
      await executeSlackSession(threadTs, channelId);

      // Only update the message after confirming execution proceeded
      const blocks = body.message.blocks as KnownBlock[];
      const updatedBlocks = blocks.filter(
        (b) => b.type !== "actions",
      );
      updatedBlocks.push({
        type: "section",
        text: { type: "mrkdwn", text: "*Starting...*" },
      });

      await client.chat.update({
        channel: channelId,
        ts: messageTs,
        text: "Starting...",
        blocks: updatedBlocks,
      });
    } catch (error) {
      logger.error("Error handling opticon_confirm action", error);
      try {
        const channelId = body.channel?.id;
        const threadTs = (body as Record<string, any>).message?.thread_ts ?? (body as Record<string, any>).message?.ts;
        if (channelId && threadTs) {
          await client.chat.postMessage({
            channel: channelId,
            thread_ts: threadTs,
            text: "Sorry, something went wrong while starting your tasks. Please try again.",
          });
        }
      } catch {
        logger.error("Failed to post error message to Slack after confirm failure");
      }
    }
  });

  // ---- Cancel action (user cancelled task plan) ---------------------------
  app.action("opticon_cancel", async ({ ack, body, client, logger }) => {
    await ack();
    try {
      if (body.type !== "block_actions" || !body.message) return;

      const channelId = body.channel?.id;
      const threadTs: string =
        body.message.thread_ts ?? body.message.ts;
      const messageTs = body.message.ts;
      if (!channelId || !threadTs || !messageTs) return;

      await stopSlackSession(threadTs, channelId);

      await client.chat.update({
        channel: channelId,
        ts: messageTs,
        text: "Task cancelled.",
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: "*Task cancelled.*" },
          },
        ],
      });
    } catch (error) {
      logger.error("Error handling opticon_cancel action", error);
    }
  });

  // ---- Proceed (user confirmed destructive action) -----------------------
  app.action("opticon_proceed", async ({ ack, body, client, logger }) => {
    await ack();
    try {
      if (body.type !== "block_actions" || !body.message) return;

      const channelId = body.channel?.id;
      const messageTs = body.message.ts;
      if (!channelId || !messageTs) return;

      await client.chat.update({
        channel: channelId,
        ts: messageTs,
        text: "Proceeding...",
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: "*Proceeding...*" },
          },
        ],
      });
    } catch (error) {
      logger.error("Error handling opticon_proceed action", error);
    }
  });

  // ---- Deny (user denied destructive action) -----------------------------
  app.action("opticon_deny", async ({ ack, body, client, logger }) => {
    await ack();
    try {
      if (body.type !== "block_actions" || !body.message) return;

      const channelId = body.channel?.id;
      const messageTs = body.message.ts;
      if (!channelId || !messageTs) return;

      await client.chat.update({
        channel: channelId,
        ts: messageTs,
        text: "Action cancelled.",
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: "*Action cancelled.*" },
          },
        ],
      });
    } catch (error) {
      logger.error("Error handling opticon_deny action", error);
    }
  });

  // ---- Error recovery: Retry ----------------------------------------------
  app.action("opticon_retry", async ({ ack, logger }) => {
    await ack();
    logger.info("User chose to retry the failed action");
  });

  // ---- Error recovery: Skip -----------------------------------------------
  app.action("opticon_skip", async ({ ack, logger }) => {
    await ack();
    logger.info("User chose to skip the failed action");
  });

  // ---- Error recovery: Abort ----------------------------------------------
  app.action("opticon_abort", async ({ ack, body, client, logger }) => {
    await ack();
    try {
      if (body.type !== "block_actions" || !body.message) return;

      const channelId = body.channel?.id;
      const threadTs: string =
        body.message.thread_ts ?? body.message.ts;
      const messageTs = body.message.ts;
      if (!channelId || !threadTs || !messageTs) return;

      await stopSlackSession(threadTs, channelId);

      await client.chat.update({
        channel: channelId,
        ts: messageTs,
        text: "Session aborted.",
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: "*Session aborted.*" },
          },
        ],
      });
    } catch (error) {
      logger.error("Error handling opticon_abort action", error);
    }
  });

  // ---- Checkpoint: Continue -------------------------------------------------
  app.action("opticon_checkpoint_continue", async ({ ack, body, client, logger }) => {
    await ack();
    try {
      if (body.type !== "block_actions" || !body.message) return;

      const channelId = body.channel?.id;
      const messageTs = body.message.ts;
      const threadTs: string | undefined =
        body.message.thread_ts ?? body.message.ts;
      if (!channelId || !messageTs || !threadTs) return;

      const session = getSlackSession(threadTs, channelId);
      if (!session?.sessionId) return;

      // Tell the worker to resume
      const io = getIO();
      io.to(`session:${session.sessionId}`).emit("session:checkpoint_resume", {
        sessionId: session.sessionId,
      });

      // Update message: remove buttons, show "Continuing..."
      const blocks = (body.message.blocks as KnownBlock[]).filter(
        (b) => b.type !== "actions",
      );
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: "*Continuing...*" },
      });

      await client.chat.update({
        channel: channelId,
        ts: messageTs,
        text: "Continuing...",
        blocks,
      });
    } catch (error) {
      logger.error("Error handling opticon_checkpoint_continue action", error);
    }
  });

  // ---- Checkpoint: Stop ----------------------------------------------------
  app.action("opticon_checkpoint_stop", async ({ ack, body, client, logger }) => {
    await ack();
    try {
      if (body.type !== "block_actions" || !body.message) return;

      const channelId = body.channel?.id;
      const messageTs = body.message.ts;
      const threadTs: string | undefined =
        body.message.thread_ts ?? body.message.ts;
      if (!channelId || !messageTs || !threadTs) return;

      await stopSlackSession(threadTs, channelId);

      await client.chat.update({
        channel: channelId,
        ts: messageTs,
        text: "Session stopped at checkpoint.",
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: "*Session stopped at checkpoint.*" },
          },
        ],
      });
    } catch (error) {
      logger.error("Error handling opticon_checkpoint_stop action", error);
    }
  });

  // ---- Catch-all for future clarification/edit/modify/start actions -------
  app.action(/^opticon_clarify_/, async ({ ack, logger }) => {
    await ack();
    logger.info("Clarification response received (not yet implemented)");
  });

  app.action("opticon_edit", async ({ ack, logger }) => {
    await ack();
    logger.info("Edit action received (not yet implemented)");
  });

  app.action("opticon_modify", async ({ ack, logger }) => {
    await ack();
    logger.info("Modify action received (not yet implemented)");
  });

  app.action("opticon_start", async ({ ack, logger }) => {
    await ack();
    logger.info("Start action received (not yet implemented)");
  });
}

// ---------------------------------------------------------------------------
// Helper functions for posting updates to Slack threads
// ---------------------------------------------------------------------------

/**
 * Post a milestone update to the Slack thread associated with a session.
 * Called by the server when an agent emits a reasoning/thinking event.
 */
export async function postMilestoneToSlack(
  sessionId: string,
  agentName: string,
  milestone: string,
): Promise<void> {
  try {
    const app = getSlackApp();
    if (!app) return;

    const session = getSlackSessionBySessionId(sessionId);
    if (!session) return;

    const blocks = buildMilestoneMessage(agentName, milestone);
    await app.client.chat.postMessage({
      channel: session.channelId,
      thread_ts: session.threadTs,
      text: `${agentName}: ${milestone}`,
      blocks,
    });
  } catch (error) {
    console.error(
      `[slack] Failed to post milestone for session ${sessionId}:`,
      error,
    );
  }
}

/**
 * Post a completion message and optionally upload output files (GIF, etc.)
 * to the Slack thread.
 */
export async function postCompletionToSlack(
  result: SlackTaskResult,
): Promise<void> {
  try {
    const app = getSlackApp();
    if (!app) return;

    const session = getSlackSessionBySessionId(result.sessionId);
    if (!session) return;

    // Calculate duration
    const durationMs = Date.now() - session.createdAt;
    const durationSec = Math.round(durationMs / 1000);
    const minutes = Math.floor(durationSec / 60);
    const seconds = durationSec % 60;
    const duration =
      minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    // Build per-task results from the session store
    const panopticonSession = getSession(result.sessionId);
    const taskResults: TaskResultLine[] = (panopticonSession?.todos ?? []).map(
      (todo) => ({
        description: todo.description,
        status: todo.status === "completed" ? ("completed" as const) : ("failed" as const),
        summary: todo.result?.slice(0, 80),
      }),
    );

    // Post the completion message
    const blocks = buildCompletionMessage(
      result.summary,
      taskResults,
      panopticonSession?.agents.length ?? 1,
      duration,
      result.sessionId,
    );
    await app.client.chat.postMessage({
      channel: session.channelId,
      thread_ts: session.threadTs,
      text: result.summary,
      blocks,
    });

    // Upload GIF if available
    if (result.gifPath && fs.existsSync(result.gifPath)) {
      const fileContent = fs.readFileSync(result.gifPath);
      await app.client.files.uploadV2({
        channel_id: session.channelId,
        thread_ts: session.threadTs,
        file: fileContent,
        filename: path.basename(result.gifPath),
        title: "Session Timelapse",
      });
    }

    // Upload any additional output files
    if (result.outputFiles) {
      for (const filePath of result.outputFiles) {
        if (!fs.existsSync(filePath)) continue;
        const fileContent = fs.readFileSync(filePath);
        await app.client.files.uploadV2({
          channel_id: session.channelId,
          thread_ts: session.threadTs,
          file: fileContent,
          filename: path.basename(filePath),
          title: path.basename(filePath),
        });
      }
    }
  } catch (error) {
    console.error(
      `[slack] Failed to post completion for session ${result.sessionId}:`,
      error,
    );
  }
}

/**
 * Post an error message to the Slack thread, optionally including a
 * screenshot of the current sandbox state.
 */
export async function postErrorToSlack(
  sessionId: string,
  error: string,
  screenshot?: string,
): Promise<void> {
  try {
    const app = getSlackApp();
    if (!app) return;

    const session = getSlackSessionBySessionId(sessionId);
    if (!session) return;

    const blocks = buildErrorMessage(error, screenshot);
    await app.client.chat.postMessage({
      channel: session.channelId,
      thread_ts: session.threadTs,
      text: `Error: ${error}`,
      blocks,
    });
  } catch (err) {
    console.error(
      `[slack] Failed to post error for session ${sessionId}:`,
      err,
    );
  }
}

/**
 * Post a destructive action confirmation request to the Slack thread.
 * The user can approve or deny via the attached buttons.
 */
export async function postDestructiveConfirmToSlack(
  sessionId: string,
  actionDescription: string,
  screenshotUrl?: string,
): Promise<void> {
  try {
    const app = getSlackApp();
    if (!app) return;

    const session = getSlackSessionBySessionId(sessionId);
    if (!session) return;

    const blocks = buildDestructiveConfirmMessage(
      actionDescription,
      screenshotUrl,
    );
    await app.client.chat.postMessage({
      channel: session.channelId,
      thread_ts: session.threadTs,
      text: `Confirmation required: ${actionDescription}`,
      blocks,
    });
  } catch (error) {
    console.error(
      `[slack] Failed to post destructive confirm for session ${sessionId}:`,
      error,
    );
  }
}

/**
 * Post a checkpoint message to the Slack thread when an agent reaches a
 * step interval. Optionally uploads a thumbnail screenshot.
 */
export async function postCheckpointToSlack(
  sessionId: string,
  agentName: string,
  step: number,
  totalSteps: number,
  thumbnailBase64?: string,
  accomplishment?: string,
): Promise<void> {
  const app = getSlackApp();
  if (!app) return;
  const session = getSlackSessionBySessionId(sessionId);
  if (!session) return;

  let screenshotUrl: string | undefined;
  if (thumbnailBase64) {
    try {
      const buf = Buffer.from(thumbnailBase64, "base64");
      const upload = await app.client.files.uploadV2({
        channel_id: session.channelId,
        thread_ts: session.threadTs,
        file: buf,
        filename: `checkpoint-step-${step}.jpg`,
        title: `Step ${step} screenshot`,
      });
      // files.uploadV2 returns the file info — extract permalink
      const file = (upload as any).file ?? (upload as any).files?.[0];
      screenshotUrl = file?.permalink_public ?? file?.permalink;
    } catch {
      // If upload fails, post without screenshot
    }
  }

  const blocks = buildCheckpointMessage(
    agentName,
    step,
    totalSteps,
    screenshotUrl,
    accomplishment,
    sessionId,
  );
  await app.client.chat.postMessage({
    channel: session.channelId,
    thread_ts: session.threadTs,
    text: `Checkpoint: ${agentName} at step ${step}/${totalSteps}`,
    blocks,
  });
}
