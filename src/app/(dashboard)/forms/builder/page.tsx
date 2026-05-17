export const dynamic = "force-dynamic";
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, GripVertical, Save, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toaster";

type FieldType = "text" | "number" | "select" | "checkbox" | "textarea" | "date" | "time" | "temperature";

interface FormField {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
  min?: number;
  max?: number;
  unit?: string;
}

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "temperature", label: "Temperature" },
  { value: "textarea", label: "Text Area" },
  { value: "select", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
  { value: "date", label: "Date" },
  { value: "time", label: "Time" },
];

const CATEGORIES = [
  "Temperature Control",
  "Sanitation",
  "Pest Control",
  "Receiving",
  "HACCP",
  "Personnel Hygiene",
  "Equipment",
  "Other",
];

function uid() {
  return Math.random().toString(36).slice(2);
}

export default function FormBuilderPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [fields, setFields] = useState<FormField[]>([]);
  const [saving, setSaving] = useState(false);

  function addField(type: FieldType) {
    setFields((prev) => [
      ...prev,
      {
        id: uid(),
        type,
        label: `New ${FIELD_TYPES.find((f) => f.value === type)?.label ?? "Field"}`,
        required: false,
        options: type === "select" ? ["Option 1", "Option 2"] : undefined,
      },
    ]);
  }

  function updateField(id: string, patch: Partial<FormField>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  function removeField(id: string) {
    setFields((prev) => prev.filter((f) => f.id !== id));
  }

  function addOption(fieldId: string) {
    setFields((prev) =>
      prev.map((f) =>
        f.id === fieldId ? { ...f, options: [...(f.options ?? []), `Option ${(f.options?.length ?? 0) + 1}`] } : f
      )
    );
  }

  function updateOption(fieldId: string, idx: number, value: string) {
    setFields((prev) =>
      prev.map((f) => {
        if (f.id !== fieldId) return f;
        const options = [...(f.options ?? [])];
        options[idx] = value;
        return { ...f, options };
      })
    );
  }

  function removeOption(fieldId: string, idx: number) {
    setFields((prev) =>
      prev.map((f) => {
        if (f.id !== fieldId) return f;
        const options = [...(f.options ?? [])];
        options.splice(idx, 1);
        return { ...f, options };
      })
    );
  }

  async function handleSave() {
    if (!title) { toast("Form title is required.", "error"); return; }
    if (fields.length === 0) { toast("Add at least one field.", "error"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, category, fields }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast("Form created successfully!", "success");
      router.push("/forms");
    } catch (err: any) {
      toast(err.message ?? "Failed to save form.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link href="/forms" className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="page-title">Form Builder</h1>
            <p className="page-subtitle">Design a custom food safety form</p>
          </div>
        </div>
        <button onClick={handleSave} className="btn-primary" disabled={saving}>
          <Save className="w-4 h-4" />
          {saving ? "Saving…" : "Save Form"}
        </button>
      </div>

      {/* Form metadata */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Form Details</h2>
        <div>
          <label className="label">Form Title *</label>
          <input className="input" placeholder="e.g. Daily Temperature Log" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input resize-none" rows={2} placeholder="What is this form for?" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="label">Category</label>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Fields */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Form Fields</h2>

        {fields.length === 0 && (
          <div className="border-2 border-dashed border-gray-200 rounded-lg py-10 flex flex-col items-center text-gray-400">
            <p className="text-sm">No fields yet. Add one below.</p>
          </div>
        )}

        {fields.map((field, idx) => (
          <div key={field.id} className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
            <div className="flex items-center gap-2">
              <GripVertical className="w-4 h-4 text-gray-300 cursor-grab" />
              <span className="text-xs font-medium text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded">
                {FIELD_TYPES.find((t) => t.value === field.type)?.label}
              </span>
              <span className="text-xs text-gray-400">Field {idx + 1}</span>
              <button
                onClick={() => removeField(field.id)}
                className="ml-auto p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Label *</label>
                <input
                  className="input"
                  value={field.label}
                  onChange={(e) => updateField(field.id, { label: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Field Type</label>
                <select
                  className="input"
                  value={field.type}
                  onChange={(e) => updateField(field.id, { type: e.target.value as FieldType })}
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {(field.type === "text" || field.type === "textarea") && (
              <div>
                <label className="label">Placeholder</label>
                <input
                  className="input"
                  value={field.placeholder ?? ""}
                  onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                />
              </div>
            )}

            {(field.type === "number" || field.type === "temperature") && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Min</label>
                  <input type="number" className="input" value={field.min ?? ""} onChange={(e) => updateField(field.id, { min: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="label">Max</label>
                  <input type="number" className="input" value={field.max ?? ""} onChange={(e) => updateField(field.id, { max: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="label">Unit</label>
                  <input className="input" value={field.unit ?? (field.type === "temperature" ? "°C" : "")} onChange={(e) => updateField(field.id, { unit: e.target.value })} />
                </div>
              </div>
            )}

            {field.type === "select" && (
              <div>
                <label className="label">Options</label>
                <div className="space-y-1.5">
                  {(field.options ?? []).map((opt, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        className="input"
                        value={opt}
                        onChange={(e) => updateOption(field.id, i, e.target.value)}
                      />
                      <button
                        onClick={() => removeOption(field.id, i)}
                        className="p-2 text-red-400 hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => addOption(field.id)}
                    className="text-xs text-brand-600 hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add option
                  </button>
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => updateField(field.id, { required: e.target.checked })}
                className="w-4 h-4 accent-brand-600"
              />
              Required field
            </label>
          </div>
        ))}

        {/* Add field buttons */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Add field</p>
          <div className="flex flex-wrap gap-2">
            {FIELD_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => addField(t.value)}
                className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-700 hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700 transition-colors flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
