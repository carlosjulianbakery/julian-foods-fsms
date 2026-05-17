"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send, Loader2, Thermometer } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toaster";

interface FormField {
  id: string;
  type: string;
  label: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
  min?: number;
  max?: number;
  unit?: string;
}

interface FormData {
  id: string;
  title: string;
  description?: string | null;
  category: string;
  fields: FormField[] | unknown;
  createdBy: { name: string };
}

export function DynamicFormRenderer({ form, taskId }: { form: FormData; taskId?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const fields = form.fields as FormField[];
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function setValue(id: string, value: unknown) {
    setValues((prev) => ({ ...prev, [id]: value }));
    if (errors[id]) setErrors((prev) => ({ ...prev, [id]: "" }));
  }

  function validate() {
    const errs: Record<string, string> = {};
    for (const field of fields) {
      if (field.required && !values[field.id] && values[field.id] !== 0) {
        errs[field.id] = `${field.label} is required.`;
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/forms/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formId: form.id, data: values, notes, taskId }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast("Form submitted successfully!", "success");
      router.push("/forms");
    } catch (err: any) {
      toast(err.message ?? "Submission failed.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  function renderField(field: FormField) {
    const error = errors[field.id];
    const baseClass = `input ${error ? "border-red-400 focus:ring-red-400" : ""}`;

    switch (field.type) {
      case "text":
        return (
          <input
            className={baseClass}
            placeholder={field.placeholder}
            value={(values[field.id] as string) ?? ""}
            onChange={(e) => setValue(field.id, e.target.value)}
          />
        );
      case "textarea":
        return (
          <textarea
            className={`${baseClass} resize-none`}
            rows={3}
            placeholder={field.placeholder}
            value={(values[field.id] as string) ?? ""}
            onChange={(e) => setValue(field.id, e.target.value)}
          />
        );
      case "number":
        return (
          <input
            type="number"
            className={baseClass}
            min={field.min}
            max={field.max}
            value={(values[field.id] as string) ?? ""}
            onChange={(e) => setValue(field.id, e.target.valueAsNumber)}
          />
        );
      case "temperature":
        return (
          <div className="relative">
            <Thermometer className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="number"
              step="0.1"
              className={`${baseClass} pl-9`}
              min={field.min}
              max={field.max}
              value={(values[field.id] as string) ?? ""}
              onChange={(e) => setValue(field.id, e.target.valueAsNumber)}
            />
            {field.unit && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                {field.unit}
              </span>
            )}
          </div>
        );
      case "select":
        return (
          <select
            className={baseClass}
            value={(values[field.id] as string) ?? ""}
            onChange={(e) => setValue(field.id, e.target.value)}
          >
            <option value="">— Select —</option>
            {field.options?.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );
      case "checkbox":
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-brand-600"
              checked={(values[field.id] as boolean) ?? false}
              onChange={(e) => setValue(field.id, e.target.checked)}
            />
            <span className="text-sm text-gray-700">Yes / Confirmed</span>
          </label>
        );
      case "date":
        return (
          <input
            type="date"
            className={baseClass}
            value={(values[field.id] as string) ?? ""}
            onChange={(e) => setValue(field.id, e.target.value)}
          />
        );
      case "time":
        return (
          <input
            type="time"
            className={baseClass}
            value={(values[field.id] as string) ?? ""}
            onChange={(e) => setValue(field.id, e.target.value)}
          />
        );
      default:
        return <input className={baseClass} value={(values[field.id] as string) ?? ""} onChange={(e) => setValue(field.id, e.target.value)} />;
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/forms" className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="page-title">{form.title}</h1>
          <p className="page-subtitle">{form.category} · by {form.createdBy.name}</p>
        </div>
      </div>

      {form.description && (
        <div className="card p-4 bg-blue-50 border-blue-200">
          <p className="text-sm text-blue-800">{form.description}</p>
        </div>
      )}

      <div className="card p-6 space-y-5">
        {fields.map((field) => (
          <div key={field.id}>
            <label className="label">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            {renderField(field)}
            {errors[field.id] && (
              <p className="text-xs text-red-600 mt-1">{errors[field.id]}</p>
            )}
          </div>
        ))}
      </div>

      <div className="card p-6">
        <label className="label">Additional Notes</label>
        <textarea
          className="input resize-none"
          rows={3}
          placeholder="Any observations or comments…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="flex gap-3 justify-end">
        <Link href="/forms" className="btn-secondary">Cancel</Link>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
          ) : (
            <><Send className="w-4 h-4" /> Submit Form</>
          )}
        </button>
      </div>
    </form>
  );
}
