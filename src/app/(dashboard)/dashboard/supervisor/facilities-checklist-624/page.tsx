"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Building2, Info } from "lucide-react";
import { FacilitiesChecklistForm624 } from "@/components/forms624/FacilitiesChecklistForm624";
import { ChecklistEditor624 } from "@/components/forms624/ChecklistEditor624";
import { FacilitiesSubmittedView624 } from "@/components/forms624/FacilitiesSubmittedNotice624";
import { deriveInitials } from "@/components/forms624/initialsHelper";
import { exportFormPdf } from "@/components/forms624/pdfExport624";
import { buildFacilitiesPdfHtml624 } from "@/components/forms624/pdfBuilders624";
import { navigateAfterSubmit } from "@/lib/afterSubmit";
import { useMarkInProgress } from "@/hooks/useMarkInProgress";
import {
  FACILITIES_FACILITY, FACILITIES_FORM_KEY, buildSnapshot, periodDates, periodLabel, progressOf, resultOf, retireQuestion, splitStored, submitProblems,
  valuesForLiveList, type ChecklistItem, type ItemValues,
} from "@/lib/facilities-checklist-624";

interface RecordRow {
  id: string; period: string; periodEnd: string; status: string; conductedBy: string; initials: string; items: unknown;
  listVersion: number; okCount: number; failCount: number; notes: string | null; submittedAt: string | null; updatedAt: string;
}
interface WeekTask { id: string; dueDate: string }
type Loaded = { record: RecordRow; items: ChecklistItem[]; listVersion: number; task?: WeekTask | null; isCurrentWeek?: boolean; error?: string };

function nowPT(): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

const RECORDS = "/dashboard/supervisor/facilities-checklist-624/records";

export default function FacilitiesChecklist624Page() {
  const { data: session } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  /** The task whose Start button opened the form: the form opens THAT task's week, also when it is overdue. */
  const urlTaskId = params?.get("taskId") ?? null;
  const urlPeriod = params?.get("period") ?? null;

  const [record, setRecord] = useState<RecordRow | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [values, setValues] = useState<Record<string, ItemValues>>({});
  const [initials, setInitials] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [task, setTask] = useState<WeekTask | null>(null);
  const [isCurrentWeek, setIsCurrentWeek] = useState(true);
  const [loadError, setLoadError] = useState("");
  /** This week's record when it is already submitted: there is no form to fill in. */
  const [closed, setClosed] = useState<RecordRow | null>(null);
  const [saveText, setSaveText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState("");

  // The week's task is due on a Thursday, not on the week's last day: the server tells us which task and its due date
  const markInProgress = useMarkInProgress({ taskId: task && urlTaskId === task.id ? urlTaskId : null, formKey: FACILITIES_FORM_KEY, facilityName: FACILITIES_FACILITY, dueDate: task?.dueDate ?? null });

  const updatedAtRef = useRef<string | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ values, initials, date, time });
  latest.current = { values, initials, date, time };

  const apply = useCallback((data: Loaded, sessionInitials: string) => {
    const stored = splitStored(data.record.items);
    const now = nowPT();
    setRecord(data.record);
    setItems(data.items);
    setValues(valuesForLiveList(data.items, stored.entries));
    setInitials(data.record.initials || sessionInitials);
    setDate(stored.header?.date ?? now.date);
    setTime(stored.header?.time ?? now.time);
    updatedAtRef.current = data.record.updatedAt;
  }, []);

  // Open (or create) the draft: the week of the task it was opened from, else the current Pacific week
  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/facilities-checklist-624", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: urlTaskId, ...(urlPeriod ? { period: urlPeriod } : {}) }) })
      .then((r) => r.json())
      .then((data: Loaded) => {
        if (data.error || !data.record) { setLoadError(data.error ?? "Could not load the form."); return; }
        // Already submitted: say so here (who, when, when the next one opens) instead of bouncing to Records
        if (data.record.status !== "draft") { setClosed(data.record); return; }
        setTask(data.task ?? null);
        setIsCurrentWeek(data.isCurrentWeek !== false);
        apply(data, deriveInitials(session.user.name, session.user.email));
      })
      .catch(() => setLoadError("Could not load the form. Try refreshing."));
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(async () => {
    if (!record) return;
    setSaveText("Saving…");
    try {
      const { values: v, initials: ini, date: d, time: t } = latest.current;
      const res = await fetch(`/api/facilities-checklist-624/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: Object.values(v), initials: ini, date: d, time: t, expectedUpdatedAt: updatedAtRef.current }),
      });
      const data = (await res.json().catch(() => ({}))) as { updatedAt?: string; code?: string; record?: RecordRow; error?: string };
      if (res.status === 409 && data.code === "conflict" && data.record) {
        // Someone else saved meanwhile: take the server's copy
        apply({ record: data.record, items, listVersion: data.record.listVersion }, ini);
        setSaveText("Reloaded — someone else saved this form");
        return;
      }
      if (res.status === 409 && data.code === "already_submitted") { router.replace(RECORDS); return; }
      if (!res.ok || !data.updatedAt) { setSaveText(data.error ?? "Save failed"); return; }
      updatedAtRef.current = data.updatedAt;
      setSaveText("Saved");
    } catch {
      setSaveText("Save failed — will retry on the next change");
    }
  }, [record, items, apply, router]);

  // Autosave shortly after every edit
  const queueSave = useCallback(() => {
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => { pending.current = null; void save(); }, 600);
  }, [save]);

  function onItemChange(itemId: string, patch: Partial<ItemValues>) {
    // Only when this week has a task: otherwise another week's task would be marked in progress
    if (task) markInProgress();
    setValues((prev) => {
      const next: ItemValues = { ...(prev[itemId] ?? { itemId }), ...patch };
      // Stamp the moment the check first gets a result (the server does the same on save)
      if (resultOf(next) !== null && !next.checkedAt) next.checkedAt = new Date().toISOString();
      return valuesForLiveList(items, { ...prev, [itemId]: next });
    });
    queueSave();
  }

  // ── Checklist edits: saved at once, the open draft follows the live list ──
  async function editList(url: string, method: "POST" | "PATCH", body: Record<string, unknown>) {
    setEditBusy(true); setEditError("");
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { items?: ChecklistItem[]; error?: string };
      if (!res.ok || !data.items) { setEditError(data.error ?? "Could not save the change."); return; }
      setItems(data.items);
      setValues((prev) => valuesForLiveList(data.items!, prev));
      queueSave();
    } catch { setEditError("Could not save the change."); }
    finally { setEditBusy(false); }
  }
  const patchItem = (id: string, body: Record<string, unknown>) => editList(`/api/facilities-checklist-624/items/${id}`, "PATCH", body);
  function retire(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    // If this check already has something entered in the draft, the question says it will be removed
    if (!window.confirm(retireQuestion(item, values[id]))) return;
    void patchItem(id, { retire: true });
  }

  const progress = useMemo(() => progressOf(items, values), [items, values]);
  const problems = useMemo(() => submitProblems(items, values, initials), [items, values, initials]);

  async function handleSubmit() {
    if (!record || problems.length > 0) return;
    setSubmitting(true); setSubmitError("");
    try {
      if (pending.current) { clearTimeout(pending.current); pending.current = null; }
      await save();
      const res = await fetch(`/api/facilities-checklist-624/${record.id}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: task?.id ?? urlTaskId }) });
      const data = (await res.json().catch(() => ({}))) as { completedInstanceId?: string | null; error?: string; problems?: string[] };
      if (!res.ok) throw new Error(data.problems?.join(" ") || data.error || `HTTP ${res.status}`);
      window.dispatchEvent(new CustomEvent("task-action"));
      navigateAfterSubmit(router, data.completedInstanceId, RECORDS);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Failed to submit.");
    } finally { setSubmitting(false); }
  }

  async function handlePdf() {
    if (!record) return;
    const snap = buildSnapshot(items, values);
    const html = buildFacilitiesPdfHtml624({ ...record, initials, items: [...snap.items, { kind: "header", date, time }], okCount: snap.okCount, failCount: snap.failCount });
    await exportFormPdf(html, `facilities-checklist-624-${record.period}.pdf`);
  }

  const shown = record ?? closed;
  const header = (
    <div className="page-header">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-indigo-600 rounded-md flex items-center justify-center shrink-0"><Building2 className="w-5 h-5 text-white" /></div>
        <div>
          <h1 className="page-title leading-tight">Facilities Checklist — 624</h1>
          <p className="page-subtitle">624 Facility · Weekly inspection{shown ? ` · ${periodLabel(shown.period)}` : ""}</p>
        </div>
      </div>
      {record && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setEditing((v) => !v)} className="btn-secondary text-xs">{editing ? "Done editing" : "Edit checklist"}</button>
          <button type="button" onClick={handlePdf} className="btn-secondary text-xs">Download PDF</button>
          <button type="button" onClick={() => router.push(RECORDS)} className="btn-secondary">View Records</button>
        </div>
      )}
    </div>
  );

  if (loadError) {
    return (
      <div className="max-w-3xl">{header}
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700"><AlertCircle className="w-4 h-4 shrink-0" /> {loadError}</div>
      </div>
    );
  }
  if (closed) {
    return (
      <div className="max-w-3xl space-y-5">{header}
        <FacilitiesSubmittedView624
          info={{ period: closed.period, submittedAt: closed.submittedAt, submittedBy: closed.conductedBy || null }}
          onView={() => router.push(`${RECORDS}?view=${closed.id}`)}
          onRecords={() => router.push(RECORDS)}
        />
      </div>
    );
  }
  if (!record) return <div className="max-w-3xl">{header}<div className="card p-6 text-center text-sm text-gray-500">Loading…</div></div>;

  return (
    <div className="max-w-3xl space-y-5">
      {header}
      {!isCurrentWeek && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800" data-past-week>
          <Info className="w-4 h-4 shrink-0" /> You are filling in a past week: {periodDates(record.period)}. Submitting it completes that week&apos;s task as late.
        </div>
      )}
      {submitError && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700"><AlertCircle className="w-4 h-4 shrink-0" /> {submitError}</div>}
      <FacilitiesChecklistForm624
        periodLabel={periodLabel(record.period)}
        date={date} time={time} initials={initials}
        items={items} values={values} progress={progress} problems={problems}
        saveText={saveText} submitting={submitting}
        onDateChange={(v) => { setDate(v); queueSave(); }}
        onTimeChange={(v) => { setTime(v); queueSave(); }}
        onInitialsChange={(v) => { setInitials(v); queueSave(); }}
        onItemChange={onItemChange}
        onSubmit={handleSubmit}
      >
        {editing && (
          <ChecklistEditor624
            items={items} busy={editBusy} error={editError}
            onAdd={(item) => void editList("/api/facilities-checklist-624/items", "POST", item)}
            onRename={(id, name) => void patchItem(id, { name })}
            onDescription={(id, description) => void patchItem(id, { description })}
            onGroup={(id, groupName) => void patchItem(id, { groupName })}
            onRetire={retire}
            onMove={(id, move) => void patchItem(id, { move })}
          />
        )}
      </FacilitiesChecklistForm624>
    </div>
  );
}
