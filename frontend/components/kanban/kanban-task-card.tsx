"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2 } from "lucide-react";
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
      {...attributes}
      {...listeners}
      className={`group flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 cursor-grab active:cursor-grabbing ${
        isDragging ? "ring-2 ring-primary/30 opacity-80" : ""
      } ${overlay ? "shadow-xl shadow-black/40 ring-2 ring-primary/30" : ""}`}
    >
      {/* Checkbox */}
      <div className="mt-1 shrink-0">
        <div className="size-4 rounded-full border-2 border-zinc-700 bg-zinc-900/40" />
      </div>

      {/* Task text */}
      <textarea
        value={task.description}
        onChange={(e) => onUpdate(e.target.value)}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        className="flex-1 bg-transparent text-sm text-zinc-200 resize-none outline-none placeholder:text-zinc-600 leading-relaxed"
        placeholder="Describe the task..."
        rows={1}
        style={{ height: 'auto', minHeight: '20px' }}
        onInput={(e) => {
          const target = e.target as HTMLTextAreaElement;
          target.style.height = 'auto';
          target.style.height = target.scrollHeight + 'px';
        }}
      />

      {/* Delete button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-destructive transition-all mt-1 shrink-0"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}
