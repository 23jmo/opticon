import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  // This will be implemented by the backend
  // For now, return a placeholder response
  // The backend should return session status, agents, tasks, and current state
  
  try {
    // Forward request to backend or return from in-memory store
    // This is a placeholder - actual implementation depends on backend setup
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/api/sessions/${id}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    // If backend is not available, return a basic structure
    // This allows the frontend to handle the case gracefully
    return NextResponse.json(
      { error: "Backend not available" },
      { status: 503 }
    );
  }
}
