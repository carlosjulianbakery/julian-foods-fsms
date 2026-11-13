"use client";
import { useState, useEffect, useTransition, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, ChevronRight, X, Play,
  MoreHorizontal, Brush, FlaskConical,
} from "lucide-react";
import type { TaskInstance } from "./MyTasksClient";
import { addDaysToDateStr } from "@/lib/pacific-time";
import { TASK_FORM_REGISTRY } from "@/lib/task-form-registry";

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = d.getUTCDay(); // 0=Sun
  const daysBack = dow === 0 ? -6 : 1 - dow;
  return addDaysToDateStr(dateStr, daysBack);
}

function getWeekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysToDateStr(weekStart, i));
}

function getMonthBounds(monthStart: string): { start: string; end: string; days: string[] } {
  const [y, m] = monthStart.split("-").map(Number);
  // Find Monday on/before 1st of month
  const firstDay = `${y}-${String(m).padStart(2, "0")}-01`;
  const calStart = getMondayOf(firstDay);
  // Find Sunday on/after last day of month
  const lastDate = new Date(Date.UTC(y, m, 0)); // last day of month
  const lastDay = lastDate.toISOString().slice(0, 10);
  const lastDow = lastDate.getUTCDay(); // 0=Sun
  const daysToSun = lastDow === 0 ? 0 : 7 - lastDow;
  const calEnd = addDaysToDateStr(lastDay, daysToSun);

  const days: string[] = [];
  let cur = calStart;
  while (cur <= calEnd) {
    days.push(cur);
    cur = addDaysToDateStr(cur, 1);
  }
  return { start: calStart, end: calEnd, days };
}

function formatWeekRange(weekStart: string): string {
  const weekEnd = addDaysToDateStr(weekStart, 6);
  const [sy, sm, sd] = weekStart.split("-");
  const [, em, ed] = weekEnd.split("-");
  return `${sm}/${sd} – ${em}/${ed}/${sy}`;
}

function formatMonthLabel(monthStart: string): string {
  const d = new Date(monthStart + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function formatCompletedAt(isoStr: string): string {
  return (
    new Date(isoStr).toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }) + " PT"
  );
}

function daysOverdue(dueDateStr: string, today: string): number {
  const due = new Date(dueDateStr + "T12:00:00Z");
  const tod = new Date(today + "T12:00:00Z");
  return Math.max(0, Math.floor((tod.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
}

function parseBatchLabel(label: string): { product: string; qty: string | null } {
  const match = label.match(/^(.+?)\s+\((\d+\s*\S+)\)$/);
  if (match) return { product: match[1], qty: match[2] };
  return { product: label, qty: null };
}

function isQuietTask(inst: TaskInstance): boolean {
  return inst.formKey === "pre_op" || /daily.?clean/i.test(inst.ruleTitle) || /pre-?op/i.test(inst.ruleTitle);
}

// Status priority for "most urgent" per day
const STATUS_PRIORITY: Record<string, number> = {
  OVERDUE: 0, MISSED: 1, DUE_TODAY: 2, IN_PROGRESS: 3, UPCOMING: 4, DONE: 5, SKIPPED: 6,
};
function mostUrgentStatus(insts: TaskInstance[]): string | null {
  if (!insts.length) return null;
  return [...insts].sort((a, b) => (STATUS_PRIORITY[a.status] ?? 7) - (STATUS_PRIORITY[b.status] ?? 7))[0].status;
}

function statusChipColors(status: string): { bg: string; text: string; border: string } {
  switch (status) {
    case "OVERDUE": case "MISSED":
      return { bg: "bg-red-100", text: "text-red-700", border: "border-red-200" };
    case "DUE_TODAY":
      return { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200" };
    case "IN_PROGRESS":
      return { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" };
    case "DONE":
      return { bg: "bg-green-100", text: "text-green-700", border: "border-green-200" };
    case "SKIPPED":
      return { bg: "bg-gray-100", text: "text-gray-400", border: "border-gray-200" };
    default: // UPCOMING
      return { bg: "bg-gray-50", text: "text-gray-500", border: "border-gray-200" };
  }
}

function dotColor(status: string): string {
  switch (status) {
    case "OVERDUE": case "MISSED": return "bg-red-500";
    case "DUE_TODAY": return "bg-amber-500";
    case "IN_PROGRESS": return "bg-blue-500";
    case "DONE": return "bg-green-500";
    default: return "bg-gray-400";
  }
}

// ─── Chip ─────────────────────────────────────────────────────────────────────

function TaskChip({ inst }: { inst: TaskInstance }) {
  const c = statusChipColors(inst.status);
  const quiet = isQuietTask(inst);
  const batch = inst.formKey === "batch_sheet";
  const isLate = inst.completedLate && (inst.daysLate ?? 0) > 0;

  if (quiet) {
    return (
      <div className={`flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] font-medium min-h-[28px] ${c.bg} ${c.text} border ${c.border}`}>
        {/pre-?op/i.test(inst.ruleTitle)
          ? <FlaskConical className="w-2.5 h-2.5 shrink-0" />
          : <Brush className="w-2.5 h-2.5 shrink-0" />}
        <span className="truncate leading-tight">
          {/pre-?op/i.test(inst.ruleTitle) ? "Pre-Op" : "Cleaning"}
        </span>
        {isLate && <span className="ml-auto text-orange-500 font-bold text-[9px]">L</span>}
      </div>
    );
  }

  if (batch) {
    const { product, qty } = parseBatchLabel(inst.label);
    return (
      <div className={`px-1.5 py-1 rounded-md text-[10px] font-medium min-h-[44px] border ${c.bg} ${c.text} ${c.border}`}>
        <p className="font-semibold truncate leading-tight">{product}</p>
        {qty && <p className="opacity-70 text-[9px]">{qty}</p>}
        <span className="inline-block mt-0.5 text-[9px] px-1 py-0.5 rounded bg-indigo-100 text-indigo-600 leading-none">
          {inst.facilityName}
        </span>
        {isLate && (
          <span className="ml-1 text-orange-500 font-bold text-[9px]">Late</span>
        )}
      </div>
    );
  }

  return (
    <div className={`px-1.5 py-1 rounded-md text-[10px] font-medium min-h-[32px] truncate border ${c.bg} ${c.text} ${c.border}`}>
      {inst.ruleTitle}
      {isLate && <span className="ml-1 text-orange-500 font-bold">L</span>}
    </div>
  );
}

// ─── Day cell (week view) ──────────────────────────────────────────────────────

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function DayCell({
  date, instances, isToday, isPast, isCurrentMonth = true, onClick,
}: {
  date: string;
  instances: TaskInstance[];
  isToday: boolean;
  isPast: boolean;
  isCurrentMonth?: boolean;
  onClick: () => void;
}) {
  const [, m, d] = date.split("-");
  const isWeekend = (() => {
    const dow = new Date(date + "T12:00:00Z").getUTCDay();
    return dow === 0 || dow === 6;
  })();

  const dimmed = isPast && !isToday;
  const outside = !isCurrentMonth;

  return (
    <button
      onClick={onClick}
      className={[
        "text-left rounded-xl p-2 border transition-all min-h-[90px] w-full",
        "hover:border-gray-300 hover:shadow-sm active:scale-[0.98]",
        isToday ? "border-[#C41E3A] bg-red-50/20 shadow-sm" : "",
        !isToday && isWeekend ? "bg-gray-50 border-gray-50" : "",
        !isToday && !isWeekend && dimmed ? "bg-white/60 border-gray-50" : "",
        !isToday && !isWeekend && !dimmed ? "bg-white border-gray-100" : "",
        outside ? "opacity-40" : "",
      ].filter(Boolean).join(" ")}
    >
      <p className={[
        "text-[11px] font-bold mb-1.5 leading-none",
        isToday ? "text-[#C41E3A]" : isWeekend || dimmed ? "text-gray-400" : "text-gray-500",
      ].join(" ")}>
        {m}/{d}
      </p>
      <div className="space-y-1">
        {instances.length === 0 && !isPast && (
          <span className="text-[9px] text-gray-300 italic">No tasks</span>
        )}
        {instances.map((inst) => (
          <TaskChip key={inst.id} inst={inst} />
        ))}
        {instances.length > 0 && instances.every(isQuietTask) && (
          <span className="text-[9px] text-gray-400 italic block">No batch sheets</span>
        )}
      </div>
    </button>
  );
}

// ─── Modals (inline, self-contained) ─────────────────────────────────────────

function SimpleModal({
  title, inst, confirmLabel, confirmClass, requireText, placeholder, onClose, onConfirm,
}: {
  title: string;
  inst: TaskInstance;
  confirmLabel: string;
  confirmClass: string;
  requireText: boolean;
  placeholder: string;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = !requireText || text.trim().length >= 10;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          <span className="font-medium">{inst.ruleTitle}</span>
          {inst.label && inst.label !== inst.ruleTitle && <span> — {inst.label}</span>}
        </p>
        {requireText && (
          <>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Note <span className="text-gray-400 font-normal">(min 10 characters)</span>
            </label>
            <textarea
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={placeholder}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white resize-none focus:outline-none focus:ring-2 focus:ring-[#C41E3A]"
            />
            <p className="text-xs text-gray-400 mt-1">{text.trim().length}/10</p>
          </>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            disabled={!valid || busy}
            onClick={() => { setBusy(true); onConfirm(text.trim()); }}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 ${confirmClass}`}
          >
            {busy ? "Saving…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Dots menu ────────────────────────────────────────────────────────────────

function DotsMenu({ options }: { options: { label: string; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  if (!options.length) return null;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)}
        className="w-10 h-14 flex items-center justify-center rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors shrink-0"
        aria-label="More options">
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-white rounded-xl shadow-lg border border-gray-100 min-w-[160px] overflow-hidden">
          {options.map((opt) => (
            <button key={opt.label}
              onClick={() => { opt.onClick(); setOpen(false); }}
              className={`w-full text-left px-4 py-3 text-sm font-medium transition-colors ${opt.danger ? "text-red-600 hover:bg-red-50" : "text-gray-700 hover:bg-gray-50"}`}>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Day panel task card ──────────────────────────────────────────────────────

type ProductionItem = {product_name: string; base_unit_count: number | null; base_unit_label: string | null; comments: string | null};

function PanelTaskCard({
  inst, today, role, userId, isStartable,
  startingId, actionId, isPending, productionItems,
  onStart, onMarkDone, onMarkMissed, onSkip, onReopen,
}: {
  inst: TaskInstance;
  today: string;
  role: string;
  userId: string;
  isStartable: boolean;
  startingId: string | null;
  actionId: string | null;
  isPending: boolean;
  productionItems?: ProductionItem[];
  onStart: (i: TaskInstance) => void;
  onMarkDone: (i: TaskInstance) => void;
  onMarkMissed: (i: TaskInstance) => void;
  onSkip: (i: TaskInstance) => void;
  onReopen: (i: TaskInstance) => void;
}) {
  const isOverdue = inst.status === "OVERDUE" || inst.status === "MISSED";
  const isDone = inst.status === "DONE";
  const isAdmin = role === "ADMIN";
  const effectiveOwner = inst.ownerUserId ?? inst.ownerId;
  const isOwner = effectiveOwner === userId;
  const isManual = inst.formKey === "manual";
  const isBusy = actionId === inst.id || isPending;
  const days = isOverdue ? daysOverdue(inst.dueDate, today) : 0;

  const batch = inst.formKey === "batch_sheet";
  const batchParsed = batch && inst.label ? parseBatchLabel(inst.label) : null;

  const borderColor = isOverdue ? "border-red-400" : isDone ? "border-green-300" :
    inst.status === "DUE_TODAY" ? "border-amber-400" :
    inst.status === "IN_PROGRESS" ? "border-blue-400" : "border-gray-200";
  const bgColor = isOverdue ? "bg-red-50/40" : isDone ? "bg-green-50/30" :
    inst.status === "DUE_TODAY" ? "bg-amber-50/40" :
    inst.status === "IN_PROGRESS" ? "bg-blue-50/30" : "bg-white";

  const dots: { label: string; onClick: () => void; danger?: boolean }[] = [];
  if (isOverdue && (isAdmin || isOwner)) dots.push({ label: "Mark as missed", onClick: () => onMarkMissed(inst), danger: true });
  if (isAdmin && !["DONE", "SKIPPED"].includes(inst.status)) dots.push({ label: "Skip task", onClick: () => onSkip(inst) });
  if (isAdmin && ["DONE", "MISSED", "SKIPPED"].includes(inst.status)) dots.push({ label: "Reopen", onClick: () => onReopen(inst) });

  return (
    <div className={`rounded-xl border-l-4 ${borderColor} ${bgColor} border border-l-[inherit] border-gray-100 p-4`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {isOverdue && days > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 inline-block mb-1">
              {days} day{days !== 1 ? "s" : ""} overdue
            </span>
          )}
          {batchParsed ? (
            <>
              <p className="text-sm font-bold text-gray-900">{batchParsed.product}</p>
              {batchParsed.qty && <p className="text-xs text-gray-500">{batchParsed.qty} · Due end of day</p>}
              {(() => {
                const prodItem = productionItems?.find(p =>
                  batchParsed.product.toLowerCase().includes(p.product_name.toLowerCase()) ||
                  p.product_name.toLowerCase().includes(batchParsed.product.toLowerCase())
                );
                if (!prodItem) return null;
                const bowlInfo = [prodItem.base_unit_count, prodItem.base_unit_label].filter(Boolean).join(" ");
                return (
                  <p className="text-[11px] text-indigo-600 mt-0.5">
                    {bowlInfo && `${bowlInfo}`}
                    {prodItem.comments && ` · ${prodItem.comments}`}
                  </p>
                );
              })()}
            </>
          ) : (
            <p className="text-sm font-bold text-gray-900">{inst.ruleTitle}</p>
          )}
          {inst.label && inst.label !== inst.ruleTitle && !batchParsed && (
            <p className="text-xs text-gray-500 mt-0.5">{inst.label}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-gray-500">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 text-[10px] font-medium">
              {inst.facilityName}
            </span>
            {isDone && inst.doneAt && (
              <span className="text-green-600">{formatCompletedAt(inst.doneAt)}</span>
            )}
            {inst.completedLate && (inst.daysLate ?? 0) > 0 && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">
                Late {inst.daysLate}d
              </span>
            )}
            {isAdmin && <span>Owner: {inst.ownerName}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isStartable && isManual && (
            <button onClick={() => onMarkDone(inst)} disabled={isBusy}
              className="inline-flex items-center justify-center px-3 min-h-[48px] rounded-xl bg-[#C41E3A] hover:bg-[#a3172f] text-white text-xs font-semibold transition-colors disabled:opacity-50">
              Mark done
            </button>
          )}
          {isStartable && !isManual && (
            <button onClick={() => onStart(inst)} disabled={startingId === inst.id || isPending}
              className="inline-flex items-center justify-center gap-1 px-3 min-h-[48px] rounded-xl bg-[#C41E3A] hover:bg-[#a3172f] text-white text-xs font-semibold transition-colors disabled:opacity-50">
              <Play className="w-3.5 h-3.5" />
              {startingId === inst.id ? "Starting…" : inst.status === "IN_PROGRESS" ? "Continue" : "Start"}
            </button>
          )}
          {isDone && (
            <span className="text-[11px] font-semibold text-green-600 px-2 py-0.5 rounded-full bg-green-100">Done</span>
          )}
          {inst.status === "SKIPPED" && (
            <span className="text-[11px] font-semibold text-gray-500 px-2 py-0.5 rounded-full bg-gray-100">Skipped</span>
          )}
          {inst.status === "MISSED" && (
            <span className="text-[11px] font-semibold text-red-600 px-2 py-0.5 rounded-full bg-red-100">Missed</span>
          )}
          {dots.length > 0 && <DotsMenu options={dots} />}
        </div>
      </div>
    </div>
  );
}

// ─── Day Panel ────────────────────────────────────────────────────────────────

function DayPanel({
  date, instances, today, role, userId,
  productionItems, onClose, onRefresh,
}: {
  date: string;
  instances: TaskInstance[];
  today: string;
  role: string;
  userId: string;
  productionItems?: ProductionItem[];
  onClose: () => void;
  onRefresh: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [startingId, setStartingId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [missedInst, setMissedInst] = useState<TaskInstance | null>(null);
  const [doneInst, setDoneInst] = useState<TaskInstance | null>(null);
  const [skipInst, setSkipInst] = useState<TaskInstance | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const tomorrow = addDaysToDateStr(today, 1);
  const isStartable = (inst: TaskInstance) =>
    date <= tomorrow &&
    ["OVERDUE", "DUE_TODAY", "UPCOMING", "IN_PROGRESS"].includes(inst.status);

  function dispatch() { window.dispatchEvent(new CustomEvent("task-action")); }

  async function handleStart(inst: TaskInstance) {
    setStartingId(inst.id); setErr(null);
    try {
      const res = await fetch(`/api/task-instances/${inst.id}/start`, { method: "POST" });
      if (!res.ok) { setErr("Failed to start task."); return; }
      dispatch(); startTransition(() => router.refresh()); onRefresh();
      const entry = inst.formKey ? TASK_FORM_REGISTRY[inst.formKey] : null;
      if (entry?.href) router.push(`${entry.href(inst.id)}?taskId=${inst.id}`);
    } catch { setErr("Unexpected error."); }
    finally { setStartingId(null); }
  }

  async function doAction(inst: TaskInstance, url: string, body: Record<string, unknown>) {
    setActionId(inst.id);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErr((d as { error?: string }).error ?? "Failed."); return; }
      setMissedInst(null); setDoneInst(null); setSkipInst(null);
      dispatch(); startTransition(() => router.refresh()); onRefresh();
    } finally { setActionId(null); }
  }

  async function handleReopen(inst: TaskInstance) {
    if (!confirm(`Reopen "${inst.ruleTitle}"?`)) return;
    setActionId(inst.id);
    try {
      await fetch(`/api/task-instances/${inst.id}/reopen`, { method: "POST" });
      dispatch(); startTransition(() => router.refresh()); onRefresh();
    } finally { setActionId(null); }
  }

  const [ddd, mon, day, year] = (() => {
    const d = new Date(date + "T12:00:00Z");
    return [
      d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }),
      date.split("-")[1],
      date.split("-")[2],
      date.split("-")[0],
    ];
  })();

  return (
    <>
      {missedInst && (
        <SimpleModal title="Mark as Missed" inst={missedInst} confirmLabel="Mark missed"
          confirmClass="bg-[#C41E3A] hover:bg-[#a3172f]" requireText placeholder="Explain why…"
          onClose={() => setMissedInst(null)}
          onConfirm={(r) => doAction(missedInst, `/api/task-instances/${missedInst.id}/missed`, { reason: r })} />
      )}
      {doneInst && (
        <SimpleModal title="Mark as Done" inst={doneInst} confirmLabel="Mark done"
          confirmClass="bg-[#C41E3A] hover:bg-[#a3172f]" requireText placeholder="Describe what was done…"
          onClose={() => setDoneInst(null)}
          onConfirm={(n) => doAction(doneInst, `/api/task-instances/${doneInst.id}/complete`, { note: n })} />
      )}
      {skipInst && (
        <SimpleModal title="Skip Task" inst={skipInst} confirmLabel="Skip task"
          confirmClass="bg-gray-600 hover:bg-gray-700" requireText placeholder="Explain why…"
          onClose={() => setSkipInst(null)}
          onConfirm={(r) => doAction(skipInst, `/api/task-instances/${skipInst.id}/skip`, { reason: r })} />
      )}

      {/* Panel wrapper — bottom sheet on mobile, side panel on md+ */}
      <div className="fixed inset-0 z-50 flex items-end md:items-stretch md:justify-end pointer-events-none">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/30 pointer-events-auto" onClick={onClose} />

        {/* Panel */}
        <div className="relative pointer-events-auto w-full md:w-96 max-h-[78vh] md:max-h-none md:h-full bg-white rounded-t-2xl md:rounded-none shadow-2xl border-t md:border-t-0 md:border-l border-gray-200 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">{ddd}</p>
              <p className="text-base font-bold text-gray-900">{mon}/{day}/{year}</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {err && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {err} <button onClick={() => setErr(null)} className="ml-2 font-bold">✕</button>
              </div>
            )}
            {instances.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No tasks on this day.</p>
            ) : (
              instances.map((inst) => (
                <PanelTaskCard
                  key={inst.id}
                  inst={inst}
                  today={today}
                  role={role}
                  userId={userId}
                  isStartable={isStartable(inst)}
                  startingId={startingId}
                  actionId={actionId}
                  isPending={isPending}
                  productionItems={productionItems}
                  onStart={handleStart}
                  onMarkDone={(i) => setDoneInst(i)}
                  onMarkMissed={(i) => setMissedInst(i)}
                  onSkip={(i) => setSkipInst(i)}
                  onReopen={handleReopen}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main TaskCalendar ────────────────────────────────────────────────────────

interface TaskCalendarProps {
  initialInstances: TaskInstance[];
  initialWeekStart: string;
  today: string;
  role: string;
  userId: string;
  showMyTasksOnly: boolean;
}

export function TaskCalendar({
  initialInstances,
  initialWeekStart,
  today,
  role,
  userId,
  showMyTasksOnly,
}: TaskCalendarProps) {
  const [view, setView] = useState<"week" | "month">("week");
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [monthStart, setMonthStart] = useState(() => {
    const [y, m] = today.split("-");
    return `${y}-${m}-01`;
  });
  const [instances, setInstances] = useState<TaskInstance[]>(initialInstances);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showWeekend, setShowWeekend] = useState(false);
  const [facilityFilter, setFacilityFilter] = useState<string | null>(null);
  const [outOfSyncNote, setOutOfSyncNote] = useState<"this" | "next" | null>(null);
  const productionDataRef = useRef<Map<string, Array<{product_name: string; base_unit_count: number | null; base_unit_label: string | null; comments: string | null}>>>(new Map());

  // Determine range to fetch for current view
  const currentRange = useCallback((): { from: string; to: string } => {
    if (view === "week") {
      return { from: weekStart, to: addDaysToDateStr(weekStart, 6) };
    } else {
      const { start, end } = getMonthBounds(monthStart);
      return { from: start, to: end };
    }
  }, [view, weekStart, monthStart]);

  // Fetch instances for a date range
  const fetchRange = useCallback(
    async (from: string, to: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          from, to,
          myOnly: showMyTasksOnly || role !== "ADMIN" ? "1" : "0",
        });
        const res = await fetch(`/api/task-instances/range?${params}`);
        if (res.ok) {
          const data: TaskInstance[] = await res.json();
          setInstances(data);
        }
      } finally {
        setLoading(false);
      }
    },
    [showMyTasksOnly, role],
  );

  // Refetch when showMyTasksOnly changes (after initial render)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const { from, to } = currentRange();
    fetchRange(from, to);
  }, [showMyTasksOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigate week
  async function goWeek(delta: number) {
    const next = addDaysToDateStr(weekStart, delta * 7);
    setWeekStart(next);
    window.dispatchEvent(new CustomEvent("calendar-week-changed", { detail: { weekStart: next } }));
    await fetchRange(next, addDaysToDateStr(next, 6));
  }

  // Navigate to today's week
  async function goToday() {
    const mon = getMondayOf(today);
    setWeekStart(mon);
    window.dispatchEvent(new CustomEvent("calendar-week-changed", { detail: { weekStart: mon } }));
    if (view === "week") {
      await fetchRange(mon, addDaysToDateStr(mon, 6));
    } else {
      const [y, m] = today.split("-");
      const ms = `${y}-${m}-01`;
      setMonthStart(ms);
      const { start, end } = getMonthBounds(ms);
      await fetchRange(start, end);
    }
  }

  // Navigate month
  async function goMonth(delta: number) {
    const d = new Date(monthStart + "T12:00:00Z");
    d.setUTCMonth(d.getUTCMonth() + delta);
    const next = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    setMonthStart(next);
    const { start, end } = getMonthBounds(next);
    await fetchRange(start, end);
  }

  // Switch view
  async function switchView(v: "week" | "month") {
    setView(v);
    if (v === "week") {
      const mon = getMondayOf(today);
      setWeekStart(mon);
      window.dispatchEvent(new CustomEvent("calendar-week-changed", { detail: { weekStart: mon } }));
      await fetchRange(mon, addDaysToDateStr(mon, 6));
    } else {
      const [y, m] = today.split("-");
      const ms = `${y}-${m}-01`;
      setMonthStart(ms);
      const { start, end } = getMonthBounds(ms);
      await fetchRange(start, end);
    }
  }

  // Get instances for a specific day
  const dayInstances = (date: string) => {
    let insts = instances.filter((i) => i.dueDate === date);
    if (facilityFilter && role === "ADMIN") {
      insts = facilityFilter === "624"
        ? insts.filter(i => i.facilityName.includes("624"))
        : insts.filter(i => !i.facilityName.includes("624"));
    }
    return insts;
  };

  // Panel refresh — refetch current range
  const handleRefresh = useCallback(() => {
    const { from, to } = currentRange();
    fetchRange(from, to);
  }, [currentRange, fetchRange]);

  // Sync with ProductionScheduleCard via window custom events
  useEffect(() => {
    const handleProductionWeek = (e: Event) => {
      const { week } = (e as CustomEvent<{week: "this" | "next"}>).detail;
      const mon = getMondayOf(today);
      const target = week === "next" ? addDaysToDateStr(mon, 7) : mon;
      setWeekStart(target);
      setView("week");
      setOutOfSyncNote(null);
      fetchRange(target, addDaysToDateStr(target, 6));
    };
    const handleProductionFacility = (e: Event) => {
      if (role !== "ADMIN") return;
      const { tab } = (e as CustomEvent<{tab: string | null}>).detail;
      setFacilityFilter(tab);
    };
    const handleProductionDataLoaded = (e: Event) => {
      const { days } = (e as CustomEvent<{days: Array<{isoDate: string; items: Array<{product_name: string; base_unit_count: number | null; base_unit_label: string | null; comments: string | null}>}>}>).detail;
      days.forEach(({ isoDate, items }) => productionDataRef.current.set(isoDate, items));
    };
    const handleProductionProductClicked = (e: Event) => {
      const { isoDate } = (e as CustomEvent<{isoDate: string}>).detail;
      const mon = getMondayOf(isoDate);
      setWeekStart(mon);
      setView("week");
      setSelectedDay(isoDate);
      fetchRange(mon, addDaysToDateStr(mon, 6));
    };
    window.addEventListener("production-week-changed", handleProductionWeek);
    window.addEventListener("production-facility-changed", handleProductionFacility);
    window.addEventListener("production-data-loaded", handleProductionDataLoaded);
    window.addEventListener("production-product-clicked", handleProductionProductClicked);
    return () => {
      window.removeEventListener("production-week-changed", handleProductionWeek);
      window.removeEventListener("production-facility-changed", handleProductionFacility);
      window.removeEventListener("production-data-loaded", handleProductionDataLoaded);
      window.removeEventListener("production-product-clicked", handleProductionProductClicked);
    };
  }, [today, role, fetchRange]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Week view ──────────────────────────────────────────────────────────────
  const weekDays = getWeekDays(weekStart);
  const isCurrentWeek = weekStart === getMondayOf(today);
  const weekendDaysWithTasks = weekDays.slice(4).filter(d => dayInstances(d).length > 0);
  const showWeekendCols = showWeekend || weekendDaysWithTasks.length > 0;
  const visibleWeekDays = showWeekendCols ? weekDays : weekDays.slice(0, 4);

  // ── Month view ─────────────────────────────────────────────────────────────
  const { days: monthDays } = getMonthBounds(monthStart);
  const isCurrentMonth = monthStart === `${today.slice(0, 7)}-01`;
  const monthHasWeekendTasks = monthDays.some(d => {
    const dow = new Date(d + "T12:00:00Z").getUTCDay();
    return (dow === 0 || dow === 6) && dayInstances(d).length > 0;
  });
  const showMonthWeekend = showWeekend || monthHasWeekendTasks;
  const visibleMonthDays = showMonthWeekend ? monthDays : monthDays.filter(d => {
    const dow = new Date(d + "T12:00:00Z").getUTCDay();
    return dow !== 0 && dow !== 6;
  });
  const visibleDOWLabels = showMonthWeekend ? DOW_LABELS : DOW_LABELS.slice(0, 5);

  return (
    <div>
      {/* Calendar header */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1">
          <button
            onClick={() => view === "week" ? goWeek(-1) : goMonth(-1)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            aria-label="Previous"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-gray-800 min-w-[160px] text-center">
            {view === "week" ? formatWeekRange(weekStart) : formatMonthLabel(monthStart)}
          </span>
          <button
            onClick={() => view === "week" ? goWeek(1) : goMonth(1)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            aria-label="Next"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {!isCurrentWeek && view === "week" && (
            <button onClick={goToday}
              className="ml-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors">
              Today
            </button>
          )}
          {!isCurrentMonth && view === "month" && (
            <button onClick={goToday}
              className="ml-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors">
              Today
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {loading && (
            <span className="text-xs text-gray-400">Loading…</span>
          )}
          {/* Facility filter chip (admin only) */}
          {role === "ADMIN" && facilityFilter && (
            <button
              onClick={() => setFacilityFilter(null)}
              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100 transition-colors"
              title="Clear facility filter"
            >
              {facilityFilter === "624" ? "624" : "Julian Bakery"}
              <X className="w-2.5 h-2.5" />
            </button>
          )}
          {/* Weekend toggle */}
          <button
            onClick={() => setShowWeekend(v => !v)}
            className={`px-2 py-1 text-[10px] font-medium rounded-lg border transition-colors ${
              showWeekend
                ? "bg-[#C41E3A] text-white border-[#C41E3A]"
                : (view === "week" ? showWeekendCols : showMonthWeekend) && !showWeekend
                ? "border-gray-300 text-gray-500 bg-gray-50"
                : "border-gray-200 text-gray-400 hover:bg-gray-50"
            }`}
            title={showWeekend ? "Hide Fri–Sun" : "Show Fri–Sun"}
          >
            {showWeekend ? "Hide Fri–Sun" : "+ Fri–Sun"}
          </button>
          {/* Week/Month toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            <button
              onClick={() => switchView("week")}
              className={`px-3 py-1.5 font-medium transition-colors ${view === "week" ? "bg-[#C41E3A] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              Week
            </button>
            <button
              onClick={() => switchView("month")}
              className={`px-3 py-1.5 font-medium transition-colors ${view === "month" ? "bg-[#C41E3A] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              Month
            </button>
          </div>
        </div>
      </div>

      {/* Out-of-sync note */}
      {outOfSyncNote && view === "week" && (
        <p className="text-[10px] text-gray-400 italic mb-2">
          Production schedule shows {outOfSyncNote} week only
        </p>
      )}

      {/* Week view */}
      {view === "week" && (
        <div className="overflow-x-auto pb-1">
          <div style={{ minWidth: `${visibleWeekDays.length * 80}px` }}>
            {/* Day headers */}
            <div className="gap-1 mb-1" style={{ display: "grid", gridTemplateColumns: `repeat(${visibleWeekDays.length}, minmax(0, 1fr))` }}>
              {visibleWeekDays.map((day) => {
                const i = weekDays.indexOf(day);
                const isToday = day === today;
                const isWeekend = i >= 5;
                return (
                  <div key={day} className={`text-center text-[10px] font-bold uppercase tracking-wide py-1 ${
                    isToday ? "text-[#C41E3A]" : isWeekend ? "text-gray-400" : "text-gray-500"
                  }`}>
                    {DOW_LABELS[i]}
                  </div>
                );
              })}
            </div>
            {/* Day cells */}
            <div className="gap-1" style={{ display: "grid", gridTemplateColumns: `repeat(${visibleWeekDays.length}, minmax(0, 1fr))` }}>
              {visibleWeekDays.map((day) => (
                <DayCell
                  key={day}
                  date={day}
                  instances={dayInstances(day)}
                  isToday={day === today}
                  isPast={day < today}
                  onClick={() => setSelectedDay(selectedDay === day ? null : day)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Month view */}
      {view === "month" && (
        <div className="overflow-x-auto pb-1">
          <div style={{ minWidth: `${(showMonthWeekend ? 7 : 5) * 70}px` }}>
            {/* Day-of-week header */}
            <div className="gap-1 mb-1" style={{ display: "grid", gridTemplateColumns: `repeat(${showMonthWeekend ? 7 : 5}, minmax(0, 1fr))` }}>
              {visibleDOWLabels.map((label) => (
                <div key={label} className="text-center text-[10px] font-bold uppercase tracking-wide py-1 text-gray-400">
                  {label}
                </div>
              ))}
            </div>
            {/* Month grid */}
            <div className="gap-1" style={{ display: "grid", gridTemplateColumns: `repeat(${showMonthWeekend ? 7 : 5}, minmax(0, 1fr))` }}>
              {visibleMonthDays.map((day) => {
                const insts = dayInstances(day);
                const urgent = mostUrgentStatus(insts);
                const isToday = day === today;
                const isPast = day < today;
                const inMonth = day.slice(0, 7) === monthStart.slice(0, 7);
                const [, dm, dd] = day.split("-");
                const isWeekend = (() => {
                  const dow = new Date(day + "T12:00:00Z").getUTCDay();
                  return dow === 0 || dow === 6;
                })();

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(selectedDay === day ? null : day)}
                    className={[
                      "text-center rounded-xl p-1.5 min-h-[64px] border transition-all",
                      "hover:border-gray-300 hover:shadow-sm active:scale-[0.98]",
                      isToday ? "border-[#C41E3A] bg-red-50/20" : "",
                      !isToday && isWeekend ? "bg-gray-50 border-gray-50" : "",
                      !isToday && !isWeekend ? "bg-white border-gray-100" : "",
                      !inMonth ? "opacity-30" : "",
                    ].filter(Boolean).join(" ")}
                  >
                    <p className={[
                      "text-xs font-bold mb-1",
                      isToday ? "text-[#C41E3A]" : (isPast || isWeekend) && inMonth ? "text-gray-400" : "text-gray-500",
                    ].join(" ")}>
                      {dm}/{dd}
                    </p>
                    {/* Dots */}
                    {insts.length > 0 && (
                      <div className="flex justify-center gap-0.5 flex-wrap">
                        {urgent && (
                          <span className={`inline-block w-2 h-2 rounded-full ${dotColor(urgent)}`} />
                        )}
                        {insts.length > 1 && (
                          <span className="text-[9px] text-gray-400 font-medium">{insts.length}</span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Day panel */}
      {selectedDay && (
        <DayPanel
          date={selectedDay}
          instances={dayInstances(selectedDay)}
          today={today}
          role={role}
          userId={userId}
          productionItems={productionDataRef.current.get(selectedDay)}
          onClose={() => setSelectedDay(null)}
          onRefresh={handleRefresh}
        />
      )}
    </div>
  );
}
