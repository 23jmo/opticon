"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useBilling } from "@flowglad/nextjs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, LogOut, PanelLeft, Lock } from "lucide-react";
import { SessionHistorySidebar } from "@/components/session-history-sidebar";
import { PlanBadge } from "@/components/plan-badge";
import { PLAN_LIMITS, PRO_FEATURE_SLUG } from "@/lib/billing-constants";
import Link from "next/link";

const EXAMPLE_PROMPTS = [
  {
    label: "Open Google.com",
    prompt:
      "Open Google.com in the browser, search for 'latest AI research papers 2026', and compile a summary of the top 5 results with titles, authors, and key findings into a text document on the desktop.",
  },
  {
    label: "Deep research",
    prompt:
      "Conduct deep research on the current state of quantum computing in 2026. Search multiple sources including academic papers, tech news sites, and company announcements. Create a comprehensive Google Doc that covers recent breakthroughs, major players, commercial applications, and future outlook with citations.",
  },
  {
    label: "Coordinated research paper",
    prompt:
      "Write a coordinated research paper on the environmental and economic impact of large language models. Agent 1 should research energy consumption and carbon footprint data. Agent 2 should research economic benefits and productivity gains. Then combine findings into a well-structured paper with an abstract, introduction, methodology, findings, and conclusion in Google Docs.",
  },
  {
    label: "Competitive analysis",
    prompt:
      "Perform a competitive analysis of the top 4 AI coding assistants (GitHub Copilot, Cursor, Claude Code, Windsurf). Each agent should research one tool — gathering pricing, features, user reviews, and limitations. Compile everything into a comparison spreadsheet and a summary document with recommendations.",
  },
  {
    label: "Build a website",
    prompt:
      "Build a personal portfolio website using HTML, CSS, and JavaScript. It should have a hero section with a name and tagline, an about section, a projects grid with placeholder cards, and a contact form. Use a modern dark theme with smooth scroll animations. Save all files to the desktop.",
  },
];

export default function Home() {
  const { data: authSession } = useSession();
  const { checkFeatureAccess } = useBilling();
  const [prompt, setPrompt] = useState("");
  const [agentCount, setAgentCount] = useState(2);

  const isPro = checkFeatureAccess?.(PRO_FEATURE_SLUG) ?? false;
  const maxAgents = isPro ? PLAN_LIMITS.pro.maxAgents : PLAN_LIMITS.free.maxAgents;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
      <SessionHistorySidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Sidebar toggle — top-left, hidden when sidebar open */}
      {authSession?.user && !sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="fixed left-4 top-4 z-30 flex size-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
        >
          <PanelLeft className="size-4" />
        </button>
      )}

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
            <PlanBadge />
            <Link href="/pricing">
              <Button variant="ghost" size="sm" className="text-zinc-500 hover:text-zinc-300 text-xs">
                Pricing
              </Button>
            </Link>
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
                        title={isLocked ? "Upgrade to Pro to unlock" : undefined}
                        className={`flex size-7 items-center justify-center rounded-md text-xs font-medium transition-all ${
                          isLocked
                            ? "text-zinc-700 cursor-pointer hover:text-zinc-500"
                            : agentCount === n
                              ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                              : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                        }`}
                      >
                        {isLocked ? (
                          <Lock className="size-3" />
                        ) : (
                          n
                        )}
                      </button>
                    );
                  })}
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

          {/* Example prompts */}
          <div className="flex flex-wrap justify-center gap-2">
            {EXAMPLE_PROMPTS.map((example) => (
              <button
                key={example.label}
                onClick={() => setPrompt(example.prompt)}
                className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3.5 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/60 transition-all"
              >
                {example.label}
              </button>
            ))}
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
