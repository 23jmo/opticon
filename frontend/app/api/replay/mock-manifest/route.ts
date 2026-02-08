import { NextResponse } from "next/server";

/**
 * Generates a mock replay manifest for testing.
 * Usage: /api/replay/mock-manifest?agent=agent-001&frames=20
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agent = searchParams.get("agent") || "agent-001";
  const frameCount = parseInt(searchParams.get("frames") || "20", 10);

  const actions = [
    "Opening Chrome", "Navigating to Google", "Typing search query",
    "Reading results", "Clicking first link", "Scrolling page",
    "Copying text", "Switching to Docs", "Pasting content",
    "Formatting text", "Adding heading", "Inserting image",
    "Adjusting layout", "Saving document", "Reviewing work",
    "Making corrections", "Final review", "Submitting",
    "Verifying output", "Task complete",
  ];

  const baseTime = Date.now() - frameCount * 4000;

  const frames = Array.from({ length: frameCount }, (_, i) => ({
    index: i,
    timestamp: new Date(baseTime + i * 4000).toISOString(),
    url: `/api/replay/mock-frame?index=${i}&total=${frameCount}&agent=${agent}`,
    action: actions[i % actions.length],
  }));

  return NextResponse.json({
    sessionId: "demo",
    agentId: agent,
    frameCount,
    frames,
  });
}
