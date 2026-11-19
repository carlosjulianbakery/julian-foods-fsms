"use client";
import type { ReactNode } from "react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";

export interface RuleGroup {
  ruleId: string;
  title: string;
  count: number;
  content: ReactNode;
}

/**
 * A day's tasks grouped by rule. Admins can reorder the groups (drag handle or arrows); that changes the
 * saved work order for every day. Tasks inside a group are never reorderable here — batch sheets follow
 * the production calendar.
 */
export function RuleOrderList({
  groups, canReorder, busy = false, onReorder,
}: {
  groups: RuleGroup[];
  canReorder: boolean;
  busy?: boolean;
  onReorder: (ruleIds: string[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!canReorder) {
    return <>{groups.map((g) => <div key={g.ruleId} className="space-y-3">{g.content}</div>)}</>;
  }

  const ids = groups.map((g) => g.ruleId);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= ids.length || from === to) return;
    onReorder(arrayMove(ids, from, to));
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    move(ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="space-y-3" data-rule-order-list>
          {groups.map((g, i) => (
            <SortableGroup
              key={g.ruleId}
              group={g}
              disabled={busy}
              isFirst={i === 0}
              isLast={i === groups.length - 1}
              onUp={() => move(i, i - 1)}
              onDown={() => move(i, i + 1)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableGroup({
  group, disabled, isFirst, isLast, onUp, onDown,
}: {
  group: RuleGroup; disabled: boolean; isFirst: boolean; isLast: boolean; onUp: () => void; onDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: group.ruleId,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`rounded-xl ${isDragging ? "relative z-10 shadow-lg ring-2 ring-[#C41E3A]/30 bg-white" : ""}`}
      data-rule-group={group.ruleId}
    >
      <div className="flex items-center gap-1 mb-1.5">
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          type="button"
          aria-label={`Drag to reorder ${group.title}`}
          style={{ touchAction: "none" }}
          className="flex items-center justify-center w-9 h-9 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-grab active:cursor-grabbing shrink-0"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <p className="flex-1 min-w-0 truncate text-[11px] font-bold uppercase tracking-wide text-gray-500">
          {group.title}
          {group.count > 1 && <span className="ml-1 font-medium text-gray-400">({group.count})</span>}
        </p>
        <button
          type="button"
          onClick={onUp}
          disabled={disabled || isFirst}
          aria-label={`Move ${group.title} up`}
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 shrink-0"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onDown}
          disabled={disabled || isLast}
          aria-label={`Move ${group.title} down`}
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 shrink-0"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-3">{group.content}</div>
    </div>
  );
}
