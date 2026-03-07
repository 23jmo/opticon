"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { LayoutGrid, Plus, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileNavProps {
  onNewTask: () => void;
}

export function MobileNav({ onNewTask }: MobileNavProps) {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 lg:hidden border-t border-border bg-card/95 backdrop-blur-md">
      <div
        className="flex items-center justify-around"
        style={{ height: "64px", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <Link
          href="/"
          className={cn(
            "flex flex-col items-center gap-1 px-4 py-2 text-[10px] font-medium transition-colors",
            pathname === "/"
              ? "text-primary"
              : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          <LayoutGrid className="size-5" />
          Home
        </Link>

        <button
          onClick={onNewTask}
          className="flex flex-col items-center gap-1 px-4 py-2 text-[10px] font-medium text-primary transition-colors"
        >
          <div className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Plus className="size-4" />
          </div>
          New Task
        </button>

        <Link
          href="/pricing"
          className={cn(
            "flex flex-col items-center gap-1 px-4 py-2 text-[10px] font-medium transition-colors",
            pathname === "/pricing"
              ? "text-primary"
              : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          <User className="size-5" />
          Profile
        </Link>
      </div>
    </nav>
  );
}
