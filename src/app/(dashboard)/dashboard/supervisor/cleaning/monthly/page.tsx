"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import {
  CheckCircle2, ChevronDown, ChevronUp, CalendarCheck,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CleaningItem, CleaningArea, DraftProgress } from "@/lib/monthly-cleaning-items";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function todayPacific(): string {
  return new Date().toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

function lastDayOfMonth(monthKey: string): number {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatSubmittedAt(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface DraftData {
  id: string;
  monthKey: string;
  monthLabel: string;
  status: string;
  submittedAt: string | null;
  submittedBy: string | null;
  items: CleaningItem[];
  lastEditedBy: string | null;
  lastEditedAt: string | null;
  progress: DraftProgress;
}

interface HistoryRecord {
  id: string;
  monthKey: string;
  monthLabel: string;
  status: string;
  progress: DraftProgress;
}

// ─── Mini progress bar ────────────────────────────────────────────────────────

function MiniBar({ checked, total, label }: { checked: number; total: number; label: string }) {
  const pct = total === 0 ? 0 : Math.round((checked / total) * 100);
  const all = checked === total && total > 0;
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-24 text-gray-500 shrink-0">{label}:</span>
      <span className={cn("font-mono font-semibold w-10 shrink-0", all ? "text-emerald-600" : "text-gray-600")}>
        {checked}/{total}
      </span>
      <div className="flex-1 bg-gray-200 rounded-full h-1.5 overflow-hidden min-w-[80px]">
        <div
          className={cn("h-full rounded-full transition-all", all ? "bg-emerald-500" : pct > 0 ? "bg-amber-400" : "bg-gray-300")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn("w-8 text-right font-mono shrink-0", all ? "text-emerald-600" : "text-gray-400")}>
        {pct}%{all && " ✓"}
      </span>
    </div>
  );
}

// ─── Item Row ─────────────────────────────────────────────────────────────────

interface ItemRowProps {
  item: CleaningItem;
  readOnly: boolean;
  userInitials: string;
  onChange: (updated: CleaningItem) => void;
}

function ItemRow({ item, readOnly, userInitials, onChange }: ItemRowProps) {
  const [confirmUncheck, setConfirmUncheck] = useState(false);

  function handleCheck() {
    if (readOnly) return;
    if (item.checked) {
      setConfirmUncheck(true);
    } else {
      onChange({
        ...item,
        checked: true,
        checkedBy: userInitials,
        checkedDate: todayPacific(),
      });
    }
  }

  function doUncheck() {
    onChange({ ...item, checked: false, checkedBy: null, checkedDate: null });
    setConfirmUncheck(false);
  }

  return (
    <div className={cn("border-b border-gray-100 last:border-0 transition-colors px-4 py-3", item.checked ? "bg-emerald-50/40" : "")}>
      {confirmUncheck && (
        <div className="mb-2 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="flex-1 text-amber-800 text-xs">
            Uncheck &ldquo;{item.itemName}&rdquo;? This will clear the sign-off.
          </span>
          <button onClick={doUncheck} className="px-2 py-1 text-xs font-semibold rounded bg-amber-600 text-white hover:bg-amber-700">
            Confirm
          </button>
          <button onClick={() => setConfirmUncheck(false)} className="px-2 py-1 text-xs font-semibold rounded bg-gray-200 text-gray-700 hover:bg-gray-300">
            Cancel
          </button>
        </div>
      )}

      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={handleCheck}
          disabled={readOnly}
          className={cn(
            "w-7 h-7 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all",
            item.checked
              ? "bg-emerald-500 border-emerald-500"
              : readOnly
              ? "bg-gray-100 border-gray-200 cursor-not-allowed"
              : "bg-white border-gray-300 hover:border-emerald-400"
          )}
        >
          {item.checked && <CheckCircle2 className="w-4 h-4 text-white" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("text-sm leading-snug", item.checked ? "text-emerald-800 font-medium" : "text-gray-700")}>
              {item.itemName}
            </span>
            {item.checked && !readOnly && (
              <button
                onClick={() => setConfirmUncheck(true)}
                className="text-xs text-gray-400 hover:text-gray-600 underline"
              >
                undo
              </button>
            )}
          </div>

          {item.checked && (
            <div className="mt-1.5 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-gray-500">By:</label>
                {readOnly ? (
                  <span className="text-xs font-mono font-semibold text-gray-700">{item.checkedBy ?? "—"}</span>
                ) : (
                  <input
                    type="text"
                    maxLength={4}
                    value={item.checkedBy ?? ""}
                    onChange={(e) => onChange({ ...item, checkedBy: e.target.value.toUpperCase() })}
                    className="w-12 text-xs border border-gray-300 rounded px-1.5 py-0.5 font-mono font-semibold text-gray-700 focus:outline-none focus:border-amber-400"
                  />
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-gray-500">Date:</label>
                {readOnly ? (
                  <span className="text-xs font-mono text-gray-700">{item.checkedDate ?? "—"}</span>
                ) : (
                  <input
                    type="text"
                    value={item.checkedDate ?? ""}
                    onChange={(e) => onChange({ ...item, checkedDate: e.target.value })}
                    placeholder="MM/DD/YYYY"
                    className="w-28 text-xs border border-gray-300 rounded px-1.5 py-0.5 font-mono text-gray-700 focus:outline-none focus:border-amber-400"
                  />
                )}
              </div>
            </div>
          )}

          <div className="mt-1.5">
            {readOnly ? (
              item.notes ? (
                <p className="text-xs text-gray-500 italic">{item.notes}</p>
              ) : null
            ) : (
              <input
                type="text"
                value={item.notes ?? ""}
                onChange={(e) => onChange({ ...item, notes: e.target.value || null })}
                placeholder="Optional notes..."
                className="w-full text-xs border border-gray-200 rounded px-2 py-1 text-gray-600 focus:outline-none focus:border-amber-400 placeholder-gray-300"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────

interface SectionCardProps {
  area: CleaningArea;
  label: string;
  items: CleaningItem[];
  readOnly: boolean;
  userInitials: string;
  onItemChange: (idx: number, updated: CleaningItem) => void;
}

function SectionCard({ area, label, items, readOnly, userInitials, onItemChange }: SectionCardProps) {
  const checked = items.filter((i) => i.checked).length;
  const total = items.length;
  const allDone = checked === total && total > 0;
  const [open, setOpen] = useState(!allDone);

  // Auto-collapse when section reaches 100%
  useEffect(() => {
    if (allDone) setOpen(false);
  }, [allDone]);

  const pct = total === 0 ? 0 : Math.round((checked / total) * 100);

  const sectionBadge =
    checked === 0 ? (
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-mono">Not started</span>
    ) : allDone ? (
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-mono">Complete ✓</span>
    ) : (
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-mono">In Progress</span>
    );

  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left border-b border-gray-100"
      >
        <span className={cn("flex-1 text-sm font-semibold font-mono", allDone ? "text-emerald-700" : "text-gray-700")}>
          {label}
        </span>
        <span className="text-xs text-gray-500 font-mono shrink-0">{checked}/{total} items</span>
        <div className="w-20 bg-gray-200 rounded-full h-1.5 overflow-hidden shrink-0">
          <div
            className={cn("h-full rounded-full transition-all", allDone ? "bg-emerald-500" : pct > 0 ? "bg-amber-400" : "bg-gray-300")}
            style={{ width: `${pct}%` }}
          />
        </div>
        {sectionBadge}
        {open ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
      </button>
      {open && (
        <div>
          {items.map((item, idx) => (
            <ItemRow
              key={`${area}-${idx}`}
              item={item}
              readOnly={readOnly}
              userInitials={userInitials}
              onChange={(updated) => onItemChange(idx, updated)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MonthlyCleaningPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string })?.role === "ADMIN";
  const userName = session?.user?.name ?? "";
  const userInitials = getInitials(userName);

  const [draft, setDraft] = useState<DraftData | null>(null);
  const [items, setItems] = useState<CleaningItem[]>([]);
  const [progress, setProgress] = useState<DraftProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1); // -1 = current month
  const [viewingDraft, setViewingDraft] = useState<DraftData | null>(null); // when viewing history
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const saveTimer = useRef<NodeJS.Timeout | null>(null);
  const currentDraftId = useRef<string | null>(null);

  // Load current month
  useEffect(() => {
    fetch("/api/forms/monthly-cleaning/current")
      .then((r) => r.json())
      .then((data: DraftData) => {
        setDraft(data);
        setItems(data.items);
        setProgress(data.progress);
        currentDraftId.current = data.id;
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Load history for month selector
    fetch("/api/forms/monthly-cleaning/history")
      .then((r) => r.json())
      .then((data: HistoryRecord[]) => setHistory(data))
      .catch(() => {});
  }, []);

  // Auto-save
  const scheduleSave = useCallback(
    (updatedItems: CleaningItem[], delay = 1000) => {
      if (!currentDraftId.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        setSaveStatus("saving");
        try {
          const res = await fetch(`/api/forms/monthly-cleaning/${currentDraftId.current}/items`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: updatedItems }),
          });
          if (!res.ok) throw new Error("save failed");
          const data = await res.json();
          setProgress(data.progress);
          setDraft((prev) =>
            prev ? { ...prev, lastEditedAt: new Date().toISOString(), lastEditedBy: (session?.user as { id?: string })?.id ?? null } : prev
          );
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 2000);
        } catch {
          setSaveStatus("error");
        }
      }, delay);
    },
    [session]
  );

  function updateItem(area: CleaningArea, idx: number, updated: CleaningItem) {
    if (draft?.status !== "draft") return;
    setItems((prev) => {
      const areaItems = prev.filter((i) => i.area === area);
      const areaItemsNew = areaItems.map((it, i) => (i === idx ? updated : it));
      const newItems = prev.map((it) => (it.area === area ? areaItemsNew.shift()! : it));
      scheduleSave(newItems, updated.notes !== null ? 2000 : 1000);
      return newItems;
    });
  }

  // View history month
  async function viewMonth(mk: string) {
    const idx = history.findIndex((h) => h.monthKey === mk);
    setHistoryIdx(idx);
    try {
      const res = await fetch(`/api/forms/monthly-cleaning/${mk}`);
      const data: DraftData = await res.json();
      setViewingDraft(data);
    } catch {
      setViewingDraft(null);
    }
  }

  function goToCurrent() {
    setHistoryIdx(-1);
    setViewingDraft(null);
  }

  // Manual submit
  async function handleSubmit() {
    if (!draft) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/forms/monthly-cleaning/${draft.id}/submit`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setDraft((prev) => prev ? { ...prev, status: "submitted", submittedAt: data.submittedAt, submittedBy: "user" } : prev);
      setShowSubmitModal(false);
    } catch {
      alert("Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Derived ──
  const activeDraft = historyIdx === -1 ? draft : viewingDraft;
  const activeItems = historyIdx === -1 ? items : (viewingDraft?.items ?? []);
  const activeProgress = historyIdx === -1 ? progress : viewingDraft?.progress;
  const readOnly = activeDraft?.status !== "draft" || historyIdx !== -1;

  const productionItems = activeItems.filter((i) => i.area === "production");
  const shippingItems = activeItems.filter((i) => i.area === "shipping");
  const officeItems = activeItems.filter((i) => i.area === "office");

  if (loading) {
    return (
      <div className="max-w-2xl space-y-4">
        <div className="page-header">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#C41E3A] rounded-md flex items-center justify-center">
              <CalendarCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="page-title">Monthly Cleaning</h1>
              <p className="page-subtitle">Loading…</p>
            </div>
          </div>
        </div>
        <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!activeDraft) {
    return (
      <div className="page-header">
        <h1 className="page-title">Monthly Cleaning</h1>
        <p className="text-red-600 text-sm mt-2">Failed to load form.</p>
      </div>
    );
  }

  const isSubmitted = activeDraft.status === "submitted" || activeDraft.status === "auto-submitted";
  const isAutoSubmit = activeDraft.submittedBy === "auto";

  return (
    <div className="max-w-2xl space-y-5">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 bg-[#C41E3A] rounded-md flex items-center justify-center shrink-0">
            <CalendarCheck className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="page-title leading-tight">Monthly Cleaning</h1>
            <p className="page-subtitle">{activeDraft.monthLabel}</p>
            {draft?.lastEditedAt && historyIdx === -1 && (
              <p className="text-xs text-gray-400 mt-0.5">
                Last saved: {relativeTime(draft.lastEditedAt)}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          {activeDraft.status === "draft" ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
              Draft — auto-submits {activeDraft.monthLabel.split(" ")[0]} {lastDayOfMonth(activeDraft.monthKey)}
            </span>
          ) : isAutoSubmit ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
              Auto-submitted {activeDraft.submittedAt ? formatSubmittedAt(activeDraft.submittedAt) : ""}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
              Submitted {activeDraft.submittedAt ? formatSubmittedAt(activeDraft.submittedAt) : ""}
            </span>
          )}

          {/* Save status */}
          {historyIdx === -1 && (
            <span className={cn(
              "text-xs font-mono transition-opacity",
              saveStatus === "idle" ? "opacity-0" : "opacity-100",
              saveStatus === "error" ? "text-red-500" : "text-gray-400"
            )}>
              {saveStatus === "saving" && "Saving…"}
              {saveStatus === "saved" && "Saved ✓"}
              {saveStatus === "error" && "Save failed"}
            </span>
          )}
        </div>
      </div>

      {/* Month selector */}
      {history.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {history.map((h, i) => (
            <button
              key={h.monthKey}
              onClick={() => viewMonth(h.monthKey)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors border",
                historyIdx === i
                  ? "bg-[#C41E3A] text-white border-[#C41E3A]"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              )}
            >
              {h.monthLabel}
            </button>
          ))}
          <button
            onClick={goToCurrent}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors border",
              historyIdx === -1
                ? "bg-[#C41E3A] text-white border-[#C41E3A]"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            )}
          >
            {draft?.monthLabel} (current)
          </button>
        </div>
      )}

      {/* Submitted banner */}
      {isSubmitted && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600">
          {isAutoSubmit
            ? "This form was automatically submitted at month end."
            : `This form was submitted on ${activeDraft.submittedAt ? formatSubmittedAt(activeDraft.submittedAt) : ""} and is now read-only.`}
        </div>
      )}

      {/* Progress */}
      {activeProgress && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">
              {activeProgress.overall.checked} of {activeProgress.overall.total} items completed
            </span>
            <span className={cn(
              "text-sm font-mono font-bold",
              activeProgress.overall.checked === activeProgress.overall.total && activeProgress.overall.total > 0
                ? "text-emerald-600"
                : "text-gray-500"
            )}>
              {activeProgress.overall.total === 0
                ? "0%"
                : `${Math.round((activeProgress.overall.checked / activeProgress.overall.total) * 100)}%`}
            </span>
          </div>
          <div className="bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                activeProgress.overall.checked === activeProgress.overall.total && activeProgress.overall.total > 0
                  ? "bg-emerald-500"
                  : "bg-amber-400"
              )}
              style={{
                width: `${activeProgress.overall.total === 0 ? 0 : Math.round((activeProgress.overall.checked / activeProgress.overall.total) * 100)}%`,
              }}
            />
          </div>
          <div className="space-y-1 pt-1">
            <MiniBar label="Production" checked={activeProgress.production.checked} total={activeProgress.production.total} />
            <MiniBar label="Shipping" checked={activeProgress.shipping.checked} total={activeProgress.shipping.total} />
            <MiniBar label="Office" checked={activeProgress.office.checked} total={activeProgress.office.total} />
          </div>
        </div>
      )}

      {/* Section cards */}
      {(
        [
          { area: "production" as CleaningArea, label: "Production Area", areaItems: productionItems },
          { area: "shipping" as CleaningArea, label: "Shipping Area", areaItems: shippingItems },
          { area: "office" as CleaningArea, label: "Office Area", areaItems: officeItems },
        ] as { area: CleaningArea; label: string; areaItems: CleaningItem[] }[]
      ).map(({ area, label, areaItems }) => (
        <SectionCard
          key={area}
          area={area}
          label={label}
          items={areaItems}
          readOnly={readOnly}
          userInitials={userInitials}
          onItemChange={(idx, updated) => updateItem(area, idx, updated)}
        />
      ))}

      {/* Admin submit button */}
      {isAdmin && historyIdx === -1 && activeDraft.status === "draft" && (
        <div className="pt-2">
          <button
            onClick={() => setShowSubmitModal(true)}
            className="w-full py-3 px-6 rounded-xl font-semibold text-sm text-white bg-[#C41E3A] hover:bg-[#A01830] transition-colors"
          >
            Submit Monthly Cleaning Form
          </button>
        </div>
      )}

      {/* Submit modal */}
      {showSubmitModal && draft && progress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm mx-4 space-y-4">
            <h2 className="text-base font-bold text-gray-900">Submit Monthly Cleaning Form?</h2>
            <p className="text-sm text-gray-600">
              Submit the Monthly Cleaning form for <strong>{draft.monthLabel}</strong>?
            </p>
            <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm space-y-1">
              <p className="font-semibold text-gray-700">
                Progress: {progress.overall.checked} of {progress.overall.total} items completed
              </p>
              {progress.overall.total - progress.overall.checked > 0 && (
                <p className="text-amber-700 text-xs">
                  {progress.overall.total - progress.overall.checked} items are still unchecked. Submitting now will record them as not completed this month.
                </p>
              )}
            </div>
            <p className="text-xs text-red-600 font-semibold">This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-2 rounded-lg bg-[#C41E3A] text-white font-semibold text-sm hover:bg-[#A01830] disabled:opacity-60"
              >
                {submitting ? "Submitting…" : "Submit"}
              </button>
              <button
                onClick={() => setShowSubmitModal(false)}
                className="flex-1 py-2 rounded-lg bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
