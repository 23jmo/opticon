"use client";

import { useState, useCallback, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { Plus, Loader2 } from "lucide-react";
import type { Todo } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { KanbanColumn } from "./kanban-column";
import { KanbanTaskCard } from "./kanban-task-card";

const UNASSIGNED = "unassigned";
const MAX_AGENTS = 4;

interface KanbanBoardProps {
  initialTasks: Todo[];
  initialAgentCount: number;
  onApprove: (tasks: Todo[], agentCount: number) => void;
  isApproving: boolean;
  onCancel: () => void;
}

function distributeTasksRoundRobin(
  tasks: Todo[],
  agentColumns: string[]
): Record<string, Todo[]> {
  const result: Record<string, Todo[]> = { [UNASSIGNED]: [] };
  for (const col of agentColumns) {
    result[col] = [];
  }

  tasks.forEach((task, index) => {
    if (agentColumns.length > 0) {
      const columnId = agentColumns[index % agentColumns.length];
      result[columnId].push({ ...task, assignedTo: columnId });
    } else {
      result[UNASSIGNED].push({ ...task, assignedTo: null });
    }
  });

  return result;
}

export function KanbanBoard({
  initialTasks,
  initialAgentCount,
  onApprove,
  isApproving,
  onCancel,
}: KanbanBoardProps) {
  const initialColumns = Array.from(
    { length: initialAgentCount },
    (_, i) => `agent-${i + 1}`
  );

  const [agentColumns, setAgentColumns] = useState<string[]>(initialColumns);
  const [tasksByColumn, setTasksByColumn] = useState<Record<string, Todo[]>>(
    () => distributeTasksRoundRobin(initialTasks, initialColumns)
  );
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const allColumns = [UNASSIGNED, ...agentColumns];

  const activeTask = useMemo(() => {
    if (!activeTaskId) return null;
    for (const col of allColumns) {
      const found = tasksByColumn[col]?.find((t) => t.id === activeTaskId);
      if (found) return found;
    }
    return null;
  }, [activeTaskId, tasksByColumn, allColumns]);

  const findColumnForTask = useCallback(
    (taskId: string): string | null => {
      for (const col of allColumns) {
        if (tasksByColumn[col]?.some((t) => t.id === taskId)) return col;
      }
      return null;
    },
    [tasksByColumn, allColumns]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveTaskId(event.active.id as string);
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeId = active.id as string;
      const overId = over.id as string;

      const activeCol = findColumnForTask(activeId);
      // overId could be a task or a column droppable
      let overCol = findColumnForTask(overId);
      if (!overCol && allColumns.includes(overId)) {
        overCol = overId;
      }

      if (!activeCol || !overCol || activeCol === overCol) return;

      setTasksByColumn((prev) => {
        const sourceTasks = [...(prev[activeCol] || [])];
        const destTasks = [...(prev[overCol] || [])];

        const activeIndex = sourceTasks.findIndex((t) => t.id === activeId);
        if (activeIndex === -1) return prev;

        const [movedTask] = sourceTasks.splice(activeIndex, 1);
        const updatedTask = {
          ...movedTask,
          assignedTo: overCol === UNASSIGNED ? null : overCol,
        };

        // Find insertion index in destination
        const overIndex = destTasks.findIndex((t) => t.id === overId);
        if (overIndex >= 0) {
          destTasks.splice(overIndex, 0, updatedTask);
        } else {
          destTasks.push(updatedTask);
        }

        return { ...prev, [activeCol]: sourceTasks, [overCol]: destTasks };
      });
    },
    [findColumnForTask, allColumns]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveTaskId(null);

      if (!over) return;

      const activeId = active.id as string;
      const overId = over.id as string;

      const activeCol = findColumnForTask(activeId);
      let overCol = findColumnForTask(overId);
      if (!overCol && allColumns.includes(overId)) {
        overCol = overId;
      }

      if (!activeCol || !overCol) return;

      if (activeCol === overCol) {
        // Reorder within same column
        setTasksByColumn((prev) => {
          const tasks = [...(prev[activeCol] || [])];
          const oldIndex = tasks.findIndex((t) => t.id === activeId);
          const newIndex = tasks.findIndex((t) => t.id === overId);
          if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex)
            return prev;
          return { ...prev, [activeCol]: arrayMove(tasks, oldIndex, newIndex) };
        });
      }
    },
    [findColumnForTask, allColumns]
  );

  const handleUpdateTask = useCallback(
    (taskId: string, description: string) => {
      setTasksByColumn((prev) => {
        const updated = { ...prev };
        for (const col of Object.keys(updated)) {
          updated[col] = updated[col].map((t) =>
            t.id === taskId ? { ...t, description } : t
          );
        }
        return updated;
      });
    },
    []
  );

  const handleRemoveTask = useCallback((taskId: string) => {
    setTasksByColumn((prev) => {
      const updated = { ...prev };
      for (const col of Object.keys(updated)) {
        updated[col] = updated[col].filter((t) => t.id !== taskId);
      }
      return updated;
    });
  }, []);

  const handleAddTask = useCallback((columnId: string) => {
    const newTask: Todo = {
      id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      description: "",
      status: "pending",
      assignedTo: columnId === UNASSIGNED ? null : columnId,
    };
    setTasksByColumn((prev) => ({
      ...prev,
      [columnId]: [...(prev[columnId] || []), newTask],
    }));
  }, []);

  const handleAddAgent = useCallback(() => {
    if (agentColumns.length >= MAX_AGENTS) return;
    const nextNum =
      agentColumns.length > 0
        ? Math.max(
            ...agentColumns.map((c) => parseInt(c.split("-")[1] || "0"))
          ) + 1
        : 1;
    const newCol = `agent-${nextNum}`;
    setAgentColumns((prev) => [...prev, newCol]);
    setTasksByColumn((prev) => ({ ...prev, [newCol]: [] }));
  }, [agentColumns]);

  const handleRemoveAgent = useCallback((columnId: string) => {
    setAgentColumns((prev) => prev.filter((c) => c !== columnId));
    setTasksByColumn((prev) => {
      const orphanedTasks = (prev[columnId] || []).map((t) => ({
        ...t,
        assignedTo: null,
      }));
      const updated = { ...prev };
      delete updated[columnId];
      updated[UNASSIGNED] = [...(updated[UNASSIGNED] || []), ...orphanedTasks];
      return updated;
    });
  }, []);

  const handleApprove = useCallback(() => {
    // Collect all tasks, redistribute unassigned round-robin
    const allTasks: Todo[] = [];
    const unassigned = tasksByColumn[UNASSIGNED] || [];

    for (const col of agentColumns) {
      allTasks.push(...(tasksByColumn[col] || []));
    }

    // Redistribute unassigned tasks round-robin across agents
    unassigned.forEach((task, index) => {
      if (agentColumns.length > 0) {
        const targetCol = agentColumns[index % agentColumns.length];
        allTasks.push({ ...task, assignedTo: targetCol });
      } else {
        allTasks.push(task);
      }
    });

    // Filter out empty tasks
    const validTasks = allTasks.filter((t) => t.description.trim().length > 0);
    onApprove(validTasks, agentColumns.length);
  }, [tasksByColumn, agentColumns, onApprove]);

  const totalValidTasks = allColumns.reduce(
    (sum, col) =>
      sum +
      (tasksByColumn[col] || []).filter((t) => t.description.trim()).length,
    0
  );

  return (
    <div className="flex flex-col h-full">
      {/* Board */}
      <div className="flex-1 overflow-x-auto px-6 py-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 h-full">
            {/* Unassigned column */}
            <KanbanColumn
              columnId={UNASSIGNED}
              label="Unassigned"
              colorIndex={-1}
              tasks={tasksByColumn[UNASSIGNED] || []}
              isUnassigned
              onUpdateTask={handleUpdateTask}
              onRemoveTask={handleRemoveTask}
              onAddTask={() => handleAddTask(UNASSIGNED)}
            />

            {/* Agent columns */}
            {agentColumns.map((col, index) => (
              <KanbanColumn
                key={col}
                columnId={col}
                label={`Agent ${col.split("-")[1]}`}
                colorIndex={index}
                tasks={tasksByColumn[col] || []}
                canRemove={agentColumns.length > 1}
                onUpdateTask={handleUpdateTask}
                onRemoveTask={handleRemoveTask}
                onAddTask={() => handleAddTask(col)}
                onRemoveColumn={() => handleRemoveAgent(col)}
              />
            ))}

            {/* Add agent button */}
            {agentColumns.length < MAX_AGENTS && (
              <button
                onClick={handleAddAgent}
                className="flex w-[300px] shrink-0 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-800 bg-zinc-900/20 text-zinc-600 hover:text-zinc-400 hover:border-zinc-700 transition-colors"
              >
                <Plus className="size-5" />
                <span className="text-xs">Add Agent</span>
              </button>
            )}
          </div>

          <DragOverlay>
            {activeTask ? (
              <KanbanTaskCard
                task={activeTask}
                onUpdate={() => {}}
                onRemove={() => {}}
                overlay
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-800 px-6 py-4 flex items-center justify-between bg-zinc-950/50">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            onClick={onCancel}
            className="text-zinc-400"
          >
            Cancel
          </Button>
          <p className="text-xs text-zinc-600">
            {totalValidTasks} task{totalValidTasks !== 1 ? "s" : ""} across{" "}
            {agentColumns.length} agent{agentColumns.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button
          onClick={handleApprove}
          disabled={isApproving || totalValidTasks === 0}
          className="gap-2"
        >
          {isApproving ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Starting...
            </>
          ) : (
            `Start with ${agentColumns.length} agent${agentColumns.length !== 1 ? "s" : ""}`
          )}
        </Button>
      </div>
    </div>
  );
}

export { UNASSIGNED, MAX_AGENTS };
export type { KanbanBoardProps };
