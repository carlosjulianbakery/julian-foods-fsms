"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Gauge } from "lucide-react";
import { Verification624Form } from "@/components/forms624/Verification624Form";
import { EquipmentEditor624 } from "@/components/forms624/EquipmentEditor624";
import { deriveInitials } from "@/components/forms624/initialsHelper";
import { exportFormPdf } from "@/components/forms624/pdfExport624";
import { buildVerificationPdfHtml624 } from "@/components/forms624/pdfBuilders624";
import { navigateAfterSubmit } from "@/lib/afterSubmit";
import { useMarkInProgress } from "@/hooks/useMarkInProgress";
import {
  VERIFICATION_FACILITY, VERIFICATION_FORM_KEY, buildSnapshot, clearScaleReadings, itemResult, periodLabel, progressOf, specChangeClearsReadings, splitStored, submitProblems,
  valuesForLiveList, type Equipment, type ItemValues, type Section, type SpecInput,
} from "@/lib/verification-624";

interface RecordRow {
  id: string; period: string; periodEnd: string; status: string; conductedBy: string; initials: string; items: unknown;
  listVersion: number; okCount: number; failCount: number; notInUseCount: number; notes: string | null; submittedAt: string | null; updatedAt: string;
}
type Loaded = { record: RecordRow; equipment: Equipment[]; listVersion: number; error?: string };

function nowPT(): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

const RECORDS = "/dashboard/supervisor/verification-624/records";

export default function Verification624Page() {
  const { data: session } = useSession();
  const router = useRouter();
  const taskId = useSearchParams()?.get("taskId") ?? null;

  const [record, setRecord] = useState<RecordRow | null>(null);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [values, setValues] = useState<Record<string, ItemValues>>({});
  const [initials, setInitials] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [loadError, setLoadError] = useState("");
  const [saveText, setSaveText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState("");

  const markInProgress = useMarkInProgress({ taskId, formKey: VERIFICATION_FORM_KEY, facilityName: VERIFICATION_FACILITY, dueDate: record?.periodEnd.slice(0, 10) ?? null });

  const updatedAtRef = useRef<string | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ values, initials, date, time });
  latest.current = { values, initials, date, time };

  const apply = useCallback((data: Loaded, sessionInitials: string) => {
    const stored = splitStored(data.record.items);
    const now = nowPT();
    setRecord(data.record);
    setEquipment(data.equipment);
    setValues(valuesForLiveList(data.equipment, stored.entries));
    setInitials(data.record.initials || sessionInitials);
    setDate(stored.header?.date ?? now.date);
    setTime(stored.header?.time ?? now.time);
    updatedAtRef.current = data.record.updatedAt;
  }, []);

  // Open (or create) the draft for the current half-month
  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/verification-624", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId }) })
      .then((r) => r.json())
      .then((data: Loaded) => {
        if (data.error || !data.record) { setLoadError(data.error ?? "Could not load the form."); return; }
        if (data.record.status !== "draft") { router.replace(RECORDS); return; }
        apply(data, deriveInitials(session.user.name, session.user.email));
      })
      .catch(() => setLoadError("Could not load the form. Try refreshing."));
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(async () => {
    if (!record) return;
    setSaveText("Saving…");
    try {
      const { values: v, initials: ini, date: d, time: t } = latest.current;
      const res = await fetch(`/api/verification-624/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: Object.values(v), initials: ini, date: d, time: t, expectedUpdatedAt: updatedAtRef.current, taskId }),
      });
      const data = (await res.json().catch(() => ({}))) as { updatedAt?: string; code?: string; record?: RecordRow; error?: string };
      if (res.status === 409 && data.code === "conflict" && data.record) {
        // Someone else saved meanwhile: take the server's copy
        apply({ record: data.record, equipment, listVersion: data.record.listVersion }, ini);
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
  }, [record, equipment, taskId, apply, router]);

  // Autosave shortly after every edit
  const queueSave = useCallback(() => {
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => { pending.current = null; void save(); }, 600);
  }, [save]);

  function onItemChange(equipmentId: string, patch: Partial<ItemValues>) {
    markInProgress();
    setValues((prev) => {
      const item = equipment.find((e) => e.id === equipmentId);
      const next: ItemValues = { ...(prev[equipmentId] ?? { equipmentId }), ...patch };
      // Stamp the moment the item first gets a result (the server does the same on save)
      if (item && itemResult(item, next) !== null && !next.checkedAt) next.checkedAt = new Date().toISOString();
      return valuesForLiveList(equipment, { ...prev, [equipmentId]: next });
    });
    queueSave();
  }

  // ── Equipment list edits: saved at once, the open draft follows the live list ──
  async function editList(url: string, method: "POST" | "PATCH", body: Record<string, unknown>, clearReadingsOf?: string) {
    setEditBusy(true); setEditError("");
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { equipment?: Equipment[]; error?: string };
      if (!res.ok || !data.equipment) { setEditError(data.error ?? "Could not save the change."); return; }
      setEquipment(data.equipment);
      // clearReadingsOf: the one scale whose unit or test weight was changed after the supervisor confirmed
      setValues((prev) => valuesForLiveList(data.equipment!, clearReadingsOf ? clearScaleReadings(prev, clearReadingsOf) : prev));
      queueSave();
    } catch { setEditError("Could not save the change."); }
    finally { setEditBusy(false); }
  }
  const patchItem = (id: string, body: Record<string, unknown>) => editList(`/api/verification-624/equipment/${id}`, "PATCH", body);
  /** A new unit or test weight makes the readings already entered for THAT scale meaningless: ask first. A tolerance-only change keeps them. */
  function changeLimits(id: string, limits: SpecInput) {
    const item = equipment.find((e) => e.id === id);
    if (!item) return;
    const clears = specChangeClearsReadings(item, limits, values[id]);
    if (clears && !window.confirm(`Change the unit or test weight of "${item.name}"? The readings already entered for this scale in this form will be cleared, and it will need to be weighed again. No other item is affected.`)) return;
    void editList(`/api/verification-624/equipment/${id}`, "PATCH", { ...limits }, clears ? id : undefined);
  }
  function retire(id: string) {
    const item = equipment.find((e) => e.id === id);
    const v = values[id];
    const hasValues = !!v && (v.reading != null || v.recheck != null || v.target != null || v.fixedReading != null || (v.points ?? []).some((x) => x != null) || !!v.correctiveAction || !!v.notes);
    const question = hasValues
      ? `Retire "${item?.name}"? The values already entered for it in this form will be removed.`
      : `Retire "${item?.name}"? It will no longer appear in future forms.`;
    if (!window.confirm(question)) return;
    void patchItem(id, { retire: true });
  }

  const progress = useMemo(() => progressOf(equipment, values), [equipment, values]);
  const problems = useMemo(() => submitProblems(equipment, values, initials), [equipment, values, initials]);

  async function handleSubmit() {
    if (!record || problems.length > 0) return;
    setSubmitting(true); setSubmitError("");
    try {
      if (pending.current) { clearTimeout(pending.current); pending.current = null; }
      await save();
      const res = await fetch(`/api/verification-624/${record.id}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId }) });
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
    const snap = buildSnapshot(equipment, values);
    const html = buildVerificationPdfHtml624({ ...record, initials, items: [...snap.items, { kind: "header", date, time }], okCount: snap.okCount, failCount: snap.failCount, notInUseCount: snap.notInUseCount });
    await exportFormPdf(html, `verification-624-${record.period}.pdf`);
  }

  const header = (
    <div className="page-header">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-indigo-600 rounded-md flex items-center justify-center shrink-0"><Gauge className="w-5 h-5 text-white" /></div>
        <div>
          <h1 className="page-title leading-tight">Scales &amp; Thermometer Verification — 624</h1>
          <p className="page-subtitle">624 Facility · Food Safety Management{record ? ` · ${periodLabel(record.period)}` : ""}</p>
        </div>
      </div>
      {record && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setEditing((v) => !v)} className="btn-secondary text-xs">{editing ? "Done editing" : "Edit equipment"}</button>
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
  if (!record) return <div className="max-w-3xl">{header}<div className="card p-6 text-center text-sm text-gray-500">Loading…</div></div>;

  return (
    <div className="max-w-3xl space-y-5">
      {header}
      {submitError && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700"><AlertCircle className="w-4 h-4 shrink-0" /> {submitError}</div>}
      <Verification624Form
        periodLabel={periodLabel(record.period)}
        date={date} time={time} initials={initials}
        equipment={equipment} values={values} progress={progress} problems={problems}
        saveText={saveText} submitting={submitting}
        onDateChange={(v) => { setDate(v); queueSave(); }}
        onTimeChange={(v) => { setTime(v); queueSave(); }}
        onInitialsChange={(v) => { setInitials(v); queueSave(); }}
        onItemChange={onItemChange}
        onSubmit={handleSubmit}
      >
        {editing && (
          <EquipmentEditor624
            equipment={equipment} busy={editBusy} error={editError}
            onAdd={(section: Section, name, location) => void editList("/api/verification-624/equipment", "POST", { section, name, location })}
            onRename={(id, name) => void patchItem(id, { name })}
            onLocation={(id, location) => void patchItem(id, { location })}
            onInUse={(id, inUse) => void patchItem(id, { inUse })}
            onRetire={retire}
            onMove={(id, move) => void patchItem(id, { move })}
            onLimits={changeLimits}
          />
        )}
      </Verification624Form>
    </div>
  );
}
