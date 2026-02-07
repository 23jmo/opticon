"use client";

import { useState } from "react";
import { Square, LayoutGrid, Layers, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface PromptBarProps {
  prompt: string;
  viewMode: "tabs" | "grid";
  onViewModeChange: (mode: "tabs" | "grid") => void;
  onStop: () => void;
  tasksComplete?: boolean;
  onFollowUp?: (prompt: string) => void;
}

export function PromptBar({
  prompt,
  viewMode,
  onViewModeChange,
  onStop,
  tasksComplete = false,
  onFollowUp,
}: PromptBarProps) {
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [followUpText, setFollowUpText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFollowUpSubmit = () => {
    if (!followUpText.trim() || !onFollowUp || isSubmitting) return;
    setIsSubmitting(true);
    onFollowUp(followUpText.trim());
    setFollowUpText("");
    setIsSubmitting(false);
  };

  return (
    <div className="shrink-0 border-b border-border bg-card/50 px-6 py-5">
      <div className="flex items-start justify-between gap-4">
        {tasksComplete ? (
          <div className="flex-1 min-w-0 flex gap-2">
            <Textarea
              value={followUpText}
              onChange={(e) => setFollowUpText(e.target.value)}
              placeholder="Give follow-up instructions..."
              className="min-h-[40px] max-h-[100px] resize-none text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleFollowUpSubmit();
                }
              }}
            />
            <Button
              size="icon"
              className="size-10 shrink-0"
              disabled={!followUpText.trim() || isSubmitting}
              onClick={handleFollowUpSubmit}
            >
              <Send className="size-4" />
            </Button>
          </div>
        ) : (
          <p className="text-lg font-medium text-foreground leading-snug min-w-0">
            {prompt}
          </p>
        )}

        <div className="flex items-center gap-1.5 shrink-0">
          {/* View mode toggle */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "size-8",
              viewMode === "grid" && "text-primary bg-primary/10"
            )}
            onClick={() => onViewModeChange("grid")}
            title="Grid view"
          >
            <LayoutGrid className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "size-8",
              viewMode === "tabs" && "text-primary bg-primary/10"
            )}
            onClick={() => onViewModeChange("tabs")}
            title="Tab view"
          >
            <Layers className="size-4" />
          </Button>

          {/* Divider + stop button only when tasks are still running */}
          {!tasksComplete && (
            <>
              <div className="mx-1 h-5 w-px bg-border" />

              {/* Stop button */}
              {showStopConfirm ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    Stop session?
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setShowStopConfirm(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      setShowStopConfirm(false);
                      onStop();
                    }}
                  >
                    Stop
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setShowStopConfirm(true)}
                  title="Stop session"
                >
                  <Square className="size-3.5 fill-current" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
