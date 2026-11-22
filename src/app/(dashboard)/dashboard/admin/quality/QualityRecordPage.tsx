"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ChevronLeft } from "lucide-react";
import { CapaRecord, IncidentRecord, type QualityOptions } from "@/components/quality/QualityRecords";
import type { QualityEventRow } from "@/components/quality/QualityParts";
import { useMarkInProgress } from "@/hooks/useMarkInProgress";
import { ATTACHMENT_TYPES, QUALITY_CAPA_FORM_KEY, QUALITY_RULE_FACILITY, taskUntouched, type AttachmentRow, type FieldProblem } from "@/lib/quality";

type Values = Record<string, string | boolean | null>;
type Brief = { id: string; reference: string; status: string; dateReceived: string; description: string };
interface Loaded {
  record: Values; events: QualityEventRow[]; names: Record<string, string>;
  capa?: { id: string; reference: string; status: string; problem: string } | null; incidents?: Brief[]; linkable?: Brief[];
  attachments?: AttachmentRow[]; task?: { id: string; status: string; dueDate: string; completedLate?: boolean; daysLate?: number | null } | null;
}
/** Some browsers give HEIC photos no type: fall back to the file's extension. */
const mimeOf = (file: File) => file.type || ({ heic: "image/heic", heif: "image/heif", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" } as Record<string, string>)[file.name.split(".").pop()?.toLowerCase() ?? ""] || "";
const BASE = "/dashboard/admin/quality";

/** Loads one incident or CAPA and sends every change through its route. After each write the record is reloaded, so the history shown is the stored one. */
export function QualityRecordPage({ kind, id, startTaskId }: {
  kind: "incidents" | "capas"; id: string;
  /** Set when a CAPA was opened from its task's Start button (checked on the server): that task is marked "In progress". */
  startTaskId?: string;
}) {
  const router = useRouter();
  const api = `/api/quality/${kind}/${id}`;
  const [data, setData] = useState<Loaded | null>(null);
  const [options, setOptions] = useState<QualityOptions | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [failure, setFailure] = useState<{ error?: string; problems?: FieldProblem[] }>({});

  const load = useCallback(async () => {
    try {
      const [r, o] = await Promise.all([fetch(api), fetch("/api/quality/options")]);
      if (!r.ok || !o.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Could not load this record.");
      setData(await r.json()); setOptions(await o.json()); setVersion((v) => v + 1);
    } catch (e) { setLoadError(e instanceof Error ? e.message : "Could not load this record."); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  // Opened from the task's Start button: mark the task "In progress", once, with the same hook the forms use.
  // Only after the record has loaded (the load may just have completed the task) and only while nobody has
  // acted on the task: a task in progress, done, skipped or missed is left as it is.
  const markInProgress = useMarkInProgress({ taskId: startTaskId ?? null, formKey: QUALITY_CAPA_FORM_KEY, facilityName: QUALITY_RULE_FACILITY });
  const task = data?.task;
  useEffect(() => {
    if (startTaskId && task && task.id === startTaskId && taskUntouched(task.status)) markInProgress();
  }, [startTaskId, task, markInProgress]);
  // The hook announces the change; show the task's new status
  useEffect(() => {
    if (!startTaskId) return;
    const refresh = () => { void load(); };
    window.addEventListener("task-action", refresh);
    return () => window.removeEventListener("task-action", refresh);
  }, [startTaskId, load]);

  const [pdfBusy, setPdfBusy] = useState(false);
  /** Asks the server for the record's PDF layout and turns it into the file with the 624 exporter. */
  async function downloadPdf() {
    setPdfBusy(true); setFailure({});
    try {
      const res = await fetch(`${api}/pdf`);
      const out = (await res.json().catch(() => ({}))) as { html?: string; filename?: string; error?: string };
      if (!res.ok || !out.html || !out.filename) throw new Error(out.error ?? "Could not prepare the PDF.");
      const { exportFormPdf } = await import("@/components/forms624/pdfExport624");
      await exportFormPdf(out.html, out.filename);
    } catch (e) { setFailure({ error: e instanceof Error ? e.message : "Could not prepare the PDF." }); }
    finally { setPdfBusy(false); }
  }

  async function send(url: string, method: "PATCH" | "POST" | "DELETE", body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    setBusy(true); setFailure({});
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, expectedUpdatedAt: data?.record.updatedAt }) });
      const out = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string; problems?: FieldProblem[] };
      if (!res.ok) { setFailure({ error: out.error ?? "Could not save.", problems: out.problems }); if (res.status === 409) await load(); return null; }
      await load();
      return out;
    } catch { setFailure({ error: "Could not save. Check your connection." }); return null; }
    finally { setBusy(false); }
  }

  /** Uploads straight from the browser to private storage with a short-lived token, then records the file on this record. */
  async function uploadAttachment(file: File, attachmentKind: "evidence" | "customer_response", description: string) {
    setBusy(true); setFailure({});
    try {
      const recordType = kind === "incidents" ? "incident" : "capa";
      const mimeType = mimeOf(file);
      if (!(mimeType in ATTACHMENT_TYPES)) throw new Error("That file type is not allowed. Use JPEG, PNG, WebP, HEIC or PDF.");
      const details = { recordType, recordId: id, kind: attachmentKind, fileName: file.name, fileSize: file.size, mimeType };
      const { upload } = await import("@vercel/blob/client");
      const blob = await upload(`quality/${recordType}/${id}/${file.name.replace(/[^\w.\- ]+/g, "_")}`, file, {
        access: "private", contentType: mimeType, handleUploadUrl: "/api/quality/attachments/upload-token", clientPayload: JSON.stringify(details),
      });
      const res = await fetch("/api/quality/attachments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...details, fileUrl: blob.url, description }) });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not attach the file.");
      await load();
    } catch (e) { setFailure({ error: e instanceof Error ? e.message : "Could not attach the file." }); }
    finally { setBusy(false); }
  }

  const back = (
    <button type="button" onClick={() => router.push(`${BASE}?tab=${kind}`)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800">
      <ChevronLeft className="w-3 h-3" /> {kind === "incidents" ? "All incidents" : "All CAPAs"}
    </button>
  );
  if (loadError) return <div className="max-w-4xl space-y-3">{back}<div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700"><AlertCircle className="w-4 h-4 shrink-0" /> {loadError}</div></div>;
  if (!data || !options) return <div className="max-w-4xl space-y-3">{back}<div className="card p-6 text-center text-sm text-gray-500">Loading…</div></div>;

  const common = {
    events: data.events, names: data.names, options, busy, error: failure.error, problems: failure.problems,
    onSave: (changed: Values) => void send(api, "PATCH", changed),
    onAction: (body: Record<string, unknown>) => void send(`${api}/status`, "POST", body),
    attachments: data.attachments ?? [],
    onUpload: (file: File, attachmentKind: "evidence" | "customer_response", description: string) => void uploadAttachment(file, attachmentKind, description),
    onRemoveAttachment: (attachmentId: string, reason: string) => void send(`/api/quality/attachments/${attachmentId}`, "DELETE", { reason }),
    onDownloadPdf: () => void downloadPdf(), pdfBusy,
  };
  return (
    <div className="max-w-4xl space-y-3">
      {back}
      {kind === "incidents" ? (
        <IncidentRecord
          key={version} {...common} record={data.record} capa={data.capa ?? null}
          onOpenCapa={() => void send(`${api}/capa`, "POST", {}).then((out) => { const capa = out?.capa as { id?: string } | undefined; if (capa?.id) router.push(`${BASE}/capas/${capa.id}`); })}
          onUnlink={(reason) => void send(`${api}/capa`, "DELETE", { reason })}
          onGoToCapa={(capaId) => router.push(`${BASE}/capas/${capaId}`)}
        />
      ) : (
        <CapaRecord
          key={version} {...common} record={data.record} incidents={data.incidents ?? []} linkable={data.linkable ?? []} task={data.task ?? null}
          onLink={(incidentId) => void send(`${api}/incidents`, "POST", { incidentId })}
          onUnlink={(incidentId, reason) => void send(`${api}/incidents`, "DELETE", { incidentId, reason })}
          onGoToIncident={(incidentId) => router.push(`${BASE}/incidents/${incidentId}`)}
        />
      )}
    </div>
  );
}
