"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown } from "lucide-react";

interface PromptBarProps {
  prompt: string;
  agentCount: number;
}

export function PromptBar({ prompt, agentCount }: PromptBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="shrink-0 border-b border-border bg-card/50 px-5 py-3">
      <div className="flex items-center gap-3">
        <Badge
          variant="outline"
          className="shrink-0 gap-1.5 border-primary/30 bg-primary/10 text-primary"
        >
          <span className="size-1.5 rounded-full bg-primary animate-pulse" />
          {agentCount} agent{agentCount !== 1 ? "s" : ""}
        </Badge>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 min-w-0 text-left"
        >
          <p
            className={`text-sm text-muted-foreground leading-relaxed ${isExpanded ? "" : "truncate"}`}
          >
            {prompt}
          </p>
          <ChevronDown
            className={`size-3.5 shrink-0 text-muted-foreground/40 transition-transform ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>
    </div>
  );
}
