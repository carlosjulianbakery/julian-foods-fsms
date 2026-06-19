"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  ArrowLeft, FileText, Plus, Upload, Download, Trash2,
  CheckCircle2, Pencil, X, Link2, Link2Off
} from "lucide-react";
import { formatDate } from "@/lib/utils";

interface LinkedReq {
  id: string;
  name: string;
  requirementType: string;
}

interface FormTemplate {
  id: string;
  name: string;
  description: string | null;
  fileName: string;
  fileSize: number | null;
  requirementId: string | null;
  requirement: LinkedReq | null;
  uploadedBy: { id: string; name: string };
  uploadedAt: string;
}

interface DocReq {
  id: string;
  name: string;
  requirementType: string;
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FormTemplatesPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role ?? "";
  const isAdmin = role === "ADMIN";

  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [allRequirements, setAllRequirements] = useState<DocReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Add form state
  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState("");
  const [addDescription, setAddDescription] = useState("");
  const [addReqId, setAddReqId] = useState("");
  const [saving, setSaving] = useState(false);
  const addFileRef = useRef<HTMLInputElement>(null);

  // Edit form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editReqId, setEditReqId] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Replace file state
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [replaceSaving, setReplaceSaving] = useState(false);
  const replaceFileRef = useRef<HTMLInputElement>(null);

  // Download state
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Requirements that don't already have an active template
  const linkedReqIds = new Set(templates.map((t) => t.requirementId).filter(Boolean));
  const availableRequirements = allRequirements.filter((r) => !linkedReqIds.has(r.id));
  // For edit: include the currently-linked requirement too
  const availableReqsForEdit = (currentReqId: string | null) =>
    allRequirements.filter((r) => !linkedReqIds.has(r.id) || r.id === currentReqId);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    setLoading(true);
    const [tplRes, reqRes] = await Promise.all([
      fetch("/api/supplier-management/form-templates"),
      fetch("/api/supplier-management/document-requirements"),
    ]);
    if (tplRes.ok) setTemplates(await tplRes.json());
    if (reqRes.ok) setAllRequirements(await reqRes.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const file = addFileRef.current?.files?.[0];
    if (!file || !addName.trim()) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", addName.trim());
      if (addDescription.trim()) fd.append("description", addDescription.trim());
      if (addReqId) fd.append("requirementId", addReqId);
      const res = await fetch("/api/supplier-management/form-templates", { method: "POST", body: fd });
      if (res.ok) {
        setAdding(false);
        setAddName("");
        setAddDescription("");
        setAddReqId("");
        if (addFileRef.current) addFileRef.current.value = "";
        showToast("Template uploaded.");
        await load();
      } else {
        const data = await res.json();
        alert(data.error ?? "Upload failed.");
      }
    } finally { setSaving(false); }
  }

  async function handleEditSave(id: string) {
    setEditSaving(true);
    try {
      const res = await fetch(`/api/supplier-management/form-templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, description: editDescription || null, requirementId: editReqId || null }),
      });
      if (res.ok) {
        setEditingId(null);
        showToast("Template updated.");
        await load();
      } else {
        const data = await res.json();
        alert(data.error ?? "Save failed.");
      }
    } finally { setEditSaving(false); }
  }

  async function handleReplace(id: string) {
    if (!replaceFile) return;
    setReplaceSaving(true);
    try {
      const fd = new FormData();
      fd.append("file", replaceFile);
      const res = await fetch(`/api/supplier-management/form-templates/${id}`, { method: "PUT", body: fd });
      if (res.ok) {
        setReplacingId(null);
        setReplaceFile(null);
        if (replaceFileRef.current) replaceFileRef.current.value = "";
        showToast("Template replaced.");
        await load();
      } else {
        const data = await res.json();
        alert(data.error ?? "Replace failed.");
      }
    } finally { setReplaceSaving(false); }
  }

  async function handleUnlink(id: string) {
    if (!confirm("Remove the requirement link? The file will remain available as an unlinked template.")) return;
    const res = await fetch(`/api/supplier-management/form-templates/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requirementId: null }),
    });
    if (res.ok) { showToast("Link removed."); await load(); }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/supplier-management/form-templates/${id}`, { method: "DELETE" });
    if (res.ok) { showToast("Template deleted."); await load(); }
  }

  async function handleDownload(id: string) {
    setDownloadingId(id);
    try {
      const res = await fetch(`/api/supplier-management/form-templates/${id}/download`);
      if (res.ok) {
        const { url } = await res.json();
        window.open(url, "_blank", "noopener noreferrer");
      } else {
        alert("Could not generate download link. Please try again.");
      }
    } finally { setDownloadingId(null); }
  }

  return (
    <div className="max-w-3xl space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm font-mono px-4 py-2.5 rounded-md shadow-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />{toast}
        </div>
      )}

      <div className="page-header">
        <div>
          <Link href="/supplier-management/document-requirements" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
            <ArrowLeft className="w-3.5 h-3.5" /> Document Requirements
          </Link>
          <h1 className="page-title">Form Templates</h1>
          <p className="page-subtitle">Blank reusable forms linked to document requirements</p>
        </div>
        {isAdmin && !adding && (
          <button onClick={() => setAdding(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Form Template
          </button>
        )}
      </div>

      {/* Add form */}
      {adding && (
        <form onSubmit={handleAdd} className="card p-6 space-y-4 border-l-4 border-[#D64D4D]">
          <h3 className="font-semibold text-gray-900 text-sm">New Form Template</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Template Name <span className="text-red-500">*</span></label>
              <input
                className="input"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="e.g. Supplier Food Safety Agreement"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Description</label>
              <input
                className="input"
                value={addDescription}
                onChange={(e) => setAddDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Link to Requirement</label>
              <select className="input" value={addReqId} onChange={(e) => setAddReqId(e.target.value)}>
                <option value="">— Not linked —</option>
                {availableRequirements.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">Only requirements without an existing template are shown.</p>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">File <span className="text-red-500">*</span> <span className="text-gray-400">(PDF or DOCX, max 10 MB)</span></label>
              <input
                ref={addFileRef}
                type="file"
                accept=".pdf,.doc,.docx"
                className="input text-sm py-1.5"
                required
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => { setAdding(false); setAddName(""); setAddDescription(""); setAddReqId(""); }} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
              {saving ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Uploading…</> : <><Upload className="w-3.5 h-3.5" />Upload</>}
            </button>
          </div>
        </form>
      )}

      {/* Template list */}
      {loading ? (
        <div className="card p-12 flex items-center justify-center gap-2 text-gray-400 font-mono text-sm">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-[#D64D4D] rounded-full animate-spin" />
          Loading…
        </div>
      ) : templates.length === 0 ? (
        <div className="card p-12 flex flex-col items-center justify-center text-gray-400 gap-2">
          <FileText className="w-8 h-8" />
          <p className="text-sm">No form templates uploaded yet.</p>
          {isAdmin && <p className="text-xs">Click "Add Form Template" to get started.</p>}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-gray-900 text-sm">Active Templates ({templates.length})</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {templates.map((tpl) => (
              <div key={tpl.id} className="px-6 py-4">
                {editingId === tpl.id ? (
                  /* Edit metadata inline */
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-xs text-gray-500 mb-1">Name</label>
                        <input className="input text-sm" value={editName} onChange={(e) => setEditName(e.target.value)} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs text-gray-500 mb-1">Description</label>
                        <input className="input text-sm" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Optional description" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs text-gray-500 mb-1">Link to Requirement</label>
                        <select className="input text-sm" value={editReqId} onChange={(e) => setEditReqId(e.target.value)}>
                          <option value="">— Not linked —</option>
                          {availableReqsForEdit(tpl.requirementId).map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditingId(null)} className="btn-secondary text-xs py-1">Cancel</button>
                      <button onClick={() => handleEditSave(tpl.id)} disabled={editSaving} className="btn-primary text-xs py-1 disabled:opacity-60">
                        {editSaving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                ) : replacingId === tpl.id ? (
                  /* Replace file inline */
                  <div className="space-y-3">
                    <p className="text-sm text-gray-700 font-medium">Replace file for <span className="italic">{tpl.name}</span></p>
                    <input
                      ref={replaceFileRef}
                      type="file"
                      accept=".pdf,.doc,.docx"
                      className="input text-sm py-1.5"
                      onChange={(e) => setReplaceFile(e.target.files?.[0] ?? null)}
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => { setReplacingId(null); setReplaceFile(null); }} className="btn-secondary text-xs py-1">Cancel</button>
                      <button onClick={() => handleReplace(tpl.id)} disabled={!replaceFile || replaceSaving} className="btn-primary text-xs py-1 disabled:opacity-60">
                        {replaceSaving ? "Uploading…" : <><Upload className="w-3 h-3" />Replace</>}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Normal row */
                  <div className="flex items-start gap-3">
                    <FileText className="w-5 h-5 text-gray-300 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-900">{tpl.name}</p>
                        {tpl.requirement ? (
                          <span className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                            <Link2 className="w-3 h-3" /> {tpl.requirement.name}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Not linked</span>
                        )}
                      </div>
                      {tpl.description && <p className="text-xs text-gray-500 mt-0.5">{tpl.description}</p>}
                      <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                        <span>{tpl.fileName}</span>
                        {tpl.fileSize && <span>{formatFileSize(tpl.fileSize)}</span>}
                        <span>Uploaded {formatDate(tpl.uploadedAt)} by {tpl.uploadedBy.name}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleDownload(tpl.id)}
                        disabled={downloadingId === tpl.id}
                        title="Download template"
                        className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100 disabled:opacity-40"
                      >
                        {downloadingId === tpl.id
                          ? <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                          : <Download className="w-3.5 h-3.5" />}
                      </button>
                      {isAdmin && (
                        <>
                          <button
                            onClick={() => { setEditingId(tpl.id); setEditName(tpl.name); setEditDescription(tpl.description ?? ""); setEditReqId(tpl.requirementId ?? ""); }}
                            title="Edit name / link"
                            className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setReplacingId(tpl.id)}
                            title="Replace file"
                            className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100"
                          >
                            <Upload className="w-3.5 h-3.5" />
                          </button>
                          {tpl.requirementId && (
                            <button
                              onClick={() => handleUnlink(tpl.id)}
                              title="Remove requirement link"
                              className="p-1.5 text-gray-400 hover:text-amber-600 rounded hover:bg-amber-50"
                            >
                              <Link2Off className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(tpl.id, tpl.name)}
                            title="Delete template"
                            className="p-1.5 text-gray-300 hover:text-[#D64D4D] rounded hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
