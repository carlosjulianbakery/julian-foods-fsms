"use client";

import { useState, useEffect, useCallback } from "react";
import { Link2, X, CheckCircle2, SkipForward } from "lucide-react";
import { formatTaskDate } from "@/lib/tasks";

type AssignedUser = { id: string; name: string };

type TaskInstance = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  assignedTo: AssignedUser[];
  taskType: string;
  formLink: Record<string, unknown> | null;
  dueDate: string;
  status: string;
  completedAt: string | null;
  completedBy: AssignedUser | null;
  skippedAt: string | null;
  skippedBy: AssignedUser | null;
  skipReason: string | null;
  instanceNumber: number;
  template: { id: string; title: string; recurrenceType: string; isActive: boolean } | null;
  history?: HistoryEntry[];
};

type HistoryEntry = {
  id: string;
  action: string;
  performedAt: string;
  note: string | null;
  performedBy: AssignedUser | null;
};

function getCategoryBadge(cat: string): { label: string; className: string } {
  const map: Record<string, { label: string; className: string }> = {
    sanitation: { label: "Sanitation", className: "bg-blue-50 text-blue-700" },
    inspection: { label: "Inspection", className: "bg-purple-50 text-purple-700" },
    production: { label: "Production", className: "bg-amber-50 text-amber-700" },
    receiving_inventory: { label: "Receiving", className: "bg-cyan-50 text-cyan-700" },
    documentation_compliance: { label: "Documentation", className: "bg-indigo-50 text-indigo-700" },
    facility_maintenance: { label: "Maintenance", className: "bg-orange-50 text-orange-700" },
    administrative: { label: "Administrative", className: "bg-gray-100 text-gray-600" },
  };
  return map[cat] ?? { label: cat, className: "bg-gray-100 text-gray-600" };
}

function PriorityDot({ priority }: { priority: string }) {
  const colors: Record<string, string> = { high: "bg-red-500", normal: "bg-gray-400", low: "bg-blue-500" };
  return <span className={`w-2 h-2 rounded-full shrink-0 ${colors[priority] ?? "bg-gray-400"}`} />;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-gray-100 text-gray-600",
    overdue: "bg-red-50 text-red-600",
    complete: "bg-emerald-50 text-emerald-600",
    skipped: "bg-gray-100 text-gray-500",
  };
  const labels: Record<string, string> = { pending: "Pending", overdue: "Overdue", complete: "Complete", skipped: "Skipped" };
  return (
    <span className={`badge ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {labels[status] ?? status}
    </span>
  );
}

function formatHistoryTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function groupInstances(instances: TaskInstance[], userId: string) {
  const now = new Date();
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const overdue: TaskInstance[] = [];
  const today: TaskInstance[] = [];
  const upcoming: TaskInstance[] = [];
  const completedThisWeek: TaskInstance[] = [];
  const skipped: TaskInstance[] = [];

  for (const inst of instances) {
    const dueDateStr = new Date(inst.dueDate).toISOString().split("T")[0];

    if (inst.status === "complete") {
      if (inst.completedAt && new Date(inst.completedAt) >= sevenDaysAgo) {
        completedThisWeek.push(inst);
      }
    } else if (inst.status === "skipped") {
      skipped.push(inst);
    } else if (inst.status === "overdue") {
      overdue.push(inst);
    } else if (inst.status === "pending") {
      if (dueDateStr === todayStr) {
        today.push(inst);
      } else if (dueDateStr > todayStr) {
        upcoming.push(inst);
      }
    }
  }

  return { overdue, today, upcoming, completedThisWeek, skipped };
}

function TaskRow({
  inst,
  userId,
  role,
  onComplete,
  onSkip,
  onOpenDetail,
  showActions,
}: {
  inst: TaskInstance;
  userId: string;
  role: string;
  onComplete: (inst: TaskInstance) => void;
  onSkip: (inst: TaskInstance) => void;
  onOpenDetail: (inst: TaskInstance) => void;
  showActions: boolean;
}) {
  const cat = getCategoryBadge(inst.category);
  const assignedNames = inst.assignedTo.map((u) => u.name).join(", ");
  const isAssigned = inst.assignedTo.some((u) => u.id === userId);
  const canAct = showActions && (role === "ADMIN" || isAssigned);
  const isPending = inst.status === "pending" || inst.status === "overdue";

  return (
    <div className="flex items-center gap-3 py-2.5 px-4 hover:bg-gray-50 transition-colors group">
      <PriorityDot priority={inst.priority} />
      <button
        onClick={() => onOpenDetail(inst)}
        className="flex-1 text-left min-w-0"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-900 truncate">{inst.title}</span>
          <span className={`badge text-[10px] ${cat.className}`}>{cat.label}</span>
          {inst.taskType === "form_linked" && (
            <span title="Linked to form" className="text-gray-400">
              <Link2 className="w-3 h-3" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs text-gray-400">{assignedNames}</span>
          <span className="text-xs font-mono text-gray-400">{formatTaskDate(new Date(inst.dueDate))}</span>
        </div>
      </button>
      <StatusBadge status={inst.status} />
      {canAct && isPending && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onComplete(inst)}
            className="p-1.5 text-gray-400 hover:text-emerald-600 transition-colors"
            title="Complete"
          >
            <CheckCircle2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onSkip(inst)}
            className="p-1.5 text-gray-400 hover:text-amber-600 transition-colors"
            title="Skip"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ label, color, count, collapsible, collapsed, onToggle }: {
  label: string;
  color: string;
  count: number;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 ${collapsible ? "cursor-pointer hover:bg-gray-50" : ""}`}
      onClick={collapsible ? onToggle : undefined}
    >
      <span className={`text-xs font-bold uppercase tracking-wider font-mono ${color}`}>{label}</span>
      <span className={`badge text-[10px] ${color.includes("red") ? "bg-red-100 text-red-600" : color.includes("amber") ? "bg-amber-100 text-amber-600" : color.includes("emerald") ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>
        {count}
      </span>
      {collapsible && (
        <span className="ml-auto text-xs text-gray-400">{collapsed ? "show" : "hide"}</span>
      )}
    </div>
  );
}

type Props = { role: string; userId: string };

export function TasksViewClient({ role, userId }: Props) {
  const [tab, setTab] = useState<"my" | "all">("my");
  const [instances, setInstances] = useState<TaskInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [collapsedComplete, setCollapsedComplete] = useState(true);
  const [collapsedSkipped, setCollapsedSkipped] = useState(true);

  const [completeModal, setCompleteModal] = useState<TaskInstance | null>(null);
  const [skipModal, setSkipModal] = useState<TaskInstance | null>(null);
  const [detailModal, setDetailModal] = useState<TaskInstance | null>(null);
  const [detailData, setDetailData] = useState<TaskInstance | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [completeNote, setCompleteNote] = useState("");
  const [skipReason, setSkipReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState("");

  const fetchInstances = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const url = tab === "my"
        ? "/api/tasks/instances?my_tasks=true"
        : "/api/tasks/instances";
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      setInstances(await res.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { fetchInstances(); }, [fetchInstances]);

  // Re-fetch when admin returns to this tab after editing tasks elsewhere
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") fetchInstances();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchInstances]);

  async function openDetail(inst: TaskInstance) {
    setDetailModal(inst);
    setDetailData(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/tasks/instances/${inst.id}`);
      if (!res.ok) throw new Error();
      setDetailData(await res.json());
    } catch {
      setDetailData(inst);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleComplete() {
    if (!completeModal) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/tasks/instances/${completeModal.id}/complete`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: completeNote || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const nextDue = data.nextDue ? formatTaskDate(new Date(data.nextDue)) : null;
      setToast(nextDue ? `Task completed. Next occurrence due ${nextDue}.` : "Task marked as complete.");
      setCompleteModal(null);
      setCompleteNote("");
      setTimeout(() => setToast(""), 4000);
      fetchInstances();
    } catch (err: any) {
      alert(err.message ?? "Failed to complete task.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSkip() {
    if (!skipModal || !skipReason.trim()) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/tasks/instances/${skipModal.id}/skip`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: skipReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setToast("Task skipped.");
      setSkipModal(null);
      setSkipReason("");
      setTimeout(() => setToast(""), 4000);
      fetchInstances();
    } catch (err: any) {
      alert(err.message ?? "Failed to skip task.");
    } finally {
      setActionLoading(false);
    }
  }

  const grouped = groupInstances(instances, userId);
  const showActions = true;

  function canActOnInstance(inst: TaskInstance) {
    const isAssigned = inst.assignedTo.some((u) => u.id === userId);
    return role === "ADMIN" || (tab === "my" ? isAssigned : isAssigned);
  }

  return (
    <>
      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-4">
        {(["my", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t
                ? "border-[#D64D4D] text-[#D64D4D]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "my" ? "My Tasks" : "All Tasks"}
          </button>
        ))}
      </div>

      {loading && (
        <div className="card p-6 space-y-3">
          {[1,2,3].map((i) => <div key={i} className="h-12 bg-gray-100 animate-pulse rounded-lg" />)}
        </div>
      )}

      {!loading && error && (
        <div className="card p-8 text-center text-sm text-gray-500">
          Failed to load tasks. <button onClick={fetchInstances} className="text-[#D64D4D] hover:underline">Retry</button>
        </div>
      )}

      {!loading && !error && (
        <div className="card overflow-hidden">
          {grouped.overdue.length === 0 && grouped.today.length === 0 && grouped.upcoming.length === 0 && grouped.completedThisWeek.length === 0 && grouped.skipped.length === 0 && (
            <div className="p-10 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No tasks found.</p>
            </div>
          )}

          {grouped.overdue.length > 0 && (
            <div className="border-b border-gray-100">
              <SectionHeader label="Overdue" color="text-red-600" count={grouped.overdue.length} />
              <div className="divide-y divide-gray-50">
                {grouped.overdue.map((inst) => (
                  <TaskRow key={inst.id} inst={inst} userId={userId} role={role}
                    onComplete={setCompleteModal} onSkip={setSkipModal} onOpenDetail={openDetail}
                    showActions={canActOnInstance(inst)}
                  />
                ))}
              </div>
            </div>
          )}

          {grouped.today.length > 0 && (
            <div className="border-b border-gray-100">
              <SectionHeader label="Today" color="text-amber-600" count={grouped.today.length} />
              <div className="divide-y divide-gray-50">
                {grouped.today.map((inst) => (
                  <TaskRow key={inst.id} inst={inst} userId={userId} role={role}
                    onComplete={setCompleteModal} onSkip={setSkipModal} onOpenDetail={openDetail}
                    showActions={canActOnInstance(inst)}
                  />
                ))}
              </div>
            </div>
          )}

          {grouped.upcoming.length > 0 && (
            <div className="border-b border-gray-100">
              <SectionHeader label="Upcoming" color="text-gray-500" count={grouped.upcoming.length} />
              <div className="divide-y divide-gray-50">
                {grouped.upcoming.map((inst) => (
                  <TaskRow key={inst.id} inst={inst} userId={userId} role={role}
                    onComplete={setCompleteModal} onSkip={setSkipModal} onOpenDetail={openDetail}
                    showActions={canActOnInstance(inst)}
                  />
                ))}
              </div>
            </div>
          )}

          {grouped.completedThisWeek.length > 0 && (
            <div className="border-b border-gray-100">
              <SectionHeader
                label="Completed This Week"
                color="text-emerald-600"
                count={grouped.completedThisWeek.length}
                collapsible
                collapsed={collapsedComplete}
                onToggle={() => setCollapsedComplete(!collapsedComplete)}
              />
              {!collapsedComplete && (
                <div className="divide-y divide-gray-50">
                  {grouped.completedThisWeek.map((inst) => (
                    <TaskRow key={inst.id} inst={inst} userId={userId} role={role}
                      onComplete={setCompleteModal} onSkip={setSkipModal} onOpenDetail={openDetail}
                      showActions={false}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {grouped.skipped.length > 0 && (
            <div>
              <SectionHeader
                label="Skipped"
                color="text-gray-500"
                count={grouped.skipped.length}
                collapsible
                collapsed={collapsedSkipped}
                onToggle={() => setCollapsedSkipped(!collapsedSkipped)}
              />
              {!collapsedSkipped && (
                <div className="divide-y divide-gray-50">
                  {grouped.skipped.map((inst) => (
                    <TaskRow key={inst.id} inst={inst} userId={userId} role={role}
                      onComplete={setCompleteModal} onSkip={setSkipModal} onOpenDetail={openDetail}
                      showActions={false}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Complete Modal */}
      {completeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Mark as Complete</h2>
              <button onClick={() => { setCompleteModal(null); setCompleteNote(""); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-gray-600">{completeModal.title}</p>
            <div>
              <label className="label">Note (optional)</label>
              <textarea
                className="input resize-none"
                rows={3}
                value={completeNote}
                onChange={(e) => setCompleteNote(e.target.value)}
                placeholder="Any notes about completing this task…"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleComplete}
                disabled={actionLoading}
                className="btn-primary"
              >
                {actionLoading ? "Saving…" : "Confirm Complete"}
              </button>
              <button onClick={() => { setCompleteModal(null); setCompleteNote(""); }} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Skip Modal */}
      {skipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Skip This Occurrence</h2>
              <button onClick={() => { setSkipModal(null); setSkipReason(""); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-gray-600">{skipModal.title}</p>
            <div>
              <label className="label">Reason <span className="text-red-500">*</span></label>
              <textarea
                className="input resize-none"
                rows={3}
                value={skipReason}
                onChange={(e) => setSkipReason(e.target.value)}
                placeholder="Explain why this task is being skipped…"
                required
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleSkip}
                disabled={actionLoading || !skipReason.trim()}
                className="btn-primary disabled:opacity-40"
              >
                {actionLoading ? "Saving…" : "Confirm Skip"}
              </button>
              <button onClick={() => { setSkipModal(null); setSkipReason(""); }} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">{detailModal.title}</h2>
                <div className="flex items-center gap-2 mt-1">
                  {(() => {
                    const cat = getCategoryBadge(detailModal.category);
                    return <span className={`badge text-[10px] ${cat.className}`}>{cat.label}</span>;
                  })()}
                  <StatusBadge status={detailModal.status} />
                </div>
              </div>
              <button onClick={() => { setDetailModal(null); setDetailData(null); }} className="text-gray-400 hover:text-gray-600 mt-0.5">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {detailLoading ? (
                <div className="space-y-2">
                  {[1,2,3].map((i) => <div key={i} className="h-4 bg-gray-100 animate-pulse rounded" />)}
                </div>
              ) : (
                <>
                  {(detailData ?? detailModal).description && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Description</p>
                      <p className="text-sm text-gray-700">{(detailData ?? detailModal).description}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Priority</p>
                      <div className="flex items-center gap-1.5">
                        <PriorityDot priority={(detailData ?? detailModal).priority} />
                        <span className="text-sm text-gray-700 capitalize">{(detailData ?? detailModal).priority}</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Due Date</p>
                      <p className="text-sm text-gray-700">{formatTaskDate(new Date((detailData ?? detailModal).dueDate))}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Assigned To</p>
                      <p className="text-sm text-gray-700">{(detailData ?? detailModal).assignedTo.map((u) => u.name).join(", ") || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Task Type</p>
                      <p className="text-sm text-gray-700 capitalize">{(detailData ?? detailModal).taskType.replace("_", " ")}</p>
                    </div>
                    {(detailData ?? detailModal).template && (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Recurrence</p>
                        <p className="text-sm text-gray-700 capitalize">{(detailData ?? detailModal).template!.recurrenceType.replace(/_/g, " ")}</p>
                      </div>
                    )}
                  </div>

                  {(detailData ?? detailModal).taskType === "form_linked" && (detailData ?? detailModal).formLink && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Linked Form</p>
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <Link2 className="w-3.5 h-3.5 text-gray-400" />
                        <span className="capitalize">{String((detailData ?? detailModal).formLink?.form_type).replace(/_/g, " ")}</span>
                      </div>
                    </div>
                  )}

                  {canActOnInstance(detailData ?? detailModal) && ((detailData ?? detailModal).status === "pending" || (detailData ?? detailModal).status === "overdue") && (
                    <div className="flex gap-2 pt-2 border-t border-gray-100">
                      <button
                        onClick={() => { setDetailModal(null); setDetailData(null); setCompleteModal(detailData ?? detailModal); }}
                        className="btn-primary text-sm"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Complete
                      </button>
                      <button
                        onClick={() => { setDetailModal(null); setDetailData(null); setSkipModal(detailData ?? detailModal); }}
                        className="btn-secondary text-sm"
                      >
                        <SkipForward className="w-3.5 h-3.5" /> Skip
                      </button>
                    </div>
                  )}

                  {detailData && (
                    <div className="pt-3 border-t border-gray-100">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">History</p>
                      {!detailData.history || detailData.history.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No history yet.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {detailData.history.map((h) => {
                            const actionLabel: Record<string, string> = {
                              created: "Task created",
                              completed: "Marked complete",
                              skipped: "Skipped",
                              overdue: "Marked overdue by system",
                              next_instance_generated: "Next occurrence generated",
                            };
                            const label = actionLabel[h.action] ?? h.action.replace(/_/g, " ");
                            const bySystem = !h.performedBy;
                            return (
                              <div key={h.id} className="text-xs py-1 border-b border-gray-50 last:border-0">
                                <span>
                                  <span className="font-mono text-gray-400">{formatHistoryTime(h.performedAt)}</span>
                                  {" — "}
                                  <span className="text-gray-700 font-medium">{label}</span>
                                  {" by "}
                                  {bySystem
                                    ? <span className="text-gray-400 italic">System</span>
                                    : <span className="text-gray-700">{h.performedBy!.name}</span>
                                  }
                                </span>
                                {h.note && (
                                  <p className="mt-0.5 ml-4 text-gray-400 italic">
                                    {h.action === "skipped" ? "Reason: " : "Note: "}{h.note}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-5 py-3 rounded-full shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}
