"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useBilling } from "@flowglad/nextjs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Lock } from "lucide-react";
import { PLAN_LIMITS, PRO_FEATURE_SLUG } from "@/lib/billing-constants";

interface MobilePromptSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobilePromptSheet({
  open,
  onOpenChange,
}: MobilePromptSheetProps) {
  const { checkFeatureAccess } = useBilling();
  const isPro = checkFeatureAccess?.(PRO_FEATURE_SLUG) ?? false;
  const maxAgents = isPro
    ? PLAN_LIMITS.pro.maxAgents
    : PLAN_LIMITS.free.maxAgents;

  const [prompt, setPrompt] = useState("");
  const [agentCount, setAgentCount] = useState(2);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async () => {
    if (!prompt.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          agentCount,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create session");
      }

      const { sessionId } = await response.json();
      onOpenChange(false);
      router.push(`/session/${sessionId}/approve`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl px-5 pb-8">
        <SheetHeader className="pb-3">
          <SheetTitle className="text-base">New Task</SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe a complex task for AI agents..."
            className="min-h-[120px] resize-none text-sm"
            disabled={isSubmitting}
          />

          {/* Agent count selector */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500 font-medium">
              Agents
            </span>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4].map((n) => {
                const isLocked = n > maxAgents;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      if (isLocked) {
                        router.push("/pricing");
                      } else {
                        setAgentCount(n);
                      }
                    }}
                    disabled={isSubmitting}
                    className={`flex size-9 items-center justify-center rounded-lg text-sm font-medium transition-all ${
                      isLocked
                        ? "text-zinc-700 cursor-pointer hover:text-zinc-500"
                        : agentCount === n
                          ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                          : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                    }`}
                  >
                    {isLocked ? <Lock className="size-3.5" /> : n}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !prompt.trim()}
            className="w-full h-11 text-sm gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Decomposing...
              </>
            ) : (
              "Launch"
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
