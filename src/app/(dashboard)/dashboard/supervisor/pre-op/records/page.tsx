"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  FolderOpen,
  ChevronLeft,
  Download,
  CheckCircle2,
  XCircle,
  AlertCircle as AlertCircleIcon,
  Eye,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate as fmtDateUtil } from "@/lib/dateUtils";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SectionItem {
  section: string;
  item: string;
  result: "PASS" | "FAIL" | "NA";
  notes?: string;
}

interface AtpAttempt {
  attempt_number: number;
  area_swabbed: string;
  rlu_result: number;
  result: "pass" | "warning" | "fail";
  initials: string;
  time_recorded: string;
}

interface AtpSwab {
  attempts: AtpAttempt[];
  final_result: "pass" | "warning" | "fail" | null;
}

interface Inspection {
  id: string;
  date: string;
  shift: "AM" | "PM";
  status: "PASS" | "FAIL" | "PASS_WITH_ISSUES";
  sections: SectionItem[];
  atpSwab: AtpSwab | null;
  correctiveAction: string | null;
  supervisorSignature: string | null;
  submittedAt: string;
  submittedBy: { name: string };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Inspection["status"] }) {
  const config = {
    PASS:             { label: "Pass",            cls: "bg-emerald-100 text-emerald-800" },
    FAIL:             { label: "Fail",            cls: "bg-red-100 text-red-700" },
    PASS_WITH_ISSUES: { label: "Pass w/ Issues", cls: "bg-amber-100 text-amber-700" },
  }[status];
  return <span className={cn("badge", config.cls)}>{config.label}</span>;
}

function ResultIcon({ result }: { result: "PASS" | "FAIL" | "NA" }) {
  if (result === "PASS") return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
  if (result === "FAIL") return <XCircle className="w-4 h-4 text-[#D64D4D]" />;
  return <span className="text-gray-400 font-mono text-xs">N/A</span>;
}

function AtpBadge({ result }: { result: "pass" | "warning" | "fail" | null }) {
  if (!result) return <span className="text-gray-400 text-xs font-mono">—</span>;
  const cfg = {
    pass:    "bg-emerald-100 text-emerald-800",
    warning: "bg-amber-100 text-amber-800",
    fail:    "bg-red-100 text-red-700",
  }[result];
  const label = { pass: "PASS", warning: "WARNING", fail: "FAIL" }[result];
  return <span className={cn("badge text-[10px] font-mono font-bold", cfg)}>{label}</span>;
}

function groupSections(items: SectionItem[]) {
  const map = new Map<string, SectionItem[]>();
  for (const item of items) {
    if (!map.has(item.section)) map.set(item.section, []);
    map.get(item.section)!.push(item);
  }
  return map;
}

// ─── PDF ───────────────────────────────────────────────────────────────────────

function downloadPDF(inspection: Inspection) {
  const grouped    = groupSections(inspection.sections);
  const date       = fmtDateUtil(inspection.date);
  const submittedAt = new Date(inspection.submittedAt).toLocaleString("en-US");

  const statusLabel = { PASS: "PASS", FAIL: "FAIL", PASS_WITH_ISSUES: "PASS WITH ISSUES" }[inspection.status];
  const statusColor = { PASS: "#059669", FAIL: "#D64D4D", PASS_WITH_ISSUES: "#D97706" }[inspection.status];

  const sectionsHtml = Array.from(grouped.entries())
    .map(([section, items]) => `
      <div style="margin-bottom:16px">
        <div style="background:#F3F4F6;padding:6px 12px;border-radius:4px;margin-bottom:6px">
          <strong style="font-size:12px;color:#374151">${section}</strong>
        </div>
        <table style="width:100%;border-collapse:collapse">
          ${items.map((item) => `
            <tr style="border-bottom:1px solid #E5E7EB">
              <td style="padding:6px 8px;font-size:11px;color:#374151;width:70%">${item.item}</td>
              <td style="padding:6px 8px;text-align:center;font-size:11px;font-weight:600;color:${
                item.result === "PASS" ? "#059669" : item.result === "FAIL" ? "#D64D4D" : "#6B7280"
              }">${item.result === "NA" ? "N/A" : item.result}</td>
              <td style="padding:6px 8px;font-size:10px;color:#6B7280">${item.notes ?? ""}</td>
            </tr>`).join("")}
        </table>
      </div>`).join("");

  // ATP Swab section for PDF
  const atpHtml = inspection.atpSwab
    ? (() => {
        const atpColor = {
          pass:    "#059669",
          warning: "#D97706",
          fail:    "#D64D4D",
        }[inspection.atpSwab.final_result ?? "fail"] ?? "#6B7280";
        const atpLabel = {
          pass: "PASS", warning: "WARNING", fail: "FAIL",
        }[inspection.atpSwab.final_result ?? "fail"] ?? "—";
        const passingAtt = inspection.atpSwab.attempts.find(
          (a) => a.result === "pass" || a.result === "warning"
        );

        return `
        <div style="margin-bottom:16px">
          <div style="background:#F3F4F6;padding:6px 12px;border-radius:4px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">
            <strong style="font-size:12px;color:#374151">ATP Swab Test</strong>
            <span style="font-size:11px;font-weight:700;color:${atpColor}">${atpLabel}</span>
          </div>
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:#F9FAFB">
                <th style="padding:5px 8px;font-size:10px;color:#6B7280;text-align:left;font-family:monospace">AREA SWABBED</th>
                <th style="padding:5px 8px;font-size:10px;color:#6B7280;text-align:center;font-family:monospace">RLU</th>
                <th style="padding:5px 8px;font-size:10px;color:#6B7280;text-align:center;font-family:monospace">RESULT</th>
                <th style="padding:5px 8px;font-size:10px;color:#6B7280;text-align:center;font-family:monospace">INITIALS</th>
                <th style="padding:5px 8px;font-size:10px;color:#6B7280;text-align:center;font-family:monospace">TIME</th>
              </tr>
            </thead>
            <tbody>
              ${inspection.atpSwab.attempts.map((a) => {
                const c = { pass: "#059669", warning: "#D97706", fail: "#D64D4D" }[a.result] ?? "#6B7280";
                const l = { pass: "PASS", warning: "WARNING", fail: "FAIL" }[a.result] ?? a.result;
                return `<tr style="border-bottom:1px solid #E5E7EB">
                  <td style="padding:5px 8px;font-size:11px;color:#374151">${a.area_swabbed}</td>
                  <td style="padding:5px 8px;font-size:11px;color:#374151;text-align:center">${a.rlu_result}</td>
                  <td style="padding:5px 8px;font-size:11px;font-weight:600;color:${c};text-align:center">${l}</td>
                  <td style="padding:5px 8px;font-size:11px;color:#374151;text-align:center">${a.initials}</td>
                  <td style="padding:5px 8px;font-size:11px;color:#374151;text-align:center">${a.time_recorded}</td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
          ${passingAtt ? `<p style="font-size:11px;color:${atpColor};margin-top:6px;font-weight:600">ATP Swab: ${atpLabel} at ${passingAtt.time_recorded}</p>` : ""}
        </div>`;
      })()
    : "";

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Pre-Op Inspection — ${date} ${inspection.shift}</title>
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
      <div style="font-size:18px;font-weight:bold;color:#111827">Julian Bakery</div>
      <div style="font-size:11px;color:#6B7280;font-family:monospace">Pre-Operation Inspection Report</div>
    </div>
    <div style="margin-left:auto;text-align:right">
      <div style="font-size:22px;font-weight:bold;color:${statusColor}">${statusLabel}</div>
      <div style="font-size:11px;color:#6B7280;font-family:monospace">${inspection.shift} Shift</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px;font-family:monospace;font-size:11px;color:#374151">
    <div><span style="color:#9CA3AF">DATE</span><br/><strong>${date}</strong></div>
    <div><span style="color:#9CA3AF">SUBMITTED BY</span><br/><strong>${inspection.submittedBy.name}</strong></div>
    <div><span style="color:#9CA3AF">SUBMITTED AT</span><br/><strong>${submittedAt}</strong></div>
  </div>

  ${sectionsHtml}
  ${atpHtml}

  ${inspection.correctiveAction
    ? `<div style="margin-top:20px;padding:12px;border:1px solid #FCA5A5;border-radius:6px;background:#FEF2F2">
        <div style="font-size:11px;font-weight:600;color:#D64D4D;font-family:monospace;margin-bottom:4px">CORRECTIVE ACTION</div>
        <div style="font-size:12px;color:#374151">${inspection.correctiveAction}</div>
      </div>`
    : ""}

  ${inspection.supervisorSignature
    ? `<div style="margin-top:20px;padding-top:12px;border-top:1px solid #E5E7EB">
        <div style="font-size:10px;color:#9CA3AF;font-family:monospace">SUPERVISOR SIGNATURE</div>
        ${inspection.supervisorSignature.startsWith("data:image")
          ? `<img src="${inspection.supervisorSignature}" alt="Signature" style="max-width:100%;height:120px;object-fit:contain;margin-top:4px;border:1px solid #E5E7EB;border-radius:6px" />`
          : `<div style="font-size:14px;font-style:italic;color:#374151;margin-top:4px">${inspection.supervisorSignature}</div>`}
      </div>`
    : ""}

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

// ─── Detail Modal ──────────────────────────────────────────────────────────────

function InspectionModal({ inspection, onClose }: { inspection: Inspection; onClose: () => void }) {
  const grouped = groupSections(inspection.sections);
  const date    = fmtDateUtil(inspection.date);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-md border border-gray-200 shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-bold text-gray-900 font-garamond">{date} — {inspection.shift} Shift</h2>
            <p className="text-xs text-gray-500 font-mono mt-0.5">
              Submitted by {inspection.submittedBy.name} · {new Date(inspection.submittedAt).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={inspection.status} />
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* Checklist sections */}
          {Array.from(grouped.entries()).map(([section, items]) => (
            <div key={section}>
              <h3 className="text-xs font-semibold text-gray-400 font-mono uppercase tracking-wider mb-2">{section}</h3>
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-md overflow-hidden">
                {items.map((item, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                    <div className="pt-0.5 shrink-0"><ResultIcon result={item.result} /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700">{item.item}</p>
                      {item.notes && (
                        <p className="text-xs text-gray-500 font-mono mt-0.5">{item.notes}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* ATP Swab subsection */}
          {inspection.atpSwab && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 font-mono uppercase tracking-wider mb-2">
                ATP Swab Test
              </h3>
              <div className="border border-gray-100 rounded-md overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-xs font-mono text-gray-500">{inspection.atpSwab.attempts.length} attempt{inspection.atpSwab.attempts.length !== 1 ? "s" : ""}</span>
                  <AtpBadge result={inspection.atpSwab.final_result} />
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50/60 text-gray-400 font-mono uppercase tracking-wider text-[10px]">
                      <th className="text-left px-4 py-2">Area Swabbed</th>
                      <th className="text-center px-3 py-2">RLU</th>
                      <th className="text-center px-3 py-2">Result</th>
                      <th className="text-center px-3 py-2">Initials</th>
                      <th className="text-center px-3 py-2">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {inspection.atpSwab.attempts.map((a, i) => {
                      const isFinal = a.result === inspection.atpSwab?.final_result &&
                        i === inspection.atpSwab.attempts.findIndex((x) => x.result === "pass" || x.result === "warning");
                      return (
                        <tr
                          key={i}
                          className={cn(
                            "transition-colors",
                            a.result === "fail"
                              ? "bg-red-50/40 text-red-700"
                              : isFinal
                              ? a.result === "warning"
                                ? "bg-amber-50/40"
                                : "bg-emerald-50/40"
                              : ""
                          )}
                        >
                          <td className="px-4 py-2 text-gray-700">{a.area_swabbed}</td>
                          <td className="px-3 py-2 text-center text-gray-700 font-mono">{a.rlu_result}</td>
                          <td className="px-3 py-2 text-center">
                            <AtpBadge result={a.result} />
                          </td>
                          <td className="px-3 py-2 text-center text-gray-600 font-mono">{a.initials}</td>
                          <td className="px-3 py-2 text-center text-gray-500 font-mono">{a.time_recorded}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {inspection.correctiveAction && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-xs font-semibold text-[#D64D4D] font-mono mb-1">CORRECTIVE ACTION</p>
              <p className="text-sm text-gray-700">{inspection.correctiveAction}</p>
            </div>
          )}

          {inspection.supervisorSignature && (
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs text-gray-400 font-mono mb-2">SUPERVISOR SIGNATURE</p>
              {inspection.supervisorSignature.startsWith("data:image") ? (
                <div className="border border-gray-200 rounded-lg overflow-hidden bg-white" style={{ height: 160 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={inspection.supervisorSignature} alt="Supervisor signature" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                </div>
              ) : (
                <p className="text-base italic text-gray-700">{inspection.supervisorSignature}</p>
              )}
            </div>
          )}
          {!inspection.supervisorSignature && (
            <p className="text-sm text-gray-400 font-mono pt-3 border-t border-gray-100">No signature recorded</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Close</button>
          <button onClick={() => downloadPDF(inspection)} className="btn-primary">
            <Download className="w-4 h-4" /> Download PDF
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Records Page ──────────────────────────────────────────────────────────────

export default function PreOpRecordsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [selected,    setSelected]    = useState<Inspection | null>(null);

  const role = (session?.user as { role?: string })?.role ?? "";

  useEffect(() => {
    if (status === "loading") return;
    if (role !== "SUPERVISOR" && role !== "ADMIN") return;
    fetch("/api/pre-op")
      .then((r) => r.json())
      .then(setInspections)
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
        <AlertCircleIcon className="w-4 h-4" /> Access restricted to supervisors and administrators.
      </div>
    );
  }

  return (
    <>
      {selected && <InspectionModal inspection={selected} onClose={() => setSelected(null)} />}

      <div className="space-y-6">
        <div className="page-header">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <FolderOpen className="w-6 h-6 text-[#D64D4D]" />
              Pre-Op Inspection Records
            </h1>
            <p className="page-subtitle">{inspections.length} record{inspections.length !== 1 ? "s" : ""} total</p>
          </div>
          <button
            onClick={() => router.push("/dashboard/supervisor/pre-op")}
            className="btn-primary"
          >
            <ChevronLeft className="w-4 h-4" /> New Inspection
          </button>
        </div>

        {inspections.length === 0 ? (
          <div className="card p-12 text-center">
            <FolderOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 font-mono">No inspections submitted yet.</p>
          </div>
        ) : (
          <div className="card overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap">Date</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider">Shift</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider">Submitted By</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider">ATP Result</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider">Submitted At</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {inspections.map((ins) => (
                  <tr key={ins.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-gray-700">{fmtDateUtil(ins.date)}</td>
                    <td className="px-5 py-3">
                      <span className="badge bg-gray-100 text-gray-600">{ins.shift}</span>
                    </td>
                    <td className="px-5 py-3 text-gray-700">{ins.submittedBy.name}</td>
                    <td className="px-5 py-3">
                      {ins.atpSwab
                        ? <AtpBadge result={ins.atpSwab.final_result} />
                        : <span className="text-gray-400 text-xs font-mono">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={ins.status} />
                    </td>
                    <td className="px-5 py-3 text-gray-500 font-mono text-xs">
                      {new Date(ins.submittedAt).toLocaleString("en-US", {
                        month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                      })}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => setSelected(ins)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono border border-gray-200 rounded hover:bg-gray-50 text-gray-600 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" /> View
                        </button>
                        <button
                          onClick={() => downloadPDF(ins)}
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
