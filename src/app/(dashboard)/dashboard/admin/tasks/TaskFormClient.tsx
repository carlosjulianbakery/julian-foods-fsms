"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getNextNDueDates, formatTaskDate } from "@/lib/tasks";
import { toInputDate } from "@/lib/dateUtils";

type User = { id: string; name: string; role: string };
type Supplier = { id: string; name: string };
type Requirement = { id: string; name: string };

type TemplateData = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  assignedTo: string[];
  taskType: string;
  formLink: Record<string, unknown> | null;
  recurrenceType: string;
  recurrenceConfig: Record<string, unknown> | null;
  firstDueDate: string;
  isActive: boolean;
};

type Props = {
  mode: "create" | "edit";
  template?: TemplateData;
  users: User[];
  suppliers: Supplier[];
  requirements: Requirement[];
};

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const RECURRENCE_OPTIONS = [
  { value: "one_time", label: "One-Time" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 Weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "every_2_months", label: "Every 2 Months" },
  { value: "quarterly", label: "Quarterly" },
  { value: "every_6_months", label: "Every 6 Months" },
  { value: "annual", label: "Annual" },
  { value: "custom", label: "Custom" },
];

const FORM_TYPE_OPTIONS = [
  { value: "pre_op", label: "Pre-Op Inspection" },
  { value: "batch_sheet", label: "Batch Sheet" },
  { value: "daily_cleaning", label: "Daily Cleaning Checklist" },
  { value: "monthly_cleaning", label: "Monthly Cleaning Checklist" },
  { value: "receiving", label: "Receiving Record" },
  { value: "supplier_document", label: "Supplier Compliance Document" },
];

export function TaskFormClient({ mode, template, users, suppliers, requirements }: Props) {
  const router = useRouter();

  const t = template;

  const [title, setTitle] = useState(t?.title ?? "");
  const [description, setDescription] = useState(t?.description ?? "");
  const [category, setCategory] = useState(t?.category ?? "");
  const [priority, setPriority] = useState(t?.priority ?? "normal");
  const [assignedTo, setAssignedTo] = useState<string[]>(t?.assignedTo ?? []);
  const [taskType, setTaskType] = useState<"manual" | "form_linked">(
    (t?.taskType as "manual" | "form_linked") ?? "manual"
  );
  const [formType, setFormType] = useState(
    (t?.formLink as any)?.form_type ?? ""
  );
  const [supplierId, setSupplierId] = useState(
    (t?.formLink as any)?.supplier_id ?? ""
  );
  const [supplierSearch, setSupplierSearch] = useState(() => {
    const sid = (t?.formLink as any)?.supplier_id;
    if (!sid) return "";
    return suppliers.find((s) => s.id === sid)?.name ?? "";
  });
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);
  const [requirementId, setRequirementId] = useState(
    (t?.formLink as any)?.requirement_id ?? ""
  );
  const [recurrenceType, setRecurrenceType] = useState(t?.recurrenceType ?? "one_time");
  const [weeklyDays, setWeeklyDays] = useState<number[]>(() => {
    const cfg = t?.recurrenceConfig as any;
    return cfg?.days_of_week ?? [];
  });
  const [customMode, setCustomMode] = useState<"interval" | "calendar">(() => {
    const cfg = t?.recurrenceConfig as any;
    return cfg?.day_of_month !== undefined ? "calendar" : "interval";
  });
  const [customIntervalValue, setCustomIntervalValue] = useState<number>(() => {
    const cfg = t?.recurrenceConfig as any;
    return cfg?.interval_value ?? 1;
  });
  const [customIntervalType, setCustomIntervalType] = useState<"days" | "weeks" | "months">(() => {
    const cfg = t?.recurrenceConfig as any;
    return cfg?.interval_type ?? "days";
  });
  const [customDayOfMonth, setCustomDayOfMonth] = useState<number>(() => {
    const cfg = t?.recurrenceConfig as any;
    return cfg?.day_of_month ?? 1;
  });
  const [firstDueDate, setFirstDueDate] = useState(() => {
    if (t?.firstDueDate) {
      return toInputDate(t.firstDueDate);
    }
    return "";
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  function buildRecurrenceConfig(): Record<string, unknown> | null {
    if (recurrenceType === "weekly") {
      return { days_of_week: weeklyDays };
    }
    if (recurrenceType === "custom") {
      if (customMode === "calendar") {
        return { day_of_month: customDayOfMonth, interval_type: "calendar" };
      }
      return { interval_value: customIntervalValue, interval_type: customIntervalType };
    }
    return null;
  }

  function buildFormLink(): Record<string, unknown> | null {
    if (taskType !== "form_linked" || !formType) return null;
    const fl: Record<string, unknown> = { form_type: formType };
    if (formType === "supplier_document") {
      if (supplierId) fl.supplier_id = supplierId;
      if (requirementId) fl.requirement_id = requirementId;
    }
    return fl;
  }

  const dueDatePreview = useMemo(() => {
    if (!firstDueDate || recurrenceType === "one_time") return [];
    try {
      const d = new Date(firstDueDate + "T00:00:00Z");
      const cfg = buildRecurrenceConfig();
      return getNextNDueDates(d, recurrenceType, cfg, 3).map(formatTaskDate);
    } catch {
      return [];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstDueDate, recurrenceType, weeklyDays, customMode, customIntervalValue, customIntervalType, customDayOfMonth]);

  function toggleDay(day: number) {
    setWeeklyDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function toggleUser(id: string) {
    setAssignedTo((prev) =>
      prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (recurrenceType === "weekly" && weeklyDays.length === 0) {
      setError("Please select at least one day for weekly recurrence.");
      return;
    }
    if (assignedTo.length === 0) {
      setError("Please assign this task to at least one user.");
      return;
    }

    const payload = {
      title,
      description: description || null,
      category,
      priority,
      assignedTo,
      taskType,
      formLink: buildFormLink(),
      recurrenceType,
      recurrenceConfig: buildRecurrenceConfig(),
      firstDueDate,
    };

    setSubmitting(true);
    try {
      const url = mode === "create"
        ? "/api/tasks/templates"
        : `/api/tasks/templates/${t!.id}`;
      const method = mode === "create" ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save task.");

      const firstDue = data.instance?.dueDate
        ? formatTaskDate(new Date(data.instance.dueDate))
        : firstDueDate
          ? formatTaskDate(new Date(firstDueDate + "T00:00:00Z"))
          : "";

      setSuccessMsg(
        mode === "create"
          ? `Task created. First occurrence due ${firstDue}.`
          : "Task updated successfully."
      );

      setTimeout(() => router.push("/dashboard/admin/tasks"), 1500);
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  const filteredSuppliers = suppliers.filter((s) =>
    s.name.toLowerCase().includes(supplierSearch.toLowerCase())
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Section 1: Task Details */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wide font-mono">Task Details</h2>

        <div>
          <label className="label">Title <span className="text-red-500">*</span></label>
          <input
            className="input"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Daily Sanitation Walkthrough"
          />
        </div>

        <div>
          <label className="label">Description</label>
          <textarea
            className="input resize-none"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add instructions, context, or any relevant details..."
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Category <span className="text-red-500">*</span></label>
            <select
              className="input"
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Select category…</option>
              <option value="sanitation">Sanitation</option>
              <option value="inspection">Inspection</option>
              <option value="production">Production</option>
              <option value="receiving_inventory">Receiving &amp; Inventory</option>
              <option value="documentation_compliance">Documentation &amp; Compliance</option>
              <option value="facility_maintenance">Facility &amp; Maintenance</option>
              <option value="administrative">Administrative</option>
            </select>
          </div>

          <div>
            <label className="label">Priority</label>
            <div className="flex gap-1 mt-1">
              {(["low", "normal", "high"] as const).map((p) => {
                const activeClass =
                  p === "high" ? "bg-red-100 text-red-700 border-red-200"
                    : p === "normal" ? "bg-gray-700 text-white border-gray-700"
                      : "bg-blue-100 text-blue-700 border-blue-200";
                const inactiveClass = "bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200";
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`flex-1 py-1.5 text-xs font-medium rounded border transition-colors capitalize ${
                      priority === p ? activeClass : inactiveClass
                    }`}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Assignment */}
      <div className="card p-6 space-y-3">
        <div>
          <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wide font-mono">Assignment</h2>
          <p className="text-xs text-gray-500 mt-0.5">First person to complete or skip counts for this task.</p>
        </div>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {users.map((u) => {
            const selected = assignedTo.includes(u.id);
            return (
              <label
                key={u.id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                  selected ? "bg-brand-50 border border-brand-200" : "hover:bg-gray-50 border border-transparent"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleUser(u.id)}
                  className="w-4 h-4 accent-[#D64D4D]"
                />
                <span className="flex-1 text-sm font-medium text-gray-800">{u.name}</span>
                <span className={`badge text-[10px] ${
                  u.role === "ADMIN" ? "bg-red-100 text-red-700"
                    : "bg-amber-100 text-amber-700"
                }`}>
                  {u.role}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Section 3: Task Type */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wide font-mono">Task Type</h2>
        <div className="flex gap-1">
          {(["manual", "form_linked"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setTaskType(type)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                taskType === type
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {type === "manual" ? "Manual To-Do" : "Linked to Form"}
            </button>
          ))}
        </div>

        {taskType === "form_linked" && (
          <div className="space-y-3">
            <div>
              <label className="label">Form Type</label>
              <select
                className="input"
                value={formType}
                onChange={(e) => { setFormType(e.target.value); setSupplierId(""); setSupplierSearch(""); setRequirementId(""); }}
              >
                <option value="">Select form type…</option>
                {FORM_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {formType === "supplier_document" && (
              <>
                <div className="relative">
                  <label className="label">Supplier</label>
                  <input
                    className="input"
                    placeholder="Search suppliers…"
                    value={supplierSearch}
                    onChange={(e) => { setSupplierSearch(e.target.value); setSupplierDropdownOpen(true); setSupplierId(""); }}
                    onFocus={() => setSupplierDropdownOpen(true)}
                  />
                  {supplierDropdownOpen && supplierSearch && filteredSuppliers.length > 0 && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setSupplierDropdownOpen(false)} />
                      <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {filteredSuppliers.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                            onClick={() => { setSupplierId(s.id); setSupplierSearch(s.name); setSupplierDropdownOpen(false); }}
                          >
                            {s.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div>
                  <label className="label">Document Type</label>
                  <select
                    className="input"
                    value={requirementId}
                    onChange={(e) => setRequirementId(e.target.value)}
                  >
                    <option value="">Any document type</option>
                    {requirements.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <p className="text-xs text-gray-500">
              This task will auto-complete when the assigned user submits the selected form.
            </p>
          </div>
        )}
      </div>

      {/* Section 4: Schedule */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wide font-mono">Schedule</h2>

        <div>
          <label className="label">Recurrence</label>
          <select
            className="input"
            value={recurrenceType}
            onChange={(e) => setRecurrenceType(e.target.value)}
          >
            {RECURRENCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {recurrenceType === "weekly" && (
          <div>
            <label className="label">Days of Week</label>
            <div className="flex gap-1.5 flex-wrap">
              {DAYS.map((day, i) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`w-9 h-9 text-xs font-semibold rounded-full border transition-colors ${
                    weeklyDays.includes(i)
                      ? "bg-[#D64D4D] text-white border-[#D64D4D]"
                      : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
            {weeklyDays.length === 0 && (
              <p className="text-xs text-red-500 mt-1">At least one day is required.</p>
            )}
          </div>
        )}

        {recurrenceType === "custom" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCustomMode("interval")}
                className={`flex-1 py-1.5 text-sm rounded-lg border transition-colors ${
                  customMode === "interval" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
              >
                Every X days/weeks/months
              </button>
              <button
                type="button"
                onClick={() => setCustomMode("calendar")}
                className={`flex-1 py-1.5 text-sm rounded-lg border transition-colors ${
                  customMode === "calendar" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
              >
                Specific day of month
              </button>
            </div>

            {customMode === "interval" && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Every</span>
                <input
                  type="number"
                  min={1}
                  className="input w-20"
                  value={customIntervalValue}
                  onChange={(e) => setCustomIntervalValue(Math.max(1, parseInt(e.target.value) || 1))}
                />
                <select
                  className="input flex-1"
                  value={customIntervalType}
                  onChange={(e) => setCustomIntervalType(e.target.value as "days" | "weeks" | "months")}
                >
                  <option value="days">Days</option>
                  <option value="weeks">Weeks</option>
                  <option value="months">Months</option>
                </select>
              </div>
            )}

            {customMode === "calendar" && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">On the</span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  className="input w-20"
                  value={customDayOfMonth}
                  onChange={(e) => setCustomDayOfMonth(Math.min(31, Math.max(1, parseInt(e.target.value) || 1)))}
                />
                <span className="text-sm text-gray-600">of each month</span>
              </div>
            )}
          </div>
        )}

        <div>
          <label className="label">First Due Date <span className="text-red-500">*</span></label>
          <input
            type="date"
            className="input"
            required
            value={firstDueDate}
            onChange={(e) => setFirstDueDate(e.target.value)}
          />
        </div>

        {dueDatePreview.length > 1 && (
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-500">
              Next 3 occurrences:{" "}
              {dueDatePreview.map((d, i) => (
                <span key={i}>
                  <span className="font-medium text-gray-700">{d}</span>
                  {i < dueDatePreview.length - 1 && <span className="text-gray-300"> · </span>}
                </span>
              ))}
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-700">
          {successMsg}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="btn-primary"
        >
          {submitting ? "Saving…" : mode === "create" ? "Save Task" : "Update Task"}
        </button>
        <Link href="/dashboard/admin/tasks" className="btn-secondary">
          Cancel
        </Link>
      </div>
    </form>
  );
}
