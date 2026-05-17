export const dynamic = "force-dynamic";
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Save, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toaster";

const RECORD_TYPES = [
  "Temperature Log",
  "Sanitation Report",
  "Incident Report",
  "Supplier Audit",
  "HACCP Record",
  "Training Record",
  "Equipment Maintenance",
  "Corrective Action",
  "Other",
];

interface Field { key: string; value: string; }

export default function NewRecordPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [form, setForm] = useState({
    title: "",
    type: RECORD_TYPES[0],
    description: "",
    tags: "",
  });
  const [fields, setFields] = useState<Field[]>([{ key: "", value: "" }]);
  const [saving, setSaving] = useState(false);

  function onChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function addField() {
    setFields((prev) => [...prev, { key: "", value: "" }]);
  }

  function updateField(idx: number, patch: Partial<Field>) {
    setFields((prev) => prev.map((f, i) => i === idx ? { ...f, ...patch } : f));
  }

  function removeField(idx: number) {
    setFields((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title) { toast("Title is required.", "error"); return; }
    const data = Object.fromEntries(
      fields.filter((f) => f.key.trim()).map((f) => [f.key.trim(), f.value])
    );
    const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);

    setSaving(true);
    try {
      const res = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, tags, data }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast("Record saved!", "success");
      router.push("/records");
    } catch (err: any) {
      toast(err.message ?? "Failed to save record.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/records" className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="page-title">New Record</h1>
          <p className="page-subtitle">Document a food safety event or log</p>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Record Details</h2>

        <div>
          <label className="label">Title *</label>
          <input name="title" className="input" placeholder="e.g. Walk-in Cooler Temperature — May 15" value={form.title} onChange={onChange} required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Record Type</label>
            <select name="type" className="input" value={form.type} onChange={onChange}>
              {RECORD_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Tags (comma-separated)</label>
            <input name="tags" className="input" placeholder="e.g. walk-in, cooler, temp" value={form.tags} onChange={onChange} />
          </div>
        </div>

        <div>
          <label className="label">Description</label>
          <textarea name="description" className="input resize-none" rows={2} placeholder="Additional context" value={form.description} onChange={onChange} />
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Data Fields</h2>
        <p className="text-sm text-gray-500">Add key-value pairs to store structured data for this record.</p>

        {fields.map((field, idx) => (
          <div key={idx} className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="Field name"
              value={field.key}
              onChange={(e) => updateField(idx, { key: e.target.value })}
            />
            <input
              className="input flex-1"
              placeholder="Value"
              value={field.value}
              onChange={(e) => updateField(idx, { value: e.target.value })}
            />
            <button
              type="button"
              onClick={() => removeField(idx)}
              className="p-2 text-red-400 hover:text-red-600"
              disabled={fields.length === 1}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        <button type="button" onClick={addField} className="text-sm text-brand-600 hover:underline flex items-center gap-1">
          <Plus className="w-4 h-4" /> Add field
        </button>
      </div>

      <div className="flex gap-3 justify-end">
        <Link href="/records" className="btn-secondary">Cancel</Link>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save Record</>}
        </button>
      </div>
    </form>
  );
}
