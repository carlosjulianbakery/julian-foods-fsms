"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Search,
  Plus,
  ExternalLink,
  CheckCircle,
  Archive,
  ArchiveRestore,
  Clock,
  AlertTriangle,
  X,
  ChevronDown,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

type ReviewStatus = "current" | "due_soon" | "overdue";

interface Certification {
  id: string;
  name: string;
}

interface Tag {
  id: string;
  name: string;
}

interface User {
  id: string;
  name: string;
  role: string;
}

interface ReviewLog {
  id: string;
  eventType: string;
  reviewedAt: string;
  versionAtTime: string;
  driveUrlAtTime: string;
  note: string | null;
  reviewedBy: { id: string; name: string };
}

interface Sop {
  id: string;
  title: string;
  documentNumber: string | null;
  driveUrl: string;
  owner: { id: string; name: string };
  currentVersion: string;
  appliesToAll: boolean;
  lastReviewedAt: string;
  nextReviewAt: string;
  notes: string | null;
  isArchived: boolean;
  reviewStatus: ReviewStatus;
  tags: { tag: Tag }[];
  certScopes: { certification: Certification }[];
  reviewLogs?: ReviewLog[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

function addMonthsDisplay(iso: string): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + 12);
  return fmtDate(d.toISOString());
}

function statusBadge(s: ReviewStatus) {
  if (s === "overdue")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
        <AlertTriangle className="w-3 h-3" /> Overdue
      </span>
    );
  if (s === "due_soon")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
        <Clock className="w-3 h-3" /> Due Soon
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
      <CheckCircle className="w-3 h-3" /> Current
    </span>
  );
}

function eventTypeLabel(e: string) {
  const map: Record<string, string> = {
    created: "Created",
    reviewed: "Reviewed",
    version_changed: "Version changed",
    link_updated: "Drive link updated",
  };
  return map[e] ?? e;
}

// ─── Add/Edit SOP Modal ───────────────────────────────────────────────────────

interface AddEditModalProps {
  sop?: Sop;
  users: User[];
  certifications: Certification[];
  existingTags: Tag[];
  currentUserId: string;
  onClose: () => void;
  onSaved: () => void;
}

function AddEditSopModal({
  sop,
  users,
  certifications,
  existingTags,
  currentUserId,
  onClose,
  onSaved,
}: AddEditModalProps) {
  const isEdit = !!sop;

  const todayISO = new Date().toISOString().slice(0, 10);

  const [title, setTitle] = useState(sop?.title ?? "");
  const [documentNumber, setDocumentNumber] = useState(sop?.documentNumber ?? "");
  const [driveUrl, setDriveUrl] = useState(sop?.driveUrl ?? "");
  const [ownerId, setOwnerId] = useState(sop?.owner?.id ?? currentUserId);
  const [version, setVersion] = useState(sop?.currentVersion ?? "1.0");
  const [lastReviewedAt, setLastReviewedAt] = useState(
    sop?.lastReviewedAt ? sop.lastReviewedAt.slice(0, 10) : todayISO
  );
  const [appliesToAll, setAppliesToAll] = useState(sop?.appliesToAll ?? false);
  const [selectedCerts, setSelectedCerts] = useState<string[]>(
    sop ? (sop.certScopes ?? []).map((cs) => cs.certification?.id ?? "") : []
  );
  const [tagInput, setTagInput] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>(
    sop ? (sop.tags ?? []).map((t) => t.tag?.name ?? "") : []
  );
  const [notes, setNotes] = useState(sop?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const tagSuggestions = existingTags
    .map((t) => t.name)
    .filter(
      (n) =>
        tagInput.trim() &&
        n.toLowerCase().includes(tagInput.toLowerCase()) &&
        !selectedTags.includes(n)
    );

  function addTag(name: string) {
    const n = name.trim().toLowerCase();
    if (n && !selectedTags.includes(n)) {
      setSelectedTags((prev) => [...prev, n]);
    }
    setTagInput("");
  }

  function removeTag(name: string) {
    setSelectedTags((prev) => prev.filter((t) => t !== name));
  }

  function toggleCert(id: string) {
    setSelectedCerts((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  const nextReviewDisplay = addMonthsDisplay(lastReviewedAt + "T00:00:00");

  async function handleSave() {
    if (!title.trim()) return setError("Title is required");
    if (!driveUrl.trim() || !driveUrl.startsWith("http"))
      return setError("A valid Drive URL is required (must start with http)");
    if (!ownerId) return setError("Owner is required");
    if (!lastReviewedAt) return setError("Last reviewed date is required");
    if (!appliesToAll && selectedCerts.length === 0)
      return setError("Select at least one certification or choose 'Applies to all'");

    setSaving(true);
    setError("");

    try {
      const payload = {
        title,
        documentNumber: documentNumber || null,
        driveUrl,
        ownerId,
        currentVersion: version || "1.0",
        appliesToAll,
        certificationIds: appliesToAll ? [] : selectedCerts,
        tagNames: selectedTags,
        notes: notes || null,
        lastReviewedAt: new Date(lastReviewedAt).toISOString(),
      };

      const res = isEdit
        ? await fetch(`/api/compliance/sops/${sop!.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/compliance/sops", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save SOP");
      }
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-6 pt-6 pb-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold font-garamond">
            {isEdit ? "Edit SOP" : "Add SOP"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-4 py-2">
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="e.g. Allergen Control Procedure"
            />
          </div>

          {/* Document Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Document Number
            </label>
            <input
              type="text"
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="e.g. SOP-001"
            />
          </div>

          {/* Drive URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Google Drive Link <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={driveUrl}
              onChange={(e) => setDriveUrl(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="https://docs.google.com/..."
            />
          </div>

          {/* Owner */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Owner <span className="text-red-500">*</span>
            </label>
            <select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Select owner…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          {/* Version + Last Reviewed (side by side) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Version
              </label>
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="1.0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Last Reviewed <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={lastReviewedAt}
                onChange={(e) => setLastReviewedAt(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Next review helper */}
          <p className="text-xs text-gray-500 -mt-2">
            Next review will be set to:{" "}
            <span className="font-medium text-gray-700">{nextReviewDisplay}</span>
          </p>

          {/* Scope */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Certification Scope <span className="text-red-500">*</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={appliesToAll}
                onChange={(e) => setAppliesToAll(e.target.checked)}
                className="rounded border-gray-300 text-brand-600"
              />
              <span className="text-sm text-gray-700">Applies to all certifications</span>
            </label>
            {!appliesToAll && (
              <div className="space-y-1 ml-1">
                {certifications.map((cert) => (
                  <label key={cert.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedCerts.includes(cert.id)}
                      onChange={() => toggleCert(cert.id)}
                      className="rounded border-gray-300 text-brand-600"
                    />
                    <span className="text-sm text-gray-700">{cert.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
            <div className="flex flex-wrap gap-1 mb-2">
              {selectedTags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full"
                >
                  {t}
                  <button onClick={() => removeTag(t)}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="relative">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (tagInput.trim()) addTag(tagInput);
                  }
                }}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Type tag and press Enter…"
              />
              {(tagSuggestions.length > 0 ||
                (tagInput.trim() && !existingTags.some((t) => t.name === tagInput.trim().toLowerCase()))) && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-40 overflow-y-auto">
                  {tagSuggestions.map((s) => (
                    <button
                      key={s}
                      onMouseDown={(e) => { e.preventDefault(); addTag(s); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      {s}
                    </button>
                  ))}
                  {tagInput.trim() &&
                    !existingTags.some((t) => t.name === tagInput.trim().toLowerCase()) &&
                    !selectedTags.includes(tagInput.trim().toLowerCase()) && (
                      <button
                        onMouseDown={(e) => { e.preventDefault(); addTag(tagInput); }}
                        className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50"
                      >
                        Create &quot;{tagInput.trim().toLowerCase()}&quot;
                      </button>
                    )}
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              placeholder="Optional notes…"
            />
          </div>
        </div>

        <div className="sticky bottom-0 bg-white px-6 pb-6 pt-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-md hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add SOP"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Mark Reviewed Modal ──────────────────────────────────────────────────────

interface MarkReviewedModalProps {
  sop: Sop;
  onClose: () => void;
  onSaved: () => void;
}

function MarkReviewedModal({ sop, onClose, onSaved }: MarkReviewedModalProps) {
  const [note, setNote] = useState("");
  const [newVersion, setNewVersion] = useState("");
  const [newDriveUrl, setNewDriveUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const todayDisplay = fmtDate(new Date().toISOString());
  const nextReviewDisplay = addMonthsDisplay(new Date().toISOString());

  async function handleConfirm() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/compliance/sops/${sop.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: note.trim() || null,
          newVersion: newVersion.trim() || null,
          newDriveUrl: newDriveUrl.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to mark as reviewed");
      }
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="px-6 pt-6 pb-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold font-garamond">Mark Reviewed</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-4 py-2">
              {error}
            </div>
          )}

          <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm text-green-800">
            <p className="font-medium">{sop.title}</p>
            <p className="mt-1 text-green-700">
              You are signing off this review on{" "}
              <span className="font-medium">{todayDisplay}</span>. Next review will be set to{" "}
              <span className="font-medium">{nextReviewDisplay}</span>.
            </p>
          </div>

          <div className="text-sm text-gray-600 space-y-1">
            <p>
              Current version: <span className="font-medium">{sop.currentVersion}</span>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Note (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              placeholder="e.g. No changes needed, re-verified against FSMA requirements"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Updated version (optional — leave blank to keep current)
            </label>
            <input
              type="text"
              value={newVersion}
              onChange={(e) => setNewVersion(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder={`Current: ${sop.currentVersion}`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Updated Drive link (optional — leave blank to keep current)
            </label>
            <input
              type="url"
              value={newDriveUrl}
              onChange={(e) => setNewDriveUrl(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="https://docs.google.com/..."
            />
          </div>
        </div>

        <div className="px-6 pb-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Confirm Review"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

interface DetailModalProps {
  sopId: string;
  isAdmin: boolean;
  onClose: () => void;
  onEdit: (sop: Sop) => void;
  onReview: (sop: Sop) => void;
  onRefresh: () => void;
}

function DetailModal({ sopId, isAdmin, onClose, onEdit, onReview, onRefresh }: DetailModalProps) {
  const [sop, setSop] = useState<Sop | null>(null);
  const [loading, setLoading] = useState(true);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    fetch(`/api/compliance/sops/${sopId}`)
      .then((r) => r.json())
      .then(setSop)
      .finally(() => setLoading(false));
  }, [sopId]);

  async function toggleArchive() {
    if (!sop) return;
    setArchiving(true);
    const action = sop.isArchived ? "unarchive" : "archive";
    await fetch(`/api/compliance/sops/${sop.id}/${action}`, { method: "POST" });
    setArchiving(false);
    onRefresh();
    onClose();
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-10 text-center text-gray-500 text-sm">
          Loading…
        </div>
      </div>
    );
  }

  if (!sop) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-6 pt-6 pb-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold font-garamond">{sop.title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Status + Drive link */}
          <div className="flex items-center justify-between">
            {statusBadge(sop.reviewStatus)}
            <a
              href={sop.driveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              <ExternalLink className="w-4 h-4" /> Open in Drive
            </a>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {sop.documentNumber && (
              <>
                <span className="text-gray-500">Document #</span>
                <span className="font-medium">{sop.documentNumber}</span>
              </>
            )}
            <span className="text-gray-500">Owner</span>
            <span className="font-medium">{sop.owner.name}</span>
            <span className="text-gray-500">Version</span>
            <span className="font-medium">{sop.currentVersion}</span>
            <span className="text-gray-500">Last Reviewed</span>
            <span className="font-medium">{fmtDate(sop.lastReviewedAt)}</span>
            <span className="text-gray-500">Next Review</span>
            <span className="font-medium">{fmtDate(sop.nextReviewAt)}</span>
            <span className="text-gray-500">Scope</span>
            <span className="font-medium">
              {sop.appliesToAll
                ? "All certifications"
                : sop.certScopes.map((cs) => cs.certification.name).join(", ") || "—"}
            </span>
          </div>

          {/* Tags */}
          {sop.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {sop.tags.map((t) => (
                <span
                  key={t.tag.id}
                  className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full"
                >
                  {t.tag.name}
                </span>
              ))}
            </div>
          )}

          {/* Notes */}
          {sop.notes && (
            <div className="bg-gray-50 rounded-md p-3 text-sm text-gray-700">
              {sop.notes}
            </div>
          )}

          {/* Review history */}
          {sop.reviewLogs && sop.reviewLogs.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <History className="w-4 h-4 text-gray-400" />
                <p className="text-sm font-semibold text-gray-700">Review History</p>
              </div>
              <ol className="relative border-l border-gray-200 space-y-4 ml-3">
                {sop.reviewLogs.map((log) => (
                  <li key={log.id} className="ml-4">
                    <div className="absolute -left-1.5 mt-1 w-3 h-3 bg-white border-2 border-gray-300 rounded-full" />
                    <p className="text-xs font-semibold text-gray-700">
                      {eventTypeLabel(log.eventType)}
                      <span className="font-normal text-gray-500 ml-1">
                        — {fmtDate(log.reviewedAt)} · {log.reviewedBy.name}
                      </span>
                    </p>
                    <p className="text-xs text-gray-500">
                      Version {log.versionAtTime}
                    </p>
                    {log.note && (
                      <p className="text-xs text-gray-600 mt-0.5 italic">{log.note}</p>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="sticky bottom-0 bg-white px-6 pb-6 pt-4 border-t border-gray-200 flex flex-wrap gap-2 justify-end">
            <button
              onClick={toggleArchive}
              disabled={archiving}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              {sop.isArchived ? (
                <>
                  <ArchiveRestore className="w-4 h-4" /> Unarchive
                </>
              ) : (
                <>
                  <Archive className="w-4 h-4" /> Archive
                </>
              )}
            </button>
            {!sop.isArchived && (
              <>
                <button
                  onClick={() => { onClose(); onEdit(sop); }}
                  className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Edit
                </button>
                <button
                  onClick={() => { onClose(); onReview(sop); }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                >
                  <CheckCircle className="w-4 h-4" /> Mark Reviewed
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SopLibraryPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [sops, setSops] = useState<Sop[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [existingTags, setExistingTags] = useState<Tag[]>([]);

  // Filters
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCertId, setFilterCertId] = useState("");
  const [filterOwnerId, setFilterOwnerId] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSop, setEditingSop] = useState<Sop | null>(null);
  const [reviewingSop, setReviewingSop] = useState<Sop | null>(null);
  const [detailSopId, setDetailSopId] = useState<string | null>(null);

  const fetchSops = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterStatus) params.set("status", filterStatus);
      if (filterCertId) params.set("certificationId", filterCertId);
      if (filterOwnerId) params.set("ownerId", filterOwnerId);
      if (filterTag) params.set("tag", filterTag);
      if (showArchived) params.set("includeArchived", "true");
      const res = await fetch(`/api/compliance/sops?${params}`);
      const data = await res.json();
      setSops(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, filterCertId, filterOwnerId, filterTag, showArchived]);

  useEffect(() => { fetchSops(); }, [fetchSops]);

  useEffect(() => {
    fetch("/api/compliance/certifications")
      .then((r) => r.json())
      .then((d) => setCertifications(Array.isArray(d) ? d : []))
      .catch(() => {});
    fetch("/api/compliance/tags")
      .then((r) => r.json())
      .then((d) => setExistingTags(Array.isArray(d) ? d : []))
      .catch(() => {});
    if (isAdmin) {
      fetch("/api/users")
        .then((r) => r.json())
        .then((d) => setUsers(Array.isArray(d) ? d : []))
        .catch(() => {});
    }
  }, [isAdmin]);

  // Summary counts
  const counts = {
    overdue: sops.filter((s) => s.reviewStatus === "overdue").length,
    due_soon: sops.filter((s) => s.reviewStatus === "due_soon").length,
    current: sops.filter((s) => s.reviewStatus === "current").length,
    total: sops.length,
  };

  // Unique owners from loaded SOPs (for filter dropdown)
  const sopOwners = Array.from(
    new Map(sops.filter((s) => s.owner).map((s) => [s.owner.id, s.owner])).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  function handleSaved() {
    setShowAddModal(false);
    setEditingSop(null);
    setReviewingSop(null);
    fetchSops();
    fetch("/api/compliance/tags")
      .then((r) => r.json())
      .then((d) => setExistingTags(Array.isArray(d) ? d : []))
      .catch(() => {});
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-garamond text-gray-900">SOP Library</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track annual reviews for all standard operating procedures</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-md hover:bg-brand-700"
          >
            <Plus className="w-4 h-4" /> Add SOP
          </button>
        )}
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: "Overdue",
            count: counts.overdue,
            bg: "bg-red-50",
            text: "text-red-700",
            border: "border-red-200",
            status: "overdue",
          },
          {
            label: "Due Soon",
            count: counts.due_soon,
            bg: "bg-amber-50",
            text: "text-amber-700",
            border: "border-amber-200",
            status: "due_soon",
          },
          {
            label: "Current",
            count: counts.current,
            bg: "bg-green-50",
            text: "text-green-700",
            border: "border-green-200",
            status: "current",
          },
          {
            label: "Total",
            count: counts.total,
            bg: "bg-gray-50",
            text: "text-gray-700",
            border: "border-gray-200",
            status: "",
          },
        ].map(({ label, count, bg, text, border, status }) => (
          <button
            key={label}
            onClick={() => setFilterStatus(filterStatus === status ? "" : status)}
            className={cn(
              "rounded-lg border p-4 text-left transition-all hover:shadow-sm",
              bg,
              border,
              filterStatus === status && status !== "" && "ring-2 ring-offset-1 ring-brand-500"
            )}
          >
            <p className={cn("text-2xl font-bold", text)}>{count}</p>
            <p className={cn("text-xs font-medium mt-0.5", text)}>{label}</p>
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-5 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title or doc #…"
            className="pl-9 pr-3 py-2 w-full text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="relative">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="pl-3 pr-8 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none bg-white"
          >
            <option value="">All statuses</option>
            <option value="current">Current</option>
            <option value="due_soon">Due Soon</option>
            <option value="overdue">Overdue</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        </div>

        <div className="relative">
          <select
            value={filterCertId}
            onChange={(e) => setFilterCertId(e.target.value)}
            className="pl-3 pr-8 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none bg-white"
          >
            <option value="">All certifications</option>
            {certifications.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        </div>

        <div className="relative">
          <select
            value={filterOwnerId}
            onChange={(e) => setFilterOwnerId(e.target.value)}
            className="pl-3 pr-8 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none bg-white"
          >
            <option value="">All owners</option>
            {sopOwners.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        </div>

        <div className="relative">
          <select
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
            className="pl-3 pr-8 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none bg-white"
          >
            <option value="">All tags</option>
            {existingTags.map((t) => (
              <option key={t.id} value={t.name}>{t.name}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        </div>

        {isAdmin && (
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 ml-auto">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded border-gray-300 text-brand-600"
            />
            Show archived
          </label>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-500">Loading…</div>
        ) : sops.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-gray-500 text-sm mb-3">
              {search || filterStatus || filterCertId || filterOwnerId || filterTag
                ? "No SOPs match your filters."
                : "No SOPs yet. Add your first SOP to start tracking annual reviews."}
            </p>
            {isAdmin && !search && !filterStatus && !filterCertId && !filterOwnerId && !filterTag && (
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-md hover:bg-brand-700"
              >
                <Plus className="w-4 h-4" /> Add SOP
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 font-mono text-xs uppercase tracking-wide">
                    Title
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 font-mono text-xs uppercase tracking-wide hidden md:table-cell">
                    Owner
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 font-mono text-xs uppercase tracking-wide hidden lg:table-cell">
                    Scope
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 font-mono text-xs uppercase tracking-wide hidden lg:table-cell">
                    Tags
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 font-mono text-xs uppercase tracking-wide hidden md:table-cell">
                    Last Reviewed
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 font-mono text-xs uppercase tracking-wide">
                    Next Review
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 font-mono text-xs uppercase tracking-wide">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 font-mono text-xs uppercase tracking-wide hidden sm:table-cell">
                    Ver
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 font-mono text-xs uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sops.map((sop) => (
                  <tr
                    key={sop.id}
                    className={cn(
                      "hover:bg-gray-50 transition-colors",
                      sop.isArchived && "opacity-50"
                    )}
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setDetailSopId(sop.id)}
                        className="font-medium text-gray-900 hover:text-brand-600 text-left"
                      >
                        {sop.title}
                        {sop.documentNumber && (
                          <span className="ml-1.5 text-xs text-gray-400 font-mono">
                            {sop.documentNumber}
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                      {sop.owner.name}
                    </td>
                    <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">
                      <span className="text-xs">
                        {sop.appliesToAll
                          ? "All"
                          : sop.certScopes.map((cs) => cs.certification.name).join(", ") || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {sop.tags.slice(0, 2).map((t) => (
                          <span
                            key={t.tag.id}
                            className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full"
                          >
                            {t.tag.name}
                          </span>
                        ))}
                        {sop.tags.length > 2 && (
                          <span className="text-xs text-gray-400">
                            +{sop.tags.length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell font-mono text-xs">
                      {fmtDate(sop.lastReviewedAt)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                      {fmtDate(sop.nextReviewAt)}
                    </td>
                    <td className="px-4 py-3">{statusBadge(sop.reviewStatus)}</td>
                    <td className="px-4 py-3 text-gray-500 hidden sm:table-cell font-mono text-xs">
                      v{sop.currentVersion}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={sop.driveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open in Drive"
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                        {isAdmin && !sop.isArchived && (
                          <button
                            onClick={() => setReviewingSop(sop)}
                            title="Mark Reviewed"
                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-md"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setDetailSopId(sop.id)}
                          title="View details"
                          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md"
                        >
                          <History className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddEditSopModal
          users={users}
          certifications={certifications}
          existingTags={existingTags}
          currentUserId={session?.user?.id ?? ""}
          onClose={() => setShowAddModal(false)}
          onSaved={handleSaved}
        />
      )}

      {editingSop && (
        <AddEditSopModal
          sop={editingSop}
          users={users}
          certifications={certifications}
          existingTags={existingTags}
          currentUserId={session?.user?.id ?? ""}
          onClose={() => setEditingSop(null)}
          onSaved={handleSaved}
        />
      )}

      {reviewingSop && (
        <MarkReviewedModal
          sop={reviewingSop}
          onClose={() => setReviewingSop(null)}
          onSaved={handleSaved}
        />
      )}

      {detailSopId && (
        <DetailModal
          sopId={detailSopId}
          isAdmin={isAdmin}
          onClose={() => setDetailSopId(null)}
          onEdit={(sop) => { setDetailSopId(null); setEditingSop(sop); }}
          onReview={(sop) => { setDetailSopId(null); setReviewingSop(sop); }}
          onRefresh={fetchSops}
        />
      )}
    </div>
  );
}
