import { NextResponse } from "next/server";
import { generateUploadUrls } from "@/lib/r2";

export async function POST(request: Request) {
  try {
    const { sessionId, agentId, frameCount } = await request.json();

    if (!sessionId || !agentId || !frameCount) {
      return NextResponse.json(
        { error: "Missing required fields: sessionId, agentId, frameCount" },
        { status: 400 }
      );
    }

    const { frameUrls, manifestUrl } = await generateUploadUrls(
      sessionId,
      agentId,
      frameCount
    );

    return NextResponse.json({ frameUrls, manifestUrl });
  } catch (error) {
    console.error("[api/replay/upload-urls] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate upload URLs" },
      { status: 500 }
    );
  }
}
