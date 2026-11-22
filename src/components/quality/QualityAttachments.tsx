"use client";

import { useRef, useState } from "react";
import { Download, FileText, Paperclip } from "lucide-react";
import { StatusButtons } from "@/components/quality/QualityParts";
import { ATTACHMENT_MAX_PER_RECORD, ATTACHMENT_TYPES, formatBytes, formatMoment, hasThumbnail, type AttachmentRow } from "@/lib/quality";

/** Files are only ever reached through this route, which checks the session; no storage address is on the page. */
export const attachmentHref = (id: string, download = false) => `/api/quality/attachments/${id}${download ? "?download=1" : ""}`;
const ACCEPT = Object.keys(ATTACHMENT_TYPES).join(",") + ",.heic,.heif";

export interface AttachmentsSectionProps {
  /** Every attachment of the record; this section shows those of its own kind. */
  attachments: AttachmentRow[];
  kind: "evidence" | "customer_response";
  title: string;
  addLabel: string;
  /** How many active attachments the whole record has (the limit of ten is per record). */
  recordActiveCount: number;
  /** Closed or void: attachments stay viewable, nothing can be added or removed. */
  readOnly: boolean;
  busy?: boolean;
  onUpload: (file: File, kind: "evidence" | "customer_response", description: string) => void;
  onRemove: (id: string, reason: string) => void;
  initialShowRemoved?: boolean;
}

export function AttachmentsSection(p: AttachmentsSectionProps) {
  const [showRemoved, setShowRemoved] = useState(!!p.initialShowRemoved);
  const [description, setDescription] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const mine = p.attachments.filter((a) => a.kind === p.kind);
  const active = mine.filter((a) => !a.removedAt);
  const removed = mine.filter((a) => a.removedAt);
  const shown = showRemoved ? mine : active;
  const full = p.recordActiveCount >= ATTACHMENT_MAX_PER_RECORD;

  return (
    <div className="space-y-3" data-attachments={p.kind}>
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><Paperclip className="w-4 h-4 text-gray-400" /> {p.title} ({active.length})</h3>
        {removed.length > 0 && (
          <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
            <input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} /> Show removed ({removed.length})
          </label>
        )}
      </div>

      {shown.length === 0 && <p className="text-sm text-gray-400">No files attached.</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {shown.map((a) => (
          <li key={a.id} className={`flex gap-3 border rounded-lg p-2 ${a.removedAt ? "border-gray-200 bg-gray-50 opacity-70" : "border-gray-200 bg-white"}`} data-attachment={a.id} data-removed={a.removedAt ? "true" : undefined}>
            <a href={attachmentHref(a.id)} target="_blank" rel="noreferrer" className="shrink-0 w-20 h-20 rounded border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden" title="Open">
              {hasThumbnail(a.mimeType)
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={attachmentHref(a.id)} alt={a.fileName} className="w-full h-full object-cover" loading="lazy" data-thumbnail />
                : <FileText className="w-8 h-8 text-gray-400" data-file-icon />}
            </a>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium text-gray-900 truncate" title={a.fileName}>{a.fileName}</p>
              {a.description && <p className="text-xs text-gray-600">{a.description}</p>}
              <p className="text-[11px] text-gray-500">{ATTACHMENT_TYPES[a.mimeType ?? ""] ?? "File"} · {formatBytes(a.fileSize)} · added {formatMoment(a.uploadedAt)}{a.uploadedByName ? ` by ${a.uploadedByName}` : ""}</p>
              {a.removedAt && <p className="text-[11px] text-red-700">Removed {formatMoment(a.removedAt)}{a.removedByName ? ` by ${a.removedByName}` : ""}. Reason: {a.removeReason}</p>}
              <div className="flex flex-wrap items-center gap-3">
                <a href={attachmentHref(a.id, true)} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 underline"><Download className="w-3 h-3" /> Download</a>
                {!p.readOnly && !a.removedAt && <StatusButtons busy={p.busy} buttons={[{ key: a.id, label: "Remove", needsReason: true, danger: true }]} onAction={(id, why) => p.onRemove(id, why ?? "")} />}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {p.readOnly ? (
        <p className="text-xs text-gray-500">This record is read-only: its files stay viewable, but none can be added or removed. Reopen it first.</p>
      ) : full ? (
        <p className="text-xs text-amber-700">This record has {ATTACHMENT_MAX_PER_RECORD} attachments, the most allowed. Remove one to add another.</p>
      ) : (
        <div className="flex flex-wrap items-end gap-2" data-add-attachment={p.kind}>
          <label className="block flex-1 min-w-[180px]">
            <span className="block text-xs font-medium text-gray-500 mb-1">Description (optional)</span>
            <input type="text" className="input w-full text-sm" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <input
            ref={input} type="file" accept={ACCEPT} className="hidden"
            onChange={(e) => { const file = e.target.files?.[0]; if (file) { p.onUpload(file, p.kind, description.trim()); setDescription(""); } e.target.value = ""; }}
          />
          <button type="button" disabled={p.busy} onClick={() => input.current?.click()} className="btn-secondary text-sm disabled:opacity-50">{p.busy ? "Working…" : p.addLabel}</button>
          <p className="basis-full text-[11px] text-gray-500">JPEG, PNG, WebP, HEIC or PDF, up to 15 MB each. At most {ATTACHMENT_MAX_PER_RECORD} per record.</p>
        </div>
      )}
    </div>
  );
}
