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
import type { ClarificationQuestion } from "./types";

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
): KnownBlock[] {
  const numberedList = subtaskDescriptions
    .map((desc, i) => `${i + 1}. ${desc}`)
    .join("\n");

  return [
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
 */
export function buildCompletionMessage(
  summary: string,
  agentCount: number,
  taskCount: number,
  duration: string,
): KnownBlock[] {
  return [
    header("Task Complete"),
    {
      type: "section",
      text: mrkdwn(summary),
    } satisfies SectionBlock,
    divider(),
    {
      type: "context",
      elements: [
        mrkdwn(
          `*Agents:* ${agentCount}  |  *Tasks:* ${taskCount}  |  *Duration:* ${duration}`,
        ),
      ],
    } satisfies ContextBlock,
  ];
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
