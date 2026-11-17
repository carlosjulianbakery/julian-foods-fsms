"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ChevronLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPacificToday } from "@/lib/pacific-time";
import { RecordsList624 } from "@/components/forms624/RecordsList624";
import { OkNotOkRow } from "@/components/forms624/OkNotOkRow";
import { FormHeader624 } from "@/components/forms624/FormHeader624";
import { exportFormPdf } from "@/components/forms624/pdfExport624";
import type { Inspection624, RowSnapshot } from "@/components/forms624/types";

// ─── PDF HTML builder ─────────────────────────────────────────────────────────

function buildPdfHtml(insp: Inspection624): string {
  const sections = Array.from(new Set(insp.rows.map(() => "")));
  const rows = insp.rows.map((r) => `
    <tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:6px 8px;font-size:12px">${r.label}</td>
      <td style="padding:6px 8px;text-align:center;font-size:12px;font-weight:600;color:${r.condition === "OK" ? "#059669" : r.condition === "NOT_OK" ? "#dc2626" : "#6b7280"}">
        ${r.condition === "NOT_OK" ? "Not OK" : r.condition}
      </td>
      <td style="padding:6px 8px;text-align:center;font-size:12px;font-family:monospace">${r.initials || "—"}</td>
      ${r.tempValue != null ? `<td style="padding:6px 8px;text-align:center;font-size:12px;font-family:monospace">${r.tempValue}°F</td>` : r.atpRlu != null ? `<td style="padding:6px 8px;text-align:center;font-size:12px;font-family:monospace">${r.atpRlu} RLU</td>` : "<td/>"}
      <td style="padding:6px 8px;font-size:11px;color:#374151">${r.correctiveAction || "—"}</td>
      <td style="padding:6px 8px;text-align:center;font-size:11px">${r.reInspected ? "✓" : r.condition === "NOT_OK" ? "⚠" : "—"}</td>
    </tr>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <style>
    body { font-family: Arial, sans-serif; padding: 32px; color: #111; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    p.sub { font-size: 12px; color: #6b7280; margin: 0 0 16px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 6px 8px; font-size: 11px; color: #6b7280; text-transform: uppercase; border-bottom: 2px solid #e5e7eb; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; }
    .ok { background: #d1fae5; color: #065f46; }
    .issues { background: #fef3c7; color: #92400e; }
    .fail { background: #fee2e2; color: #991b1b; }
  </style></head><body>
  <h1>Pre-Op Inspection — 624 Facility</h1>
  <p class="sub">Date: ${insp.date} &nbsp;|&nbsp; Initials: ${insp.conductedBy} &nbsp;|&nbsp; Name: ${insp.submittedBy.name ?? "—"} &nbsp;|&nbsp; Submitted: ${new Date(insp.submittedAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}</p>
  <p class="sub">
    Overall: <span class="badge ${!insp.hasNotOk ? "ok" : insp.overallOk ? "issues" : "fail"}">${!insp.hasNotOk ? "All OK" : insp.overallOk ? "Issues — Corrected" : "Has Issues"}</span>
  </p>
  <table>
    <thead><tr><th>Item</th><th>Result</th><th>Init</th><th>Reading</th><th>Corrective Action</th><th>Re-insp</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  </body></html>`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PreOp624RecordsPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const today = getPacificToday();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);

  const [from, setFrom] = useState(thirtyDaysAgo);
  const [to, setTo] = useState(today);
  const [filterNotOk, setFilterNotOk] = useState<"" | "true" | "false">("");

  const [inspections, setInspections] = useState<Inspection624[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewTarget, setViewTarget] = useState<Inspection624 | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const role = (session?.user as { role?: string })?.role ?? "";
  const isAdmin = role === "ADMIN";

  useEffect(() => {
    if (authStatus === "loading") return;
    if (!session || !["SUPERVISOR", "ADMIN"].includes(role)) {
      router.replace("/dashboard");
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ from, to });
    if (filterNotOk) params.set("hasNotOk", filterNotOk);
    fetch(`/api/pre-op-624?${params}`)
      .then((r) => r.json())
      .then((data) => { setInspections(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [from, to, filterNotOk, session, authStatus, role, router]);

  async function handleDownload(insp: Inspection624) {
    setDownloadingId(insp.id);
    try {
      const html = buildPdfHtml(insp);
      await exportFormPdf(html, `preop-624-${insp.date}.pdf`);
    } catch (err) {
      console.error("PDF failed:", err);
      alert("PDF generation failed. Try again or check popup blocker.");
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDelete(insp: Inspection624) {
    if (!confirm(`Delete inspection from ${insp.date}? This cannot be undone.`)) return;
    setDeletingId(insp.id);
    try {
      const res = await fetch(`/api/pre-op-624/${insp.id}`, { method: "DELETE" });
      if (!res.ok) { alert("Delete failed."); return; }
      setInspections((prev) => prev.filter((i) => i.id !== insp.id));
    } catch {
      alert("Network error — could not delete.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-5xl space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <button
            onClick={() => router.push("/dashboard/supervisor/pre-op-624")}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 mb-1"
          >
            <ChevronLeft className="w-3 h-3" /> New inspection
          </button>
          <h1 className="page-title">Pre-Op Records — 624</h1>
          <p className="page-subtitle">Last 30 days by default. ADMIN only can delete.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
          <select
            value={filterNotOk}
            onChange={(e) => setFilterNotOk(e.target.value as "" | "true" | "false")}
            className="input text-sm"
          >
            <option value="">All</option>
            <option value="false">All OK only</option>
            <option value="true">Has issues</option>
          </select>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="card p-8 text-center text-gray-400 text-sm">Loading…</div>
      ) : (
        <RecordsList624
          inspections={inspections}
          isAdmin={isAdmin}
          onView={setViewTarget}
          onDownload={handleDownload}
          onDelete={handleDelete}
          downloadingId={downloadingId}
          deletingId={deletingId}
        />
      )}

      {/* View modal */}
      {viewTarget && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl my-8 space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg">Pre-Op Inspection — {viewTarget.date}</h2>
              <button onClick={() => setViewTarget(null)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <FormHeader624
              date={viewTarget.date}
              time={new Date(viewTarget.submittedAt).toLocaleTimeString("en-US", {
                timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit", hour12: false,
              })}
              initials={viewTarget.conductedBy}
              readOnly
            />

            <p className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium">Name:</span> {viewTarget.submittedBy.name ?? "—"}
            </p>

            <div className="space-y-2">
              {viewTarget.rows.map((row) => (
                <OkNotOkRow
                  key={row.key}
                  rowKey={row.key}
                  label={row.label}
                  condition={row.condition}
                  initials={row.initials}
                  correctiveAction={row.correctiveAction}
                  reInspected={row.reInspected}
                  reInspectedAt={row.reInspectedAt}
                  tempValue={row.tempValue}
                  tempLimit={row.tempLimit}
                  reInspectTempValue={row.reInspectTempValue}
                  atpRlu={row.atpRlu}
                  atpLimit={row.atpLimit}
                  readOnly
                />
              ))}
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => handleDownload(viewTarget)}
                disabled={downloadingId === viewTarget.id}
                className="btn btn-secondary"
              >
                {downloadingId === viewTarget.id ? "Generating…" : "Download PDF"}
              </button>
              <button onClick={() => setViewTarget(null)} className="btn btn-primary">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
