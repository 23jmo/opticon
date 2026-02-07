"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Session } from "@/lib/types";
import { SessionSummary } from "@/components/session-summary";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SummaryPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSession() {
      try {
        const response = await fetch(`/api/sessions/${sessionId}`);
        if (!response.ok) {
          throw new Error("Session not found");
        }
        const data = await response.json();
        setSession(data);
        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load session");
        setIsLoading(false);
      }
    }

    fetchSession();
  }, [sessionId]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="mx-auto size-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading summary...</p>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-sm text-destructive">{error || "Session not found"}</p>
          <Button variant="outline" onClick={() => router.push("/")}>
            Return home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SessionSummary
      sessionId={sessionId}
      tasks={session.todos}
      agents={session.agents}
      whiteboard={session.whiteboard}
    />
  );
}
