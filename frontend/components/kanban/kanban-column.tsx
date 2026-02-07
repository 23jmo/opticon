"use client";

import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Todo } from "@/lib/types";
import { KanbanTaskCard } from "./kanban-task-card";

const COLUMN_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

interface KanbanColumnProps {
  columnId: string;
  label: string;
  colorIndex: number;
  tasks: Todo[];
  isUnassigned?: boolean;
  canRemove?: boolean;
  onUpdateTask: (taskId: string, description: string) => void;
  onRemoveTask: (taskId: string) => void;
  onAddTask: () => void;
  onRemoveColumn?: () => void;
}

export function KanbanColumn({
  columnId,
  label,
  colorIndex,
  tasks,
  isUnassigned,
  canRemove,
  onUpdateTask,
  onRemoveTask,
  onAddTask,
  onRemoveColumn,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId });

  const accentColor = COLUMN_COLORS[colorIndex % COLUMN_COLORS.length];

  return (
    <div
      className={cn(
        "flex w-[280px] shrink-0 flex-col transition-colors",
        isOver && "bg-zinc-800/20 rounded-lg"
      )}
    >
      {/* Column header — minimal */}
      <div className="flex items-center justify-between px-1 py-2 mb-2">
        <div className="flex items-center gap-2">
          {!isUnassigned && (
            <span
              className="size-2 rounded-sm shrink-0"
              style={{ backgroundColor: accentColor }}
            />
          )}
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            {label}
          </span>
          <span className="text-xs text-zinc-600">{tasks.length}</span>
        </div>
        {canRemove && onRemoveColumn && (
          <button
            onClick={onRemoveColumn}
            className="text-zinc-700 hover:text-zinc-400 transition-colors"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Tasks */}
      <div ref={setNodeRef} className="flex-1 space-y-2 min-h-[100px]">
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <KanbanTaskCard
              key={task.id}
              task={task}
              onUpdate={(desc) => onUpdateTask(task.id, desc)}
              onRemove={() => onRemoveTask(task.id)}
            />
          ))}
        </SortableContext>
      </div>

      {/* Add task — minimal */}
      <button
        onClick={onAddTask}
        className="flex items-center gap-1.5 px-1 py-2 mt-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
      >
        <Plus className="size-3.5" />
        New
      </button>
    </div>
  );
}
