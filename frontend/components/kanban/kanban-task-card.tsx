"use client";

import { useRef, useEffect } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Todo } from "@/lib/types";

interface KanbanTaskCardProps {
  task: Todo;
  onUpdate: (description: string) => void;
  onRemove: () => void;
  overlay?: boolean;
}

export function KanbanTaskCard({
  task,
  onUpdate,
  onRemove,
  overlay,
}: KanbanTaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Auto-resize textarea on mount and when value changes
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = textarea.scrollHeight + "px";
    }
  }, [task.description]);

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    target.style.height = "auto";
    target.style.height = target.scrollHeight + "px";
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "group rounded-lg bg-zinc-800/60 px-3.5 py-3 cursor-grab active:cursor-grabbing transition-all",
        isDragging && "opacity-50",
        overlay && "shadow-lg shadow-black/50"
      )}
      style={{
        ...sortableStyle,
        boxShadow: overlay
          ? undefined
          : "rgba(0,0,0,0.4) 0px 0px 0px 1px, rgba(0,0,0,0.2) 0px 2px 4px",
      }}
    >
      {/* Task text — auto-expanding textarea */}
      <textarea
        ref={textareaRef}
        value={task.description}
        onChange={(e) => onUpdate(e.target.value)}
        onInput={handleInput}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        className="w-full bg-transparent text-sm text-zinc-200 resize-none outline-none placeholder:text-zinc-600 leading-relaxed"
        placeholder="Describe the task..."
        rows={1}
        style={{ minHeight: "20px" }}
      />

      {/* Delete — bottom right, only on hover */}
      <div className="flex justify-end mt-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    </div>
  );
}
