"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  FolderOpen,
  ChevronLeft,
  Download,
  Eye,
  X,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface IngredientRow {
  id: string;
  name: string;
  quantity_per_bowl: number;
  unit: string;
  total_quantity: number;
  supplier: string;
  lot_number: string;
}

interface Submission {
  id: string;
  date: string;
  shift: "AM" | "PM";
  productName: string;
  numberOfBowls: number;
  status: "PASS" | "FAIL" | "PASS_WITH_ISSUES";
  ingredients: IngredientRow[];
  notes: string | null;
  supervisorSignature: string | null;
  submittedAt: string;
  submittedBy: { name: string };
  template: { name: string };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function StatusBadge({ status }: { status: Submission["status"] }) {
  const config = {
    PASS:             { label: "Pass",            cls: "bg-emerald-100 text-emerald-800" },
    FAIL:             { label: "Fail",            cls: "bg-red-100 text-red-700" },
    PASS_WITH_ISSUES: { label: "Pass w/ Issues", cls: "bg-amber-100 text-amber-700" },
  }[status];
  return <span className={cn("badge", config.cls)}>{config.label}</span>;
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------
function downloadPDF(sub: Submission) {
  const date = new Date(sub.date).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const rowsHtml = sub.ingredients
    .map(
      (ing) => `
      <tr style="border-bottom:1px solid #E5E7EB">
        <td style="padding:5px 8px;font-size:11px;color:#374151">${ing.name}</td>
        <td style="padding:5px 8px;font-size:11px;color:#374151;text-align:center">${ing.quantity_per_bowl} ${ing.unit}</td>
        <td style="padding:5px 8px;font-size:11px;font-weight:600;color:#D64D4D;text-align:center">${ing.total_quantity} ${ing.unit}</td>
        <td style="padding:5px 8px;font-size:11px;color:#374151">${ing.supplier || "—"}</td>
        <td style="padding:5px 8px;font-size:11px;color:#374151;font-family:monospace">${ing.lot_number || "—"}</td>
      </tr>`
    )
    .join("");

  const statusLabel = { PASS: "PASS", FAIL: "FAIL", PASS_WITH_ISSUES: "PASS WITH ISSUES" }[sub.status];
  const statusColor = { PASS: "#059669", FAIL: "#D64D4D", PASS_WITH_ISSUES: "#D97706" }[sub.status];

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Batch Sheet — ${sub.productName} — ${date}</title>
<style>
  body { font-family: Georgia, serif; margin: 32px; color: #111827; }
  @media print { body { margin: 16px; } }
</style>
</head>
<body>
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;border-bottom:2px solid #D64D4D;padding-bottom:16px">
    <div style="width:40px;height:40px;background:#D64D4D;border-radius:8px;display:flex;align-items:center;justify-content:center">
      <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" width="24" height="24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
    </div>
    <div>
      <div style="font-size:18px;font-weight:bold">Julian Bakery</div>
      <div style="font-size:11px;color:#6B7280;font-family:monospace">Batch Sheet</div>
    </div>
    <div style="margin-left:auto;text-align:right">
      <div style="font-size:20px;font-weight:bold;color:${statusColor}">${statusLabel}</div>
      <div style="font-size:11px;color:#6B7280;font-family:monospace">${sub.shift} Shift</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px;font-family:monospace;font-size:11px;color:#374151">
    <div><span style="color:#9CA3AF">DATE</span><br/><strong>${date}</strong></div>
    <div><span style="color:#9CA3AF">PRODUCT</span><br/><strong>${sub.productName}</strong></div>
    <div><span style="color:#9CA3AF">BOWLS</span><br/><strong>${sub.numberOfBowls}</strong></div>
    <div><span style="color:#9CA3AF">SUBMITTED BY</span><br/><strong>${sub.submittedBy.name}</strong></div>
    <div><span style="color:#9CA3AF">SUBMITTED AT</span><br/><strong>${new Date(sub.submittedAt).toLocaleString("en-US")}</strong></div>
  </div>

  <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
    <thead>
      <tr style="background:#F3F4F6;border-bottom:1px solid #D1D5DB">
        <th style="text-align:left;padding:7px 8px;font-size:10px;font-family:monospace;color:#6B7280;text-transform:uppercase">Ingredient</th>
        <th style="text-align:center;padding:7px 8px;font-size:10px;font-family:monospace;color:#6B7280;text-transform:uppercase">Per Bowl</th>
        <th style="text-align:center;padding:7px 8px;font-size:10px;font-family:monospace;color:#6B7280;text-transform:uppercase">Total</th>
        <th style="text-align:left;padding:7px 8px;font-size:10px;font-family:monospace;color:#6B7280;text-transform:uppercase">Supplier</th>
        <th style="text-align:left;padding:7px 8px;font-size:10px;font-family:monospace;color:#6B7280;text-transform:uppercase">Lot #</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  ${sub.notes ? `
  <div style="margin-bottom:16px;padding:10px 12px;border:1px solid #E5E7EB;border-radius:6px">
    <div style="font-size:10px;font-weight:600;color:#6B7280;font-family:monospace;margin-bottom:4px">NOTES</div>
    <div style="font-size:12px;color:#374151">${sub.notes}</div>
  </div>` : ""}

  ${sub.supervisorSignature ? `
  <div style="margin-top:20px;padding-top:12px;border-top:1px solid #E5E7EB">
    <div style="font-size:10px;color:#9CA3AF;font-family:monospace">SUPERVISOR SIGNATURE</div>
    <div style="font-size:14px;font-style:italic;color:#374151;margin-top:4px">${sub.supervisorSignature}</div>
  </div>` : ""}

  <div style="margin-top:32px;padding-top:8px;border-top:1px solid #E5E7EB;font-size:9px;color:#9CA3AF;font-family:monospace;text-align:center">
    Julian Bakery Food Safety Management System — Internal Use Only — Generated ${new Date().toLocaleString()}
  </div>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

// ---------------------------------------------------------------------------
// Detail modal
// ---------------------------------------------------------------------------
function SubmissionModal({ sub, onClose }: { sub: Submission; onClose: () => void }) {
  const date = new Date(sub.date).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-md border border-gray-200 shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-bold text-gray-900 font-garamond">{sub.productName} — {date} {sub.shift}</h2>
            <p className="text-xs text-gray-500 font-mono mt-0.5">
              {sub.numberOfBowls} bowl{sub.numberOfBowls !== 1 ? "s" : ""} · {sub.submittedBy.name} · {new Date(sub.submittedAt).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={sub.status} />
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider">Ingredient</th>
                  <th className="text-right px-4 py-2.5 text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider">Per Bowl</th>
                  <th className="text-right px-4 py-2.5 text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="text-left px-4 py-2.5 text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider">Supplier</th>
                  <th className="text-left px-4 py-2.5 text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider">Lot #</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sub.ingredients.map((ing) => (
                  <tr key={ing.id}>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{ing.name}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500 font-mono text-xs">{ing.quantity_per_bowl} {ing.unit}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="bg-[#FAE8E8] text-[#C04040] font-mono text-xs font-semibold px-2 py-0.5 rounded">
                        {ing.total_quantity} {ing.unit}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs">{ing.supplier || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{ing.lot_number || <span className="text-gray-300">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {sub.notes && (
            <div className="border border-gray-100 rounded-md p-4">
              <p className="text-xs font-semibold text-gray-400 font-mono mb-1">NOTES</p>
              <p className="text-sm text-gray-700">{sub.notes}</p>
            </div>
          )}

          {sub.supervisorSignature && (
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs text-gray-400 font-mono">SUPERVISOR SIGNATURE</p>
              <p className="text-base italic text-gray-700 mt-1">{sub.supervisorSignature}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Close</button>
          <button onClick={() => downloadPDF(sub)} className="btn-primary">
            <Download className="w-4 h-4" /> Download PDF
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function BatchSheetRecordsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState<Submission | null>(null);

  const role = (session?.user as { role?: string })?.role ?? "";

  useEffect(() => {
    if (status === "loading") return;
    if (role !== "SUPERVISOR" && role !== "ADMIN") return;
    fetch("/api/batch-sheet")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setSubmissions)
      .catch((e) => console.error("Failed to load batch sheets:", e))
      .finally(() => setLoading(false));
  }, [status, role]);

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center gap-2 text-gray-400 font-mono text-sm">
        <div className="w-4 h-4 border-2 border-gray-300 border-t-[#D64D4D] rounded-full animate-spin" />
        Loading records…
      </div>
    );
  }

  if (role !== "SUPERVISOR" && role !== "ADMIN") {
    return (
      <div className="flex items-center gap-2 text-[#D64D4D] font-mono text-sm">
        <AlertCircle className="w-4 h-4" /> Access restricted.
      </div>
    );
  }

  return (
    <>
      {selected && <SubmissionModal sub={selected} onClose={() => setSelected(null)} />}

      <div className="space-y-6">
        <div className="page-header">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <FolderOpen className="w-6 h-6 text-[#D64D4D]" />
              Batch Sheet Records
            </h1>
            <p className="page-subtitle">{submissions.length} record{submissions.length !== 1 ? "s" : ""} total</p>
          </div>
          <button
            onClick={() => router.push("/dashboard/supervisor/batch-sheet")}
            className="btn-primary"
          >
            <ChevronLeft className="w-4 h-4" /> New Batch Sheet
          </button>
        </div>

        {submissions.length === 0 ? (
          <div className="card p-12 text-center">
            <FolderOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 font-mono">No batch sheets submitted yet.</p>
          </div>
        ) : (
          <div className="card overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {["Date", "Shift", "Product", "Bowls", "Submitted By", "Status", ""].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {submissions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-gray-700">
                      {new Date(sub.date).toLocaleDateString("en-US", {
                        year: "numeric", month: "short", day: "numeric",
                      })}
                    </td>
                    <td className="px-5 py-3">
                      <span className="badge bg-gray-100 text-gray-600">{sub.shift}</span>
                    </td>
                    <td className="px-5 py-3 text-gray-800 font-medium">{sub.productName}</td>
                    <td className="px-5 py-3 text-gray-600 font-mono">{sub.numberOfBowls}</td>
                    <td className="px-5 py-3 text-gray-700">{sub.submittedBy.name}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={sub.status} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => setSelected(sub)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono border border-gray-200 rounded hover:bg-gray-50 text-gray-600 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" /> View
                        </button>
                        <button
                          onClick={() => downloadPDF(sub)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono border border-gray-200 rounded hover:bg-gray-50 text-gray-600 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" /> PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
