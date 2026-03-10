/**
 * Block Kit message builder utilities for the Opticon Slack bot.
 *
 * Each function returns a `KnownBlock[]` array suitable for use in
 * `chat.postMessage` or `chat.update` calls via `@slack/bolt`.
 */

import type {
  ActionsBlock,
  ContextBlock,
  HeaderBlock,
  ImageBlock,
  KnownBlock,
  SectionBlock,
  DividerBlock,
} from "@slack/types";
import type { Button } from "@slack/types";
import type { ClarificationQuestion, TaskResultLine } from "./types";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function plainText(text: string) {
  return { type: "plain_text" as const, text, emoji: true };
}

function mrkdwn(text: string) {
  return { type: "mrkdwn" as const, text };
}

function header(text: string): HeaderBlock {
  return { type: "header", text: plainText(text) };
}

function divider(): DividerBlock {
  return { type: "divider" };
}

function button(
  text: string,
  actionId: string,
  style?: "primary" | "danger",
  value?: string,
): Button {
  const btn: Button = {
    type: "button",
    text: plainText(text),
    action_id: actionId,
  };
  if (style) btn.style = style;
  if (value) btn.value = value;
  return btn;
}

function dashboardUrl(sessionId: string): string | undefined {
  const base = process.env.APP_URL;
  if (!base) return undefined;
  return `${base}/session/${sessionId}`;
}

// ---------------------------------------------------------------------------
// Public builders
// ---------------------------------------------------------------------------

/**
 * Build a clarification message asking the user follow-up questions before
 * starting the task. Questions with `options` are rendered as button rows;
 * questions without options are displayed as text (the user replies in-thread).
 */
export function buildClarificationMessage(
  taskDescription: string,
  questions: ClarificationQuestion[],
): KnownBlock[] {
  const blocks: KnownBlock[] = [
    header("New Task Request"),
    {
      type: "section",
      text: mrkdwn(`*Task:* ${taskDescription}`),
    } satisfies SectionBlock,
    divider(),
  ];

  for (const question of questions) {
    // Always show the question text
    blocks.push({
      type: "section",
      text: mrkdwn(question.text),
    } satisfies SectionBlock);

    // If the question has predefined options, render them as buttons
    if (question.options && question.options.length > 0) {
      const optionButtons: Button[] = question.options.map((opt, idx) =>
        button(
          opt,
          `opticon_clarify_${question.id}_${idx}`,
          undefined,
          opt,
        ),
      );
      blocks.push({
        type: "actions",
        elements: optionButtons,
      } satisfies ActionsBlock);
    }
  }

  // Footer actions: Start or Cancel
  blocks.push(divider());
  blocks.push({
    type: "actions",
    elements: [
      button("Start Task", "opticon_start", "primary"),
      button("Cancel", "opticon_cancel"),
    ],
  } satisfies ActionsBlock);

  return blocks;
}

/**
 * Build a confirmation message showing the decomposed subtasks and asking the
 * user to approve or edit.
 */
export function buildConfirmationMessage(
  taskSummary: string,
  subtaskDescriptions: string[],
  sessionId?: string,
): KnownBlock[] {
  const numberedList = subtaskDescriptions
    .map((desc, i) => `${i + 1}. ${desc}`)
    .join("\n");

  const blocks: KnownBlock[] = [
    header("Here's what I'll do:"),
    {
      type: "section",
      text: mrkdwn(`*${taskSummary}*\n\n${numberedList}`),
    } satisfies SectionBlock,
    {
      type: "actions",
      elements: [
        button("Go", "opticon_confirm", "primary"),
        button("Edit", "opticon_edit"),
      ],
    } satisfies ActionsBlock,
  ];

  const link = sessionId ? dashboardUrl(sessionId) : undefined;
  if (link) {
    blocks.push({
      type: "context",
      elements: [mrkdwn(`<${link}|View in dashboard>`)],
    } satisfies ContextBlock);
  }

  return blocks;
}

/**
 * Build a lightweight milestone update shown in-thread while agents are
 * working.
 */
export function buildMilestoneMessage(
  agentName: string,
  milestone: string,
): KnownBlock[] {
  const now = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return [
    {
      type: "context",
      elements: [
        mrkdwn(`*${agentName}*`),
        mrkdwn(milestone),
        mrkdwn(`_${now}_`),
      ],
    } satisfies ContextBlock,
  ];
}

/**
 * Build a rich completion message posted when all tasks are done.
 * Shows per-task results with status markers and one-line summaries.
 */
export function buildCompletionMessage(
  overallSummary: string,
  taskResults: TaskResultLine[],
  agentCount: number,
  duration: string,
  sessionId?: string,
): KnownBlock[] {
  const statusLabel: Record<TaskResultLine["status"], string> = {
    completed: "*Done*",
    failed: "*Failed*",
    skipped: "*Skipped*",
  };

  const taskLines = taskResults
    .map((t) => {
      let line = `${statusLabel[t.status]} — ${t.description}`;
      if (t.summary) {
        line += `\n  _${t.summary}_`;
      }
      return line;
    })
    .join("\n\n");

  const blocks: KnownBlock[] = [
    header("All done"),
    {
      type: "section",
      text: mrkdwn(taskLines || overallSummary),
    } satisfies SectionBlock,
    divider(),
  ];

  let statsText = `*Agents:* ${agentCount}  |  *Tasks:* ${taskResults.length}  |  *Duration:* ${duration}`;
  const link = sessionId ? dashboardUrl(sessionId) : undefined;
  if (link) {
    statsText += `\n<${link}|View in dashboard>`;
  }

  blocks.push({
    type: "context",
    elements: [mrkdwn(statsText)],
  } satisfies ContextBlock);

  return blocks;
}

/**
 * Build an error message requesting user intervention. Optionally includes a
 * screenshot of the current sandbox state.
 */
export function buildErrorMessage(
  error: string,
  screenshot?: string,
): KnownBlock[] {
  const blocks: KnownBlock[] = [
    header("I need your help"),
    {
      type: "section",
      text: mrkdwn(error),
    } satisfies SectionBlock,
  ];

  if (screenshot) {
    blocks.push({
      type: "image",
      image_url: screenshot,
      alt_text: "Current sandbox state",
    } satisfies ImageBlock);
  }

  blocks.push({
    type: "actions",
    elements: [
      button("Retry", "opticon_retry", "primary"),
      button("Skip", "opticon_skip"),
      button("Abort", "opticon_abort", "danger"),
    ],
  } satisfies ActionsBlock);

  return blocks;
}

/**
 * Build a checkpoint message posted when an agent reaches a step interval
 * (e.g. every 100 steps) to ask the user whether to continue or stop.
 */
export function buildCheckpointMessage(
  agentName: string,
  step: number,
  totalSteps: number,
  screenshotUrl?: string,
  accomplishment?: string,
  sessionId?: string,
): KnownBlock[] {
  let bodyText = `*${agentName}* has completed *${step}* of ${totalSteps} max steps.`;
  if (accomplishment) {
    bodyText += `\n\n_Recently: ${accomplishment}_`;
  }
  bodyText += `\n\nShould I keep going?`;

  const blocks: KnownBlock[] = [
    header("Checkpoint"),
    {
      type: "section",
      text: mrkdwn(bodyText),
    } satisfies SectionBlock,
  ];

  if (screenshotUrl) {
    blocks.push({
      type: "image",
      image_url: screenshotUrl,
      alt_text: "Current sandbox state",
    } satisfies ImageBlock);
  }

  blocks.push({
    type: "actions",
    elements: [
      button("Continue", "opticon_checkpoint_continue", "primary"),
      button("Stop", "opticon_checkpoint_stop", "danger"),
    ],
  } satisfies ActionsBlock);

  const link = sessionId ? dashboardUrl(sessionId) : undefined;
  if (link) {
    blocks.push({
      type: "context",
      elements: [mrkdwn(`<${link}|View in dashboard>`)],
    } satisfies ContextBlock);
  }

  return blocks;
}

/**
 * Build a destructive-action confirmation message. Shown when an agent is
 * about to perform an irreversible operation and needs explicit approval.
 */
export function buildDestructiveConfirmMessage(
  actionDescription: string,
  screenshotUrl?: string,
): KnownBlock[] {
  const blocks: KnownBlock[] = [
    header("Confirmation Required"),
    {
      type: "section",
      text: mrkdwn(actionDescription),
    } satisfies SectionBlock,
  ];

  if (screenshotUrl) {
    blocks.push({
      type: "image",
      image_url: screenshotUrl,
      alt_text: "Action preview",
    } satisfies ImageBlock);
  }

  blocks.push({
    type: "actions",
    elements: [
      button("Proceed", "opticon_proceed", "primary"),
      button("Cancel", "opticon_deny", "danger"),
      button("Modify", "opticon_modify"),
    ],
  } satisfies ActionsBlock);

  return blocks;
}
