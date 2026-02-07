"use client";

import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { Plus, X } from "lucide-react";
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
      className={`flex w-[300px] shrink-0 flex-col rounded-xl border bg-zinc-900/40 ${
        isUnassigned
          ? "border-dashed border-zinc-700"
          : "border-zinc-800"
      } ${isOver ? "ring-2 ring-primary/20" : ""}`}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50">
        <div className="flex items-center gap-2.5">
          <span
            className="size-2.5 rounded-full shrink-0"
            style={{
              backgroundColor: isUnassigned ? "var(--color-muted-foreground)" : accentColor,
            }}
          />
          <span className="text-sm font-medium text-zinc-200">{label}</span>
          <span className="text-xs text-zinc-600 tabular-nums">
            {tasks.length}
          </span>
        </div>
        {canRemove && onRemoveColumn && (
          <button
            onClick={onRemoveColumn}
            className="text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Task list */}
      <div className="flex-1 p-2 space-y-2 min-h-[200px] flex flex-col">
        <div ref={setNodeRef} className="flex-1 space-y-2 min-h-[150px]">
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

        {/* Add task button */}
        <button
          onClick={onAddTask}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-800 py-2 text-xs text-zinc-600 hover:text-zinc-400 hover:border-zinc-700 transition-colors"
        >
          <Plus className="size-3" />
          Add task
        </button>
      </div>
    </div>
  );
}
