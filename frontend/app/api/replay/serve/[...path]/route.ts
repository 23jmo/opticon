import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const REPLAY_DIR =
  process.env.REPLAY_DIR || join(process.cwd(), ".replays");

/**
 * Serves locally-stored replay frames and manifests.
 * URL pattern: /api/replay/serve/{sessionId}/{agentId}/frame-0000.jpg
 *              /api/replay/serve/{sessionId}/{agentId}/manifest.json
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const filePath = join(REPLAY_DIR, ...path);

  // Prevent directory traversal
  if (!filePath.startsWith(REPLAY_DIR)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const data = await readFile(filePath);
    const filename = path[path.length - 1];

    let contentType = "application/octet-stream";
    if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) {
      contentType = "image/jpeg";
    } else if (filename.endsWith(".json")) {
      contentType = "application/json";
    }

    return new NextResponse(data, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
