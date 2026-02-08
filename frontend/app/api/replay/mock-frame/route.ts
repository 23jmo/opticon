import { NextResponse } from "next/server";

/**
 * Generates a colored JPEG-like frame on the fly for testing the replay scrubber.
 * Usage: /api/replay/mock-frame?index=3&total=20&agent=agent-001
 *
 * Returns an SVG rendered as an image (browsers render it in <img> tags just fine).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const index = parseInt(searchParams.get("index") || "0", 10);
  const total = parseInt(searchParams.get("total") || "20", 10);
  const agent = searchParams.get("agent") || "agent-001";

  // Cycle through colors based on index
  const colors = [
    "#1e293b", "#1e3a5f", "#1a3c34", "#3b1e4a", "#4a2e1e",
    "#1e293b", "#2d1e4a", "#1e3a3a", "#3a2e1e", "#1e2e3a",
  ];
  const bg = colors[index % colors.length];

  // Progress bar width
  const progress = total > 1 ? (index / (total - 1)) * 100 : 100;

  const actions = [
    "Opening Chrome", "Navigating to Google", "Typing search query",
    "Reading results", "Clicking first link", "Scrolling page",
    "Copying text", "Switching to Docs", "Pasting content",
    "Formatting text", "Adding heading", "Inserting image",
    "Adjusting layout", "Saving document", "Reviewing work",
    "Making corrections", "Final review", "Submitting",
    "Verifying output", "Task complete",
  ];
  const action = actions[index % actions.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
    <rect width="320" height="180" fill="${bg}"/>

    <!-- Simulated desktop elements -->
    <rect x="0" y="0" width="320" height="20" fill="#0f172a" opacity="0.8"/>
    <circle cx="12" cy="10" r="4" fill="#ef4444" opacity="0.7"/>
    <circle cx="24" cy="10" r="4" fill="#eab308" opacity="0.7"/>
    <circle cx="36" cy="10" r="4" fill="#22c55e" opacity="0.7"/>
    <text x="160" y="14" text-anchor="middle" fill="#94a3b8" font-size="9" font-family="monospace">${agent.slice(0, 9)} — Desktop</text>

    <!-- Main content area -->
    <rect x="10" y="30" width="300" height="110" rx="4" fill="#0f172a" opacity="0.5"/>

    <!-- Step indicator -->
    <text x="160" y="70" text-anchor="middle" fill="#e2e8f0" font-size="24" font-family="sans-serif" font-weight="bold">Step ${index + 1}</text>
    <text x="160" y="90" text-anchor="middle" fill="#64748b" font-size="11" font-family="sans-serif">of ${total}</text>

    <!-- Action label -->
    <text x="160" y="120" text-anchor="middle" fill="#38bdf8" font-size="11" font-family="monospace">${action}</text>

    <!-- Progress bar background -->
    <rect x="10" y="155" width="300" height="6" rx="3" fill="#1e293b"/>
    <!-- Progress bar fill -->
    <rect x="10" y="155" width="${progress * 3}" height="6" rx="3" fill="#06b6d4"/>

    <!-- Timestamp -->
    <text x="10" y="175" fill="#475569" font-size="8" font-family="monospace">frame ${String(index).padStart(4, "0")}</text>
    <text x="310" y="175" text-anchor="end" fill="#475569" font-size="8" font-family="monospace">${Math.round(progress)}%</text>
  </svg>`;

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
