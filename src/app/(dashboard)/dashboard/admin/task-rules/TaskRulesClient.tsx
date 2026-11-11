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
  productName: string | null;
  isActive: boolean;
  createdAt: string;
}

interface FacilityOption { id: string; name: string }
interface UserOption { id: string; name: string }
interface SyncStatus {
  facilityId: string;
  facilityName: string;
  lastSyncAt: string | null;
  lastSyncError: string | null;
}

interface RefreshFacilityResult {
  facilityId: string;
  facilityName: string;
  error?: string;
  daysFound: number;
  productionDaysFound: number;
  created: number;
  skipped: number;
  flagged: number;
}

interface RefreshResult {
  results: RefreshFacilityResult[];
  totalCreated: number;
  totalSkipped: number;
  totalFlagged: number;
}

interface Props {
  rules: Rule[];
  facilities: FacilityOption[];
  users: UserOption[];
  syncStatuses: SyncStatus[];
}

const FORM_KEYS = [
  { value: "", label: "— none —" },
  { value: "daily_cleaning", label: "Daily Cleaning" },
  { value: "preop", label: "Pre-Op Inspection" },
  { value: "monthly_cleaning", label: "Monthly Cleaning" },
  { value: "batch_sheet", label: "Batch Sheet" },
  { value: "receiving", label: "Receiving Record" },
];

function triggerLabel(rule: Rule): string {
  if (rule.triggerType === "ONE_OFF") return "One-off";
  if (rule.triggerType === "PRODUCTION_DAY") return "Production day";
  if (rule.triggerType === "PRODUCTION_PRODUCT")
    return rule.productName ? `Product: ${rule.productName}` : "Production product";
  const every = rule.recurrenceEvery ?? 1;
  const unit = rule.recurrenceUnit ?? "day";
  if (every === 1) return unit.charAt(0).toUpperCase() + unit.slice(1) + "ly";
  return `Every ${every} ${unit}s`;
}

function formatPT(isoString: string | null): string {
  if (!isoString) return "never";
  return new Date(isoString).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
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
  productName: "",
};

export function TaskRulesClient({ rules: initialRules, facilities, users, syncStatuses }: Props) {
  const router = useRouter();
  const [rules, setRules] = useState(initialRules);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<RefreshResult | null>(null);
  const [refreshDryRun, setRefreshDryRun] = useState(false);

  const staleSyncs = syncStatuses.filter((s) => {
    if (s.lastSyncError) return true;
    if (!s.lastSyncAt) return true;
    return Date.now() - new Date(s.lastSyncAt).getTime() > 24 * 60 * 60 * 1000;
  });

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
      productName: rule.productName ?? "",
    });
    setError("");
    setShowModal(true);
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        title: form.title,
        description: form.description,
        facilityId: form.facilityId,
        ownerId: form.ownerId,
        triggerType: form.triggerType,
        recurrenceUnit: form.triggerType === "RECURRING" ? form.recurrenceUnit : null,
        recurrenceEvery: form.triggerType === "RECURRING" ? form.recurrenceEvery : null,
        recurrenceStart: form.recurrenceStart,
        formKey: form.formKey || null,
        productName: form.triggerType === "PRODUCTION_PRODUCT" ? form.productName || null : null,
      };

      if (editingRule) {
        const res = await fetch(`/api/task-rules/${editingRule.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const d = await res.json(); setError(d.error ?? "Save failed"); return; }
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
        if (!res.ok) { const d = await res.json(); setError(d.error ?? "Save failed"); return; }
        const created = await res.json();
        setRules((prev) => [
          { ...created, facilityName: created.facility.name, ownerName: created.owner.name },
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
    } catch {}
  }

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshResult(null);
    try {
      const url = refreshDryRun ? "/api/task-rules/refresh?dryRun=true" : "/api/task-rules/refresh";
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      setRefreshResult(data as RefreshResult);
      if (!refreshDryRun) router.refresh();
    } catch {
      setRefreshResult(null);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <>
      {/* Stale sync warnings */}
      {staleSyncs.map((s) => (
        <div
          key={s.facilityId}
          className="mb-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-4 py-3 text-sm text-amber-800 dark:text-amber-200"
        >
          ⚠️ Calendar for <strong>{s.facilityName}</strong>{" "}
          {s.lastSyncError
            ? <>failed: {s.lastSyncError}. Last success: {formatPT(s.lastSyncAt)}</>
            : <>not refreshed since {formatPT(s.lastSyncAt)}</>}
        </div>
      ))}

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={refreshDryRun}
              onChange={(e) => setRefreshDryRun(e.target.checked)}
              className="rounded"
            />
            Dry run
          </label>
          <button onClick={handleRefresh} disabled={refreshing} className="btn-secondary text-sm">
            {refreshing ? "Refreshing…" : "Refresh calendar now"}
          </button>
        </div>
        <button onClick={openCreate} className="btn-primary">
          Create Rule
        </button>
      </div>

      {/* Refresh result */}
      {refreshResult && (
        <div className="mb-4 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-sm space-y-2">
          <div className="font-medium">
            Refresh result {refreshDryRun ? <span className="text-amber-600">(dry run — no changes written)</span> : ""}
          </div>
          {refreshResult.results.length === 0 ? (
            <p className="text-gray-500">No calendar-driven rules found.</p>
          ) : (
            refreshResult.results.map((r) => (
              <div key={r.facilityId}>
                <span className="font-medium">{r.facilityName}</span>
                {r.error ? (
                  <span className="ml-2 text-red-500">{r.error}</span>
                ) : (
                  <span className="ml-2 text-gray-600 dark:text-gray-300">
                    {r.daysFound} days in window ({r.productionDaysFound} with production) ·
                    created: {r.created} · system-skipped: {r.skipped} · flagged: {r.flagged}
                  </span>
                )}
              </div>
            ))
          )}
          <div className="text-gray-500 text-xs pt-1">
            Total — created: {refreshResult.totalCreated}, skipped: {refreshResult.totalSkipped}, flagged: {refreshResult.totalFlagged}
          </div>
        </div>
      )}

      {/* Table */}
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
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Trigger</th>
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
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{triggerLabel(rule)}</td>
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
                    <button onClick={() => openEdit(rule)} className="btn-secondary text-xs px-3 py-1">
                      Edit
                    </button>
                    <button onClick={() => handleToggle(rule)} className="btn-secondary text-xs px-3 py-1">
                      {rule.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit modal */}
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
                      <option key={f.id} value={f.id}>{f.name}</option>
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
                      <option key={u.id} value={u.id}>{u.name}</option>
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
                  <option value="RECURRING">Recurring (calendar-independent)</option>
                  <option value="ONE_OFF">One-off</option>
                  <option value="PRODUCTION_DAY">Production day (any production scheduled)</option>
                  <option value="PRODUCTION_PRODUCT">Production product (specific product name)</option>
                </select>
              </div>
              {form.triggerType === "PRODUCTION_PRODUCT" && (
                <div>
                  <label className="block text-sm font-medium mb-1">Product name to match *</label>
                  <input
                    className="input w-full"
                    placeholder="e.g. ProGranola — PB"
                    value={form.productName}
                    onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Case-insensitive substring match against the calendar product name.
                  </p>
                </div>
              )}
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
                    <option key={fk.value} value={fk.value}>{fk.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
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
