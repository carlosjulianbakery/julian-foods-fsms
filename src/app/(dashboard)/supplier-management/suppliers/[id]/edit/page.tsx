"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";


interface Material {
  id: string;
  name: string;
  category: string;
}

export default function EditSupplierPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isSystemLocked, setIsSystemLocked] = useState(false);
  const [form, setForm] = useState({
    name: "",
    contactName: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
    isActive: true,
    materialIds: [] as string[],
    supplierType: "ingredient",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([
      fetch(`/api/supplier-management/suppliers/${params.id}`).then((r) => r.json()),
      fetch("/api/supplier-management/materials").then((r) => r.json()),
    ]).then(([sup, mats]) => {
      setMaterials(mats);
      setIsSystemLocked(sup.isSystemLocked ?? false);
      setForm({
        name: sup.name ?? "",
        contactName: sup.contactName ?? "",
        email: sup.email ?? "",
        phone: sup.phone ?? "",
        address: sup.address ?? "",
        notes: sup.notes ?? "",
        isActive: sup.isActive ?? true,
        materialIds: (sup.materials ?? []).map((m: { material: Material }) => m.material.id),
        supplierType: sup.supplierType ?? "ingredient",
      });
    }).finally(() => setLoading(false));
  }, [params.id]);

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required";
    return e;
  }

  function toggleMaterial(id: string) {
    setForm((f) => ({
      ...f,
      materialIds: f.materialIds.includes(id)
        ? f.materialIds.filter((m) => m !== id)
        : [...f.materialIds, id],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/supplier-management/suppliers/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        router.push(`/supplier-management/suppliers/${params.id}`);
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error ?? "Failed to update supplier.");
      }
    } catch { alert("An unexpected error occurred."); }
    finally { setSaving(false); }
  }

  if (loading) {
    return (
      <div className="card p-12 flex items-center justify-center gap-2 text-gray-400 font-mono text-sm">
        <div className="w-4 h-4 border-2 border-gray-300 border-t-[#D64D4D] rounded-full animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="page-header">
        <div>
          <Link href={`/supplier-management/suppliers/${params.id}`} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Supplier
          </Link>
          <h1 className="page-title">Edit Supplier</h1>
        </div>
      </div>

      {isSystemLocked && (
        <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700 flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          This is a system-managed supplier record and cannot be edited.
        </div>
      )}

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {/* Supplier Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <select
            className="input"
            value={form.supplierType}
            onChange={(e) => setForm((f) => ({ ...f, supplierType: e.target.value }))}
            disabled={isSystemLocked}
          >
            <option value="ingredient">Ingredient Supplier</option>
            <option value="packaging">Packaging Supplier</option>
            <option value="other">Other</option>
            <option value="internal">Internal (Julian Bakery)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Name <span className="text-red-500">*</span></label>
          <input className={`input ${errors.name ? "border-red-400" : ""}`} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} disabled={isSystemLocked} />
          {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
            <input className="input" value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" className="input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input className="input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <input className="input" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea className="input min-h-[80px] resize-y" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>

        {materials.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Supplied Materials</label>
            <div className="border border-gray-200 rounded-md divide-y divide-gray-100 max-h-48 overflow-y-auto">
              {materials.map((m) => (
                <label key={m.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.materialIds.includes(m.id)}
                    onChange={() => toggleMaterial(m.id)}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-800">{m.name}</span>
                  <span className="text-xs text-gray-400 ml-auto">{m.category}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <input type="checkbox" id="isActive" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="w-4 h-4 rounded border-gray-300" />
          <label htmlFor="isActive" className="text-sm text-gray-700">Active (visible in supplier list)</label>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Link href={`/supplier-management/suppliers/${params.id}`} className="btn-secondary">Cancel</Link>
          {!isSystemLocked && (
            <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
              {saving ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Saving…</> : <><Save className="w-4 h-4" />Save Changes</>}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
