import { describe, it, expect } from "vitest";
import type { KnownBlock } from "@slack/types";

import {
  buildClarificationMessage,
  buildConfirmationMessage,
  buildMilestoneMessage,
  buildCompletionMessage,
  buildErrorMessage,
  buildDestructiveConfirmMessage,
} from "../slack/blocks";

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
  it("contains header, summary, divider, and stats footer", () => {
    const blocks = buildCompletionMessage(
      "Everything is done",
      2,
      5,
      "3m 12s",
    );

    const headers = blocksOfType(blocks, "header");
    expect(headers).toHaveLength(1);
    expect((headers[0] as any).text.text).toBe("Task Complete");

    const sections = blocksOfType(blocks, "section");
    expect((sections[0] as any).text.text).toBe("Everything is done");

    expect(blocksOfType(blocks, "divider")).toHaveLength(1);

    const ctx = blocksOfType(blocks, "context");
    expect(ctx).toHaveLength(1);
    const statsText = (ctx[0] as any).elements[0].text;
    expect(statsText).toContain("Agents:* 2");
    expect(statsText).toContain("Tasks:* 5");
    expect(statsText).toContain("Duration:* 3m 12s");
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
