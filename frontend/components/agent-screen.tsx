"use client";

import { useEffect, useState } from "react";
import { AgentActivity } from "@/lib/mock-data";
import { Monitor, Search, FileText, Wifi, Check } from "lucide-react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentScreenProps {
  agentId: string;
  activity: AgentActivity;
  status: string;
}

export function AgentScreen({ agentId, activity, status }: AgentScreenProps) {
  if (status === "booting") {
    return <BootSequence gradient={activity?.gradient} />;
  }

  if (status === "error") {
    return (
      <div
        className={`flex h-full items-center justify-center bg-gradient-to-br ${activity?.gradient || "from-red-950/80 to-slate-950"}`}
      >
        <div className="text-center space-y-3">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 backdrop-blur">
            <Monitor className="size-5 text-red-400" />
          </div>
          <div className="space-y-1">
            <p className="text-sm text-red-400 font-medium">
              Agent error
            </p>
            <p className="text-xs text-muted-foreground/50">
              This agent encountered an error
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-950 to-zinc-950">
        <div className="text-center space-y-3">
          <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground/50">Loading...</p>
        </div>
      </div>
    );
  }

  if (activity.label === "Research") return <MockScholarScreen />;
  if (activity.label === "Writing") return <MockDocsScreen />;
  if (activity.label === "Analysis") return <MockTerminalScreen />;
  return <MockWaitingScreen />;
}

function BootSequence({ gradient }: { gradient?: string }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 1500);
    const t2 = setTimeout(() => setPhase(2), 3500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const phases = [
    { label: "Booting sandbox", icon: Monitor },
    { label: "Connecting stream", icon: Wifi },
    { label: "Ready", icon: Check },
  ];

  return (
    <div
      className={`flex h-full items-center justify-center bg-gradient-to-br ${gradient || "from-slate-950 to-zinc-950"}`}
    >
      <div className="text-center space-y-5">
        <div className="mx-auto flex size-14 items-center justify-center rounded-xl border border-border bg-background/10 backdrop-blur">
          <Monitor className="size-6 text-muted-foreground" />
        </div>

        <div className="space-y-4">
          {phases.map((p, i) => {
            const Icon = p.icon;
            const isActive = i === phase;
            const isDone = i < phase;

            return (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-3 text-sm transition-all duration-300",
                  isActive
                    ? "text-foreground"
                    : isDone
                      ? "text-muted-foreground/60"
                      : "text-muted-foreground/30"
                )}
              >
                {isDone ? (
                  <Check className="size-4 text-emerald-400" />
                ) : isActive ? (
                  <Loader2 className="size-4 animate-spin text-primary" />
                ) : (
                  <Icon className="size-4" />
                )}
                <span>{p.label}</span>
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="w-48 mx-auto h-1 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary/60 rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${((phase + 1) / phases.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function MockScholarScreen() {
  return (
    <div className="h-full bg-[#0f1117] p-6 overflow-auto">
      <div className="flex items-center gap-2 mb-5">
        <div className="text-base font-serif text-blue-400">
          Google Scholar
        </div>
      </div>

      <div className="flex items-center gap-2 mb-5">
        <div className="flex-1 rounded-lg bg-white/[0.06] px-4 py-2.5 flex items-center gap-2 border border-white/[0.06]">
          <Search className="size-4 text-zinc-500" />
          <span className="text-sm text-zinc-300">
            Daedalus Labs AI agents
          </span>
        </div>
      </div>

      <p className="text-[11px] text-zinc-500 mb-5">
        About 1,240 results (0.05 sec)
      </p>

      <div className="space-y-5">
        <ScholarResult
          title="Multi-Agent Orchestration Frameworks for Autonomous Computing"
          authors="J Smith, A Johnson — Journal of AI Systems, 2024"
          excerpt="This paper presents a comprehensive survey of multi-agent orchestration frameworks, with a focus on the Daedalus Labs approach to autonomous desktop computing and task decomposition..."
          citations={42}
        />
        <ScholarResult
          title="Daedalus Labs: A New Paradigm in AI Agent Development"
          authors="M Chen, L Wang et al — 2024"
          excerpt="We introduce the Daedalus Labs SDK, a novel framework for building AI agents that can interact with computing environments through natural language instructions..."
          citations={28}
          isHighlighted
        />
        <ScholarResult
          title="Computer Use Agents: A Survey and Future Directions"
          authors="R Williams — ACM Computing Surveys, 2023"
          excerpt="A comprehensive survey of AI agents capable of interacting with graphical user interfaces, including analysis of tool-augmented LLM approaches and vision-based methods..."
          citations={156}
        />
        <ScholarResult
          title="Autonomous Desktop Agents with Visual Grounding"
          authors="K Patel, S Lee — NeurIPS 2024"
          excerpt="We propose a new architecture for desktop agents that combines visual grounding with language model reasoning to achieve state-of-the-art performance..."
          citations={19}
        />
      </div>
    </div>
  );
}

function ScholarResult({
  title,
  authors,
  excerpt,
  citations,
  isHighlighted,
}: {
  title: string;
  authors: string;
  excerpt: string;
  citations: number;
  isHighlighted?: boolean;
}) {
  return (
    <div
      className={`space-y-1 ${isHighlighted ? "ring-1 ring-blue-500/20 bg-blue-500/[0.03] rounded-lg p-3 -mx-3" : ""}`}
    >
      <p className="text-[13px] text-blue-400 hover:underline cursor-pointer leading-snug">
        {title}
      </p>
      <p className="text-[11px] text-emerald-400/80">{authors}</p>
      <p className="text-[11px] text-zinc-500 leading-relaxed">{excerpt}</p>
      <p className="text-[10px] text-zinc-600">
        Cited by {citations} &middot; Related articles
      </p>
    </div>
  );
}

function MockDocsScreen() {
  return (
    <div className="h-full bg-[#0f1117] flex flex-col overflow-auto">
      <div className="flex items-center gap-2 border-b border-white/[0.04] px-4 py-2">
        <FileText className="size-4 text-blue-400" />
        <span className="text-xs font-medium text-zinc-300">
          The Rise of Daedalus Labs
        </span>
        <span className="text-[10px] text-zinc-600 ml-auto">
          All changes saved
        </span>
      </div>

      <div className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-1.5 text-[10px] text-zinc-500">
        <span>File</span>
        <span>Edit</span>
        <span>View</span>
        <span>Insert</span>
        <span>Format</span>
        <span>Tools</span>
      </div>

      <div className="flex-1 flex justify-center py-8 px-4 bg-[#0a0b0f]">
        <div className="w-full max-w-[580px] bg-white/[0.02] border border-white/[0.04] rounded-sm px-12 py-10 space-y-5">
          <h1 className="text-xl font-serif text-zinc-100">
            The Rise of Daedalus Labs
          </h1>
          <p className="text-[11px] text-zinc-500 italic">
            A Comprehensive Analysis of AI Agent Development
          </p>

          <div className="space-y-4">
            <h2 className="text-sm font-serif text-zinc-200 pt-2">
              1. Introduction
            </h2>
            <p className="text-[11px] text-zinc-400 leading-[1.8]">
              The landscape of artificial intelligence has undergone a
              fundamental transformation with the emergence of autonomous AI
              agents capable of interacting directly with computing
              environments. At the forefront of this revolution stands Daedalus
              Labs, a company that has pioneered a novel approach to multi-agent
              orchestration.
            </p>
            <p className="text-[11px] text-zinc-400 leading-[1.8]">
              This paper examines the rise of Daedalus Labs, analyzing their
              technical architecture, market positioning, and the broader
              implications of their approach for the future of human-computer
              interaction.
            </p>

            <h2 className="text-sm font-serif text-zinc-200 pt-2">
              2. Background
            </h2>
            <p className="text-[11px] text-zinc-400 leading-[1.8]">
              The concept of AI agents operating within graphical user interfaces
              dates back to early research in automated testing and accessibility
              tools. However, recent advances in large language models (LLMs)
              have
              <span className="border-r-2 border-primary animate-pulse" />
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MockTerminalScreen() {
  return (
    <div className="h-full bg-[#0d1117] p-5 font-mono text-[11px] overflow-auto leading-relaxed">
      <div className="space-y-0.5 text-zinc-300">
        <p>
          <span className="text-emerald-400">user@sandbox</span>
          <span className="text-zinc-600">:</span>
          <span className="text-blue-400">~</span>
          <span className="text-zinc-600">$</span>{" "}
          <span>python collect_market_data.py</span>
        </p>
        <p className="text-zinc-500">
          [INFO] Fetching AI agent market data...
        </p>
        <p className="text-zinc-500">
          [INFO] Sources: Crunchbase, PitchBook, GitHub
        </p>
        <p className="text-cyan-400">
          ━━━━━━━━━━━━━━━━━━━━━━━━━━ 100% (3/3 sources)
        </p>
        <p className="text-zinc-500">[INFO] Processing 2,847 records...</p>
        <p className="text-emerald-400">
          ✓ Market data collected and saved to ./data/market.json
        </p>
        <p>&nbsp;</p>

        <p>
          <span className="text-emerald-400">user@sandbox</span>
          <span className="text-zinc-600">:</span>
          <span className="text-blue-400">~</span>
          <span className="text-zinc-600">$</span>{" "}
          <span>python analyze_repos.py --org daedalus-labs</span>
        </p>
        <p className="text-zinc-500">
          [INFO] Cloning 12 public repositories...
        </p>
        <p className="text-zinc-500">[INFO] Analyzing code patterns...</p>
        <p>&nbsp;</p>
        <p className="text-amber-400/80">
          ┌────────────────────────────────────────────┐
        </p>
        <p className="text-amber-400/80">
          │ Repository Analysis Summary &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│
        </p>
        <p className="text-amber-400/80">
          ├────────────────────────────────────────────┤
        </p>
        <p>
          │ Total repos: &nbsp;&nbsp;&nbsp;&nbsp;
          <span className="text-zinc-100">12</span>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│
        </p>
        <p>
          │ Total stars: &nbsp;&nbsp;&nbsp;&nbsp;
          <span className="text-zinc-100">4,231</span>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│
        </p>
        <p>
          │ Total commits: &nbsp;&nbsp;
          <span className="text-zinc-100">8,492</span>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│
        </p>
        <p>
          │ Primary lang: &nbsp;&nbsp;&nbsp;
          <span className="text-zinc-100">Python (67%)</span>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│
        </p>
        <p>
          │ Contributors: &nbsp;&nbsp;&nbsp;
          <span className="text-zinc-100">47</span>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│
        </p>
        <p className="text-amber-400/80">
          └────────────────────────────────────────────┘
        </p>
        <p>&nbsp;</p>

        <p>
          <span className="text-emerald-400">user@sandbox</span>
          <span className="text-zinc-600">:</span>
          <span className="text-blue-400">~</span>
          <span className="text-zinc-600">$</span>{" "}
          <span>python generate_charts.py</span>
        </p>
        <p className="text-zinc-500">
          [INFO] Generating comparison charts...
        </p>
        <p className="text-cyan-400">
          ━━━━━━━━━━━━━━━━━━━━━━━━━━ 100% (4/4 charts)
        </p>
        <p className="text-emerald-400">
          ✓ Charts saved to ./output/charts/
        </p>
        <p>&nbsp;</p>

        <p>
          <span className="text-emerald-400">user@sandbox</span>
          <span className="text-zinc-600">:</span>
          <span className="text-blue-400">~</span>
          <span className="text-zinc-600">$</span>{" "}
          <span className="animate-pulse">█</span>
        </p>
      </div>
    </div>
  );
}

function MockWaitingScreen() {
  return (
    <div className="flex h-full items-center justify-center bg-gradient-to-br from-amber-950/30 to-slate-950">
      <div className="text-center space-y-3">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-border bg-background/10 backdrop-blur">
          <Monitor className="size-5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Waiting for tasks...
          </p>
          <p className="text-[11px] text-muted-foreground/50">
            Review agent will start when research is ready
          </p>
        </div>
      </div>
    </div>
  );
}
