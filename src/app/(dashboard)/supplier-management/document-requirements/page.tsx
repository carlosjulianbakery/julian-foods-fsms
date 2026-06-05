"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Settings2, Plus, Save, Trash2, CheckCircle2, Lock, GripVertical } from "lucide-react";
import { getTriggerLabel } from "@/lib/document-trigger";

interface DocReq {
  id: string;
  name: string;
  description: string | null;
  requirementType: "ONE_TIME" | "ANNUAL";
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
  isSystemLocked: boolean;
  triggerType: string | null;
  triggerCondition: string | null;
  _count: { documents: number };
}

const EMPTY_FORM: { name: string; description: string; requirementType: "ANNUAL" | "ONE_TIME"; isRequired: boolean } = { name: "", description: "", requirementType: "ANNUAL", isRequired: true };

export default function DocumentRequirementsPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role ?? "";
  const isAdmin = role === "ADMIN";

  const [requirements, setRequirements] = useState<DocReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newForm, setNewForm] = useState<{ name: string; description: string; requirementType: "ANNUAL" | "ONE_TIME"; isRequired: boolean }>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<DocReq>>({});

  async function load() {
    setLoading(true);
    const res = await fetch("/api/supplier-management/document-requirements");
    if (res.ok) setRequirements(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newForm.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/supplier-management/document-requirements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newForm),
      });
      if (res.ok) {
        setNewForm(EMPTY_FORM);
        setAdding(false);
        showToast("Requirement added.");
        await load();
      } else {
        alert("Failed to add requirement.");
      }
    } finally { setSaving(false); }
  }

  async function handleUpdate(id: string) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/supplier-management/document-requirements/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        setEditingId(null);
        showToast("Saved.");
        await load();
      } else {
        alert("Failed to save.");
      }
    } finally { setSavingId(null); }
  }

  async function handleToggleActive(req: DocReq) {
    setSavingId(req.id);
    try {
      const res = await fetch(`/api/supplier-management/document-requirements/${req.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !req.isActive }),
      });
      if (res.ok) {
        showToast(req.isActive ? "Requirement deactivated." : "Requirement activated.");
        await load();
      }
    } finally { setSavingId(null); }
  }

  async function handleDelete(req: DocReq) {
    if (!confirm(`Delete "${req.name}"? ${req._count.documents > 0 ? "It has uploaded documents and will be deactivated instead." : ""}`)) return;
    setSavingId(req.id);
    try {
      const res = await fetch(`/api/supplier-management/document-requirements/${req.id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Requirement removed.");
        await load();
      }
    } finally { setSavingId(null); }
  }

  const systemRules = requirements.filter((r) => r.isSystemLocked);
  const customRules = requirements.filter((r) => !r.isSystemLocked);

  return (
    <div className="max-w-3xl space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm font-mono px-4 py-2.5 rounded-md shadow-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />{toast}
        </div>
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Document Requirements</h1>
          <p className="page-subtitle">Configure required compliance documents for all suppliers</p>
        </div>
      </div>

      {loading ? (
        <div className="card p-12 flex items-center justify-center gap-2 text-gray-400 font-mono text-sm">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-[#D64D4D] rounded-full animate-spin" />
          Loading…
        </div>
      ) : (
        <>
          {/* Section 1 — System Rules */}
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-2 mb-0.5">
                <Lock className="w-4 h-4 text-gray-400" />
                <h2 className="font-semibold text-gray-900 text-sm">System Rules — auto-applied based on material attributes</h2>
              </div>
              <p className="text-xs text-gray-500">These rules are automatically applied based on material attributes and cannot be modified.</p>
            </div>
            <div className="divide-y divide-gray-100">
              {systemRules.length === 0 && (
                <div className="px-6 py-8 text-sm text-gray-400 text-center">No system rules found. Run the v11 migration to seed them.</div>
              )}
              {systemRules.map((req, idx) => (
                <div key={req.id} className="flex items-center gap-4 px-6 py-3">
                  <span className="text-xs text-gray-400 font-mono w-5 shrink-0 text-right">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-900">{req.name}</p>
                      <span className="text-xs text-gray-400">{req.requirementType === "ANNUAL" ? "Annual" : "One-time"}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{getTriggerLabel(req.triggerType, req.triggerCondition)}</p>
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1 text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    <Lock className="w-3 h-3" /> Locked
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2 — Custom Rules */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 text-sm">Custom Rules</h2>
              {isAdmin && !adding && (
                <button onClick={() => setAdding(true)} className="btn-primary">
                  <Plus className="w-4 h-4" /> Add Requirement
                </button>
              )}
            </div>

            {/* Add form */}
            {adding && (
              <form onSubmit={handleAdd} className="card p-6 space-y-4 border-l-4 border-[#D64D4D]">
                <h3 className="font-semibold text-gray-900 text-sm">New Document Requirement</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Name <span className="text-red-500">*</span></label>
                    <input className="input" value={newForm.name} onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Certificate of Insurance" required />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Type</label>
                    <select className="input" value={newForm.requirementType} onChange={(e) => setNewForm((f) => ({ ...f, requirementType: e.target.value as "ANNUAL" | "ONE_TIME" }))}>
                      <option value="ANNUAL">Annual (renewal required)</option>
                      <option value="ONE_TIME">One-time</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2 pt-5">
                    <input type="checkbox" id="newRequired" checked={newForm.isRequired} onChange={(e) => setNewForm((f) => ({ ...f, isRequired: e.target.checked }))} className="w-4 h-4 rounded border-gray-300" />
                    <label htmlFor="newRequired" className="text-sm text-gray-700">Required for all suppliers</label>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Description</label>
                    <input className="input" value={newForm.description} onChange={(e) => setNewForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => { setAdding(false); setNewForm(EMPTY_FORM); }} className="btn-secondary">Cancel</button>
                  <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
                    {saving ? "Saving…" : "Add Requirement"}
                  </button>
                </div>
              </form>
            )}

            <div className="card divide-y divide-gray-100">
              {customRules.length === 0 && !adding && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <Settings2 className="w-8 h-8 mb-2" />
                  <p className="text-sm">No custom requirements configured yet.</p>
                </div>
              )}
              {customRules.map((req) => (
                <div key={req.id} className={`px-6 py-4 ${!req.isActive ? "opacity-50" : ""}`}>
                  {editingId === req.id ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="sm:col-span-2">
                          <input className="input text-sm" value={editForm.name ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                        </div>
                        <select className="input text-sm" value={editForm.requirementType ?? "ANNUAL"} onChange={(e) => setEditForm((f) => ({ ...f, requirementType: e.target.value as "ANNUAL" | "ONE_TIME" }))}>
                          <option value="ANNUAL">Annual</option>
                          <option value="ONE_TIME">One-time</option>
                        </select>
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input type="checkbox" checked={editForm.isRequired ?? false} onChange={(e) => setEditForm((f) => ({ ...f, isRequired: e.target.checked }))} className="w-4 h-4 rounded border-gray-300" />
                          Required
                        </label>
                        <div className="sm:col-span-2">
                          <input className="input text-sm" placeholder="Description" value={editForm.description ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditingId(null)} className="btn-secondary text-xs py-1">Cancel</button>
                        <button onClick={() => handleUpdate(req.id)} disabled={savingId === req.id} className="btn-primary text-xs py-1 disabled:opacity-60">
                          {savingId === req.id ? "Saving…" : <><Save className="w-3.5 h-3.5" />Save</>}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <GripVertical className="w-4 h-4 text-gray-300 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-gray-900">{req.name}</p>
                          {req.isRequired && <span className="text-xs text-red-500 font-medium">Required</span>}
                          <span className="text-xs text-gray-400">{req.requirementType === "ANNUAL" ? "Annual" : "One-time"}</span>
                          {!req.isActive && <span className="text-xs text-gray-400 italic">Inactive</span>}
                        </div>
                        {req.description && <p className="text-xs text-gray-500 mt-0.5">{req.description}</p>}
                        <p className="text-xs text-gray-400 mt-0.5">{req._count.documents} document{req._count.documents !== 1 ? "s" : ""} uploaded</p>
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => { setEditingId(req.id); setEditForm({ name: req.name, description: req.description ?? "", requirementType: req.requirementType, isRequired: req.isRequired }); }}
                            className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100"
                            title="Edit"
                          >
                            <Settings2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleToggleActive(req)} disabled={savingId === req.id} className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100 text-xs disabled:opacity-40" title={req.isActive ? "Deactivate" : "Activate"}>
                            {req.isActive ? "Off" : "On"}
                          </button>
                          <button onClick={() => handleDelete(req)} disabled={savingId === req.id} className="p-1.5 text-gray-300 hover:text-[#D64D4D] rounded hover:bg-red-50 disabled:opacity-40" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
