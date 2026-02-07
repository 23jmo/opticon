"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";
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

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 ${
        isDragging ? "ring-2 ring-primary/30 opacity-80" : ""
      } ${overlay ? "shadow-xl shadow-black/40 ring-2 ring-primary/30" : ""}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="mt-1.5 cursor-grab text-zinc-700 hover:text-zinc-500 active:cursor-grabbing shrink-0 touch-none"
        tabIndex={-1}
      >
        <GripVertical className="size-3.5" />
      </button>
      <textarea
        value={task.description}
        onChange={(e) => onUpdate(e.target.value)}
        className="flex-1 bg-transparent text-sm text-zinc-200 resize-none outline-none placeholder:text-zinc-600 min-h-[36px] leading-relaxed"
        placeholder="Describe the task..."
        rows={2}
      />
      <button
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-destructive transition-all mt-1.5 shrink-0"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}
