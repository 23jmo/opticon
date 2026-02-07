"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface VMTabProps {
  agentId: string;
  sessionId: string;
  streamUrl?: string;
  isActive: boolean;
}

export function VMTab({
  agentId,
  sessionId,
  streamUrl,
  isActive,
}: VMTabProps) {
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (streamUrl) {
      setIsLoading(true);
      setStreamError(null);
    }
  }, [streamUrl]);

  const handleIframeLoad = () => {
    setIsLoading(false);
    setStreamError(null);
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setStreamError("Failed to load desktop stream");
  };

  if (!isActive) {
    return null;
  }

  return (
    <div className="relative flex h-full w-full flex-col bg-zinc-900">
      {!streamUrl ? (
        <div className="flex h-full items-center justify-center">
          <div className="text-center space-y-2">
            <Loader2 className="mx-auto size-8 animate-spin text-zinc-400" />
            <p className="text-sm text-zinc-400">
              Waiting for desktop stream...
            </p>
            <p className="text-xs text-zinc-500">
              Agent {agentId.slice(0, 8)} is initializing
            </p>
          </div>
        </div>
      ) : (
        <>
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-900">
              <div className="text-center space-y-2">
                <Loader2 className="mx-auto size-8 animate-spin text-zinc-400" />
                <p className="text-sm text-zinc-400">Loading stream...</p>
              </div>
            </div>
          )}

          {streamError ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center space-y-2">
                <p className="text-sm text-destructive">{streamError}</p>
                <p className="text-xs text-zinc-500">
                  Please check the connection and try again
                </p>
              </div>
            </div>
          ) : (
            <iframe
              src={streamUrl}
              className="h-full w-full border-0"
              allow="clipboard-read; clipboard-write"
              onLoad={handleIframeLoad}
              onError={handleIframeError}
              title={`Desktop stream for agent ${agentId}`}
            />
          )}
        </>
      )}
    </div>
  );
}
