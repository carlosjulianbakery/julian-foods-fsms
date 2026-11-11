"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Rule {
  id: string;
  title: string;
  description: string | null;
  facilityId: string;
  facilityName: string;
  ownerId: string;
  ownerName: string;
  triggerType: string;
  recurrenceUnit: string | null;
  recurrenceEvery: number | null;
  recurrenceStart: string;
  formKey: string | null;
  isActive: boolean;
  createdAt: string;
}

interface FacilityOption {
  id: string;
  name: string;
}
interface UserOption {
  id: string;
  name: string;
}

interface Props {
  rules: Rule[];
  facilities: FacilityOption[];
  users: UserOption[];
}

const FORM_KEYS = [
  { value: "", label: "— none —" },
  { value: "daily_cleaning", label: "Daily Cleaning" },
  { value: "preop", label: "Pre-Op Inspection" },
  { value: "monthly_cleaning", label: "Monthly Cleaning" },
  { value: "batch_sheet", label: "Batch Sheet" },
  { value: "receiving", label: "Receiving Record" },
];

function recurrenceLabel(rule: Rule): string {
  if (rule.triggerType === "ONE_OFF") return "One-off";
  const every = rule.recurrenceEvery ?? 1;
  const unit = rule.recurrenceUnit ?? "day";
  if (every === 1) return unit.charAt(0).toUpperCase() + unit.slice(1) + "ly";
  return `Every ${every} ${unit}s`;
}

const emptyForm = {
  title: "",
  description: "",
  facilityId: "",
  ownerId: "",
  triggerType: "RECURRING",
  recurrenceUnit: "day",
  recurrenceEvery: 1,
  recurrenceStart: new Date().toISOString().slice(0, 10),
  formKey: "",
};

export function TaskRulesClient({ rules: initialRules, facilities, users }: Props) {
  const router = useRouter();
  const [rules, setRules] = useState(initialRules);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openCreate() {
    setEditingRule(null);
    setForm({ ...emptyForm, facilityId: facilities[0]?.id ?? "", ownerId: users[0]?.id ?? "" });
    setError("");
    setShowModal(true);
  }

  function openEdit(rule: Rule) {
    setEditingRule(rule);
    setForm({
      title: rule.title,
      description: rule.description ?? "",
      facilityId: rule.facilityId,
      ownerId: rule.ownerId,
      triggerType: rule.triggerType,
      recurrenceUnit: rule.recurrenceUnit ?? "day",
      recurrenceEvery: rule.recurrenceEvery ?? 1,
      recurrenceStart: rule.recurrenceStart,
      formKey: rule.formKey ?? "",
    });
    setError("");
    setShowModal(true);
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        recurrenceUnit: form.triggerType === "RECURRING" ? form.recurrenceUnit : null,
        recurrenceEvery: form.triggerType === "RECURRING" ? form.recurrenceEvery : null,
        formKey: form.formKey || null,
      };

      if (editingRule) {
        const res = await fetch(`/api/task-rules/${editingRule.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const d = await res.json();
          setError(d.error ?? "Save failed");
          return;
        }
        const updated = await res.json();
        setRules((prev) =>
          prev.map((r) =>
            r.id === updated.id
              ? { ...r, ...updated, facilityName: updated.facility.name, ownerName: updated.owner.name }
              : r
          )
        );
      } else {
        const res = await fetch("/api/task-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const d = await res.json();
          setError(d.error ?? "Save failed");
          return;
        }
        const created = await res.json();
        setRules((prev) => [
          {
            ...created,
            facilityName: created.facility.name,
            ownerName: created.owner.name,
            createdAt: created.createdAt,
          },
          ...prev,
        ]);
      }
      setShowModal(false);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(rule: Rule) {
    try {
      const res = await fetch(`/api/task-rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      if (!res.ok) return;
      const updated = await res.json();
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, isActive: updated.isActive } : r)));
      router.refresh();
    } catch {
      // non-critical toggle failure
    }
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <button onClick={openCreate} className="btn-primary">
          Create Rule
        </button>
      </div>

      {rules.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">
          No task rules yet. Create one to get started.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Title</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Facility</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Recurrence</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Starts</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Owner</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-medium">{rule.title}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{rule.facilityName}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{recurrenceLabel(rule)}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{rule.recurrenceStart}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{rule.ownerName}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        rule.isActive
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                          : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                      }`}
                    >
                      {rule.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      onClick={() => openEdit(rule)}
                      className="btn-secondary text-xs px-3 py-1"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleToggle(rule)}
                      className="btn-secondary text-xs px-3 py-1"
                    >
                      {rule.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold">
              {editingRule ? "Edit Task Rule" : "Create Task Rule"}
            </h2>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Title *</label>
                <input
                  className="input w-full"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  className="input w-full"
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Facility *</label>
                  <select
                    className="input w-full"
                    value={form.facilityId}
                    onChange={(e) => setForm((f) => ({ ...f, facilityId: e.target.value }))}
                  >
                    <option value="">Select…</option>
                    {facilities.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Owner *</label>
                  <select
                    className="input w-full"
                    value={form.ownerId}
                    onChange={(e) => setForm((f) => ({ ...f, ownerId: e.target.value }))}
                  >
                    <option value="">Select…</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Trigger Type</label>
                <select
                  className="input w-full"
                  value={form.triggerType}
                  onChange={(e) => setForm((f) => ({ ...f, triggerType: e.target.value }))}
                >
                  <option value="RECURRING">Recurring</option>
                  <option value="ONE_OFF">One-off</option>
                </select>
              </div>
              {form.triggerType === "RECURRING" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Every</label>
                    <input
                      type="number"
                      min={1}
                      className="input w-full"
                      value={form.recurrenceEvery}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, recurrenceEvery: parseInt(e.target.value) || 1 }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Unit</label>
                    <select
                      className="input w-full"
                      value={form.recurrenceUnit}
                      onChange={(e) => setForm((f) => ({ ...f, recurrenceUnit: e.target.value }))}
                    >
                      <option value="day">Day(s)</option>
                      <option value="week">Week(s)</option>
                      <option value="month">Month(s)</option>
                    </select>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">Start Date *</label>
                <input
                  type="date"
                  className="input w-full"
                  value={form.recurrenceStart}
                  onChange={(e) => setForm((f) => ({ ...f, recurrenceStart: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Linked Form</label>
                <select
                  className="input w-full"
                  value={form.formKey}
                  onChange={(e) => setForm((f) => ({ ...f, formKey: e.target.value }))}
                >
                  {FORM_KEYS.map((fk) => (
                    <option key={fk.value} value={fk.value}>
                      {fk.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowModal(false)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? "Saving…" : editingRule ? "Save Changes" : "Create Rule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
