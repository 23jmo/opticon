"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, LogOut } from "lucide-react";

export default function Home() {
  const { data: authSession } = useSession();
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
      router.push(`/session/${sessionId}/approve`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setIsSubmitting(false);
    }
  };

  const handleDemoMode = () => {
    const params = new URLSearchParams({
      prompt: prompt.trim() || "Write a comprehensive research paper on Google Docs about the rise of Daedalus Labs...",
      agents: String(agentCount),
    });
    router.push(`/session/demo?${params.toString()}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center">
      <div className="dot-grid absolute inset-0 pointer-events-none" />

      {authSession?.user && (
        <div className="absolute top-4 right-4 z-20 flex items-center gap-3">
          {authSession.user.image ? (
            <img
              src={authSession.user.image}
              alt=""
              className="size-8 rounded-full"
            />
          ) : (
            <div className="flex size-8 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-primary">
              {authSession.user.name?.[0] || authSession.user.email?.[0] || "?"}
            </div>
          )}
          <span className="text-sm text-zinc-400">
            {authSession.user.name || authSession.user.email}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut()}
            className="text-zinc-500 hover:text-zinc-300"
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      )}

      <main className="relative z-10 w-full max-w-2xl px-6">
        <div className="space-y-8">
          {/* Title */}
          <div className="text-center space-y-4">
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-gradient leading-[1.1]">
              Panopticon
            </h1>
            <p className="text-base sm:text-lg text-zinc-400 max-w-lg mx-auto leading-relaxed">
              Describe a complex task. AI agents will execute it on cloud
              desktops in parallel.
            </p>
          </div>

          {/* Input area */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm overflow-hidden transition-colors focus-within:border-zinc-700">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write a research paper on Google Docs about the rise of Daedalus Labs..."
              className="min-h-[128px] resize-none border-0 bg-transparent px-5 pt-4 pb-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-0 leading-relaxed"
              disabled={isSubmitting}
            />

            <div className="flex items-center justify-between border-t border-zinc-800/50 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-500 font-medium">
                  Agents
                </span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setAgentCount(n)}
                      disabled={isSubmitting}
                      className={`flex size-7 items-center justify-center rounded-md text-xs font-medium transition-all ${
                        agentCount === n
                          ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                          : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDemoMode}
                  disabled={isSubmitting}
                  className="text-zinc-400"
                >
                  Demo
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !prompt.trim()}
                  size="sm"
                  className="gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Decomposing...
                    </>
                  ) : (
                    "Launch"
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Keyboard hint */}
          <p className="text-center text-xs text-zinc-600">
            <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
              ⌘
            </kbd>
            <span className="mx-1">+</span>
            <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
              ↵
            </kbd>
            <span className="ml-1.5">to launch</span>
          </p>

          {/* Error */}
          {error && (
            <div className="animate-slide-in rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
