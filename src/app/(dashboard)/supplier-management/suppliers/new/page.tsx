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

export default function NewSupplierPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [form, setForm] = useState({
    name: "",
    manufacturerName: "",
    contactName: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
    materialIds: [] as string[],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/supplier-management/materials")
      .then((r) => r.json())
      .then(setMaterials)
      .catch(() => {});
  }, []);

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
      const res = await fetch("/api/supplier-management/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        router.push("/supplier-management/suppliers");
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error ?? "Failed to create supplier.");
      }
    } catch { alert("An unexpected error occurred."); }
    finally { setSaving(false); }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="page-header">
        <div>
          <Link href="/supplier-management/suppliers" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Suppliers
          </Link>
          <h1 className="page-title">New Supplier</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Name <span className="text-red-500">*</span></label>
          <input className={`input ${errors.name ? "border-red-400" : ""}`} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Acme Ingredients Inc." />
          {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturer / Brand Name</label>
          <input className="input" value={form.manufacturerName} onChange={(e) => setForm((f) => ({ ...f, manufacturerName: e.target.value }))} placeholder="e.g. Bob's Red Mill" />
          <p className="text-xs text-gray-400 mt-1">Fill in if the supplier distributes a brand under a different name.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
            <input className="input" value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} placeholder="John Smith" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" className="input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="contact@supplier.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input className="input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="(555) 000-0000" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <input className="input" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="123 Supplier St, City, State" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea className="input min-h-[80px] resize-y" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Any additional notes…" />
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

        <div className="flex justify-end gap-3 pt-2">
          <Link href="/supplier-management/suppliers" className="btn-secondary">Cancel</Link>
          <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
            {saving ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Saving…</> : <><Save className="w-4 h-4" />Create Supplier</>}
          </button>
        </div>
      </form>
    </div>
  );
}
