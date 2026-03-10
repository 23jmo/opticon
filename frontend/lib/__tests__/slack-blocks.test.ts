import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { KnownBlock } from "@slack/types";

import {
  buildClarificationMessage,
  buildConfirmationMessage,
  buildMilestoneMessage,
  buildCompletionMessage,
  buildErrorMessage,
  buildDestructiveConfirmMessage,
  buildCheckpointMessage,
} from "../slack/blocks";

import type { TaskResultLine } from "../slack/types";

// Helper to find blocks by type
function blocksOfType<T extends KnownBlock["type"]>(
  blocks: KnownBlock[],
  type: T,
) {
  return blocks.filter((b) => b.type === type);
}

describe("buildClarificationMessage", () => {
  it("contains a header, questions, and a start/cancel footer", () => {
    const blocks = buildClarificationMessage("Do the thing", [
      { id: "q1", text: "Which environment?" },
    ]);

    // Header
    const headers = blocksOfType(blocks, "header");
    expect(headers).toHaveLength(1);
    expect((headers[0] as any).text.text).toBe("New Task Request");

    // Task description section
    const sections = blocksOfType(blocks, "section");
    expect(sections.some((s: any) => s.text.text.includes("Do the thing"))).toBe(true);

    // Question text
    expect(sections.some((s: any) => s.text.text.includes("Which environment?"))).toBe(true);

    // Footer actions (Start + Cancel)
    const actions = blocksOfType(blocks, "actions");
    const footerActions = actions[actions.length - 1] as any;
    const actionIds = footerActions.elements.map((e: any) => e.action_id);
    expect(actionIds).toContain("opticon_start");
    expect(actionIds).toContain("opticon_cancel");
  });

  it("renders option buttons when question has options", () => {
    const blocks = buildClarificationMessage("Task", [
      { id: "q1", text: "Pick one", options: ["A", "B", "C"] },
    ]);

    const actions = blocksOfType(blocks, "actions");
    // First actions block = option buttons, second = footer
    expect(actions.length).toBeGreaterThanOrEqual(2);
    const optionButtons = (actions[0] as any).elements;
    expect(optionButtons).toHaveLength(3);
    expect(optionButtons[0].action_id).toBe("opticon_clarify_q1_0");
    expect(optionButtons[1].value).toBe("B");
  });

  it("omits option buttons when question has no options", () => {
    const blocks = buildClarificationMessage("Task", [
      { id: "q1", text: "Describe your goal" },
    ]);

    // Only the footer actions block
    const actions = blocksOfType(blocks, "actions");
    expect(actions).toHaveLength(1);
  });
});

describe("buildConfirmationMessage", () => {
  it("contains a header, numbered list of subtasks, and Go/Edit buttons", () => {
    const blocks = buildConfirmationMessage("Build app", [
      "Set up project",
      "Write tests",
      "Deploy",
    ]);

    // Header
    const headers = blocksOfType(blocks, "header");
    expect(headers).toHaveLength(1);

    // Numbered list
    const sections = blocksOfType(blocks, "section");
    const body = (sections[0] as any).text.text;
    expect(body).toContain("1. Set up project");
    expect(body).toContain("2. Write tests");
    expect(body).toContain("3. Deploy");
    expect(body).toContain("*Build app*");

    // Go + Edit buttons
    const actions = blocksOfType(blocks, "actions");
    expect(actions).toHaveLength(1);
    const actionIds = (actions[0] as any).elements.map(
      (e: any) => e.action_id,
    );
    expect(actionIds).toContain("opticon_confirm");
    expect(actionIds).toContain("opticon_edit");
  });

  it("includes dashboard link when sessionId and APP_URL are set", () => {
    const original = process.env.APP_URL;
    process.env.APP_URL = "https://app.example.com";
    try {
      const blocks = buildConfirmationMessage(
        "Build app",
        ["Task 1"],
        "session-abc",
      );
      const ctx = blocksOfType(blocks, "context");
      expect(ctx).toHaveLength(1);
      expect((ctx[0] as any).elements[0].text).toContain(
        "https://app.example.com/session/session-abc",
      );
    } finally {
      if (original === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = original;
    }
  });

  it("omits dashboard link when APP_URL is not set", () => {
    const original = process.env.APP_URL;
    delete process.env.APP_URL;
    try {
      const blocks = buildConfirmationMessage("Build app", ["Task 1"], "session-abc");
      const ctx = blocksOfType(blocks, "context");
      expect(ctx).toHaveLength(0);
    } finally {
      if (original !== undefined) process.env.APP_URL = original;
    }
  });
});

describe("buildMilestoneMessage", () => {
  it("returns a context block with agent name, milestone, and timestamp", () => {
    const blocks = buildMilestoneMessage("Agent-1", "Installing dependencies");

    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("context");
    const elements = (blocks[0] as any).elements;
    expect(elements).toHaveLength(3);
    expect(elements[0].text).toContain("Agent-1");
    expect(elements[1].text).toContain("Installing dependencies");
    // Timestamp element should be italic markdown
    expect(elements[2].text).toMatch(/^_.*_$/);
  });
});

describe("buildCompletionMessage", () => {
  const taskResults: TaskResultLine[] = [
    { description: "Set up the database", status: "completed", summary: "Created users and posts tables" },
    { description: "Deploy to production", status: "completed", summary: "Deployed v2.1.0 to fly.io" },
    { description: "Run integration tests", status: "failed", summary: "Connection refused on port 5432" },
  ];

  it("uses 'All done' header", () => {
    const blocks = buildCompletionMessage("Everything done", taskResults, 2, "3m 12s");
    const headers = blocksOfType(blocks, "header");
    expect(headers).toHaveLength(1);
    expect((headers[0] as any).text.text).toBe("All done");
  });

  it("renders per-task results with status markers", () => {
    const blocks = buildCompletionMessage("Everything done", taskResults, 2, "3m 12s");
    const sections = blocksOfType(blocks, "section");
    const body = (sections[0] as any).text.text;

    expect(body).toContain("*Done* — Set up the database");
    expect(body).toContain("Created users and posts tables");
    expect(body).toContain("*Done* — Deploy to production");
    expect(body).toContain("*Failed* — Run integration tests");
    expect(body).toContain("Connection refused on port 5432");
  });

  it("shows stats footer with agent count, task count, and duration", () => {
    const blocks = buildCompletionMessage("Everything done", taskResults, 2, "3m 12s");
    const ctx = blocksOfType(blocks, "context");
    expect(ctx).toHaveLength(1);
    const statsText = (ctx[0] as any).elements[0].text;
    expect(statsText).toContain("Agents:* 2");
    expect(statsText).toContain("Tasks:* 3");
    expect(statsText).toContain("Duration:* 3m 12s");
  });

  it("includes dashboard link when sessionId and APP_URL are set", () => {
    const original = process.env.APP_URL;
    process.env.APP_URL = "https://app.example.com";
    try {
      const blocks = buildCompletionMessage("Done", taskResults, 2, "1m 5s", "sess-123");
      const ctx = blocksOfType(blocks, "context");
      const statsText = (ctx[0] as any).elements[0].text;
      expect(statsText).toContain("https://app.example.com/session/sess-123");
    } finally {
      if (original === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = original;
    }
  });

  it("falls back to overall summary when no task results", () => {
    const blocks = buildCompletionMessage("All tasks completed successfully", [], 1, "30s");
    const sections = blocksOfType(blocks, "section");
    expect((sections[0] as any).text.text).toBe("All tasks completed successfully");
  });

  it("has a divider before the stats footer", () => {
    const blocks = buildCompletionMessage("Done", taskResults, 2, "1m");
    expect(blocksOfType(blocks, "divider")).toHaveLength(1);
  });
});

describe("buildErrorMessage", () => {
  it("includes header, error text, and retry/skip/abort buttons", () => {
    const blocks = buildErrorMessage("Something broke");

    const headers = blocksOfType(blocks, "header");
    expect(headers).toHaveLength(1);
    expect((headers[0] as any).text.text).toBe("I need your help");

    const sections = blocksOfType(blocks, "section");
    expect((sections[0] as any).text.text).toBe("Something broke");

    // No image when no screenshot
    expect(blocksOfType(blocks, "image")).toHaveLength(0);

    const actions = blocksOfType(blocks, "actions");
    const actionIds = (actions[0] as any).elements.map(
      (e: any) => e.action_id,
    );
    expect(actionIds).toEqual([
      "opticon_retry",
      "opticon_skip",
      "opticon_abort",
    ]);
  });

  it("includes screenshot image when provided", () => {
    const blocks = buildErrorMessage("Oops", "https://example.com/img.png");

    const images = blocksOfType(blocks, "image");
    expect(images).toHaveLength(1);
    expect((images[0] as any).image_url).toBe("https://example.com/img.png");
  });
});

describe("buildDestructiveConfirmMessage", () => {
  it("includes header, description, and proceed/cancel/modify buttons", () => {
    const blocks = buildDestructiveConfirmMessage("Delete everything");

    const headers = blocksOfType(blocks, "header");
    expect((headers[0] as any).text.text).toBe("Confirmation Required");

    const sections = blocksOfType(blocks, "section");
    expect((sections[0] as any).text.text).toBe("Delete everything");

    expect(blocksOfType(blocks, "image")).toHaveLength(0);

    const actions = blocksOfType(blocks, "actions");
    const actionIds = (actions[0] as any).elements.map(
      (e: any) => e.action_id,
    );
    expect(actionIds).toEqual([
      "opticon_proceed",
      "opticon_deny",
      "opticon_modify",
    ]);
  });

  it("includes screenshot image when provided", () => {
    const blocks = buildDestructiveConfirmMessage(
      "Drop table",
      "https://example.com/preview.png",
    );

    const images = blocksOfType(blocks, "image");
    expect(images).toHaveLength(1);
    expect((images[0] as any).image_url).toBe(
      "https://example.com/preview.png",
    );
  });
});

describe("buildCheckpointMessage", () => {
  it("includes header, step count, and continue/stop buttons", () => {
    const blocks = buildCheckpointMessage("Agent 1", 100, 500);

    const headers = blocksOfType(blocks, "header");
    expect(headers).toHaveLength(1);
    expect((headers[0] as any).text.text).toBe("Checkpoint");

    const sections = blocksOfType(blocks, "section");
    expect(sections).toHaveLength(1);
    expect((sections[0] as any).text.text).toContain("100");
    expect((sections[0] as any).text.text).toContain("500");
    expect((sections[0] as any).text.text).toContain("Agent 1");

    // No image when no screenshot
    expect(blocksOfType(blocks, "image")).toHaveLength(0);

    const actions = blocksOfType(blocks, "actions");
    expect(actions).toHaveLength(1);
    const actionIds = (actions[0] as any).elements.map(
      (e: any) => e.action_id,
    );
    expect(actionIds).toEqual([
      "opticon_checkpoint_continue",
      "opticon_checkpoint_stop",
    ]);
  });

  it("uses first-person copy: 'Should I keep going?'", () => {
    const blocks = buildCheckpointMessage("Agent 1", 100, 500);
    const sections = blocksOfType(blocks, "section");
    expect((sections[0] as any).text.text).toContain("Should I keep going?");
  });

  it("includes accomplishment summary when provided", () => {
    const blocks = buildCheckpointMessage(
      "Agent 1",
      100,
      500,
      undefined,
      "Navigated to settings, updated email config",
    );
    const sections = blocksOfType(blocks, "section");
    const body = (sections[0] as any).text.text;
    expect(body).toContain("Recently:");
    expect(body).toContain("Navigated to settings, updated email config");
  });

  it("includes dashboard link when sessionId and APP_URL are set", () => {
    const original = process.env.APP_URL;
    process.env.APP_URL = "https://app.example.com";
    try {
      const blocks = buildCheckpointMessage(
        "Agent 1",
        100,
        500,
        undefined,
        undefined,
        "sess-456",
      );
      const ctx = blocksOfType(blocks, "context");
      expect(ctx.length).toBeGreaterThanOrEqual(1);
      const linkCtx = ctx.find((c: any) =>
        c.elements.some((e: any) => e.text?.includes("dashboard")),
      );
      expect(linkCtx).toBeDefined();
      expect((linkCtx as any).elements[0].text).toContain(
        "https://app.example.com/session/sess-456",
      );
    } finally {
      if (original === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = original;
    }
  });

  it("includes screenshot image when provided", () => {
    const blocks = buildCheckpointMessage(
      "Agent 2",
      200,
      500,
      "https://example.com/checkpoint.jpg",
    );

    const images = blocksOfType(blocks, "image");
    expect(images).toHaveLength(1);
    expect((images[0] as any).image_url).toBe(
      "https://example.com/checkpoint.jpg",
    );
  });

  it("buttons have correct styles", () => {
    const blocks = buildCheckpointMessage("Agent 1", 100, 500);

    const actions = blocksOfType(blocks, "actions");
    const elements = (actions[0] as any).elements;
    expect(elements[0].style).toBe("primary");
    expect(elements[1].style).toBe("danger");
  });
});
