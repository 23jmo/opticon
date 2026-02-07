"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [agentCount, setAgentCount] = useState("1");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!prompt.trim()) {
      setError("Please enter a prompt");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          agentCount: parseInt(agentCount, 10),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create session");
      }

      const data = await response.json();
      router.push(`/session/${data.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col items-center justify-center px-4 py-16">
        <div className="w-full space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-black dark:text-zinc-50">
              Multi-Agent VM Orchestration
            </h1>
            <p className="text-lg text-zinc-600 dark:text-zinc-400">
              Submit a prompt and watch multiple AI agents work in parallel
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Textarea
                placeholder="Enter your prompt here... (e.g., 'Write a research paper on Google Docs about the rise of Daedalus Labs')"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-32 text-base md:text-sm"
                disabled={isSubmitting}
              />
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="agent-count"
                  className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Agents:
                </label>
                <Select
                  value={agentCount}
                  onValueChange={setAgentCount}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="agent-count" className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="4">4</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="submit"
                disabled={isSubmitting || !prompt.trim()}
                className="flex-1 md:flex-initial"
              >
                {isSubmitting ? "Creating Session..." : "Start Session"}
              </Button>
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive dark:bg-destructive/20">
                {error}
              </div>
            )}
          </form>
        </div>
      </main>
    </div>
  );
}
