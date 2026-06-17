"use client";

import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, AlertCircle, XCircle, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dateUtils";

interface ReceivingRecord {
  id: string; recordNumber: string; date: string; timeReceived: string;
  receivedBy: { name: string }; materialName: string; supplierName: string;
  lotNumber: string; quantityReceived: number; unit: string;
  decision: string; coaRequired: boolean; coaReceived: boolean | null;
}

const DECISION_CONFIG = {
  accepted:                { label: "ACCEPTED",    icon: CheckCircle2, cls: "bg-emerald-100 text-emerald-700" },
  accepted_with_conditions:{ label: "CONDITIONS",  icon: AlertCircle,  cls: "bg-amber-100 text-amber-700" },
  rejected:                { label: "REJECTED",    icon: XCircle,      cls: "bg-red-100 text-red-700" },
};

const fmtDate = (d: string | null | undefined) => formatDate(d ?? null);

function DecisionBadge({ d }: { d: string }) {
  const cfg = DECISION_CONFIG[d as keyof typeof DECISION_CONFIG] ?? { label: d, icon: AlertCircle, cls: "bg-gray-100 text-gray-600" };
  return <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold", cfg.cls)}><cfg.icon className="w-3 h-3" />{cfg.label}</span>;
}

function CoaBadge({ required, received }: { required: boolean; received: boolean | null }) {
  if (!required) return <span className="text-xs text-gray-400">N/A</span>;
  if (received) return <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><CheckCircle2 className="w-3 h-3" />Received</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600"><XCircle className="w-3 h-3" />Not received</span>;
}

function exportCSV(rows: ReceivingRecord[]) {
  const header = ["Record #", "Date", "Material", "Supplier", "Lot #", "Qty", "Decision", "COA", "Received By"];
  const lines = rows.map((r) => [
    r.recordNumber, fmtDate(r.date), r.materialName, r.supplierName,
    r.lotNumber, `${r.quantityReceived} ${r.unit}`, r.decision.replace(/_/g," "),
    !r.coaRequired ? "N/A" : (r.coaReceived ? "Received" : "Not received"),
    r.receivedBy.name,
  ].map((v) => `"${String(v).replace(/"/g,'""')}"`).join(","));
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `receiving-log-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
}

export default function ReceivingLogPage() {
  const [records, setRecords] = useState<ReceivingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [materialFilter, setMaterialFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [decisionFilter, setDecisionFilter] = useState("");
  const [coaFilter, setCoaFilter] = useState("");

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (dateFrom) p.set("date_from", dateFrom);
    if (dateTo) p.set("date_to", dateTo);
    if (materialFilter) p.set("material", materialFilter);
    if (supplierFilter) p.set("supplier", supplierFilter);
    if (decisionFilter) p.set("decision", decisionFilter);
    if (coaFilter) p.set("coa_status", coaFilter);
    try {
      const res = await fetch(`/api/logs/receiving?${p}`);
      if (res.ok) setRecords(await res.json());
    } finally { setLoading(false); }
  }, [dateFrom, dateTo, materialFilter, supplierFilter, decisionFilter, coaFilter]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const inp = "px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500";

  return (
    <div className="max-w-6xl space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Receiving Log</h1>
          <p className="text-sm text-gray-500 mt-0.5">Julian Bakery — all receiving records</p>
        </div>
        <button className="btn-secondary flex items-center gap-2" onClick={() => exportCSV(records)}>
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" className={inp} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" className={inp} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Material</label>
          <input type="text" className={inp} placeholder="Search…" value={materialFilter} onChange={(e) => setMaterialFilter(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Supplier</label>
          <input type="text" className={inp} placeholder="Search…" value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Decision</label>
          <select className={inp} value={decisionFilter} onChange={(e) => setDecisionFilter(e.target.value)}>
            <option value="">All</option>
            <option value="accepted">Accepted</option>
            <option value="accepted_with_conditions">Conditions</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">COA</label>
          <select className={inp} value={coaFilter} onChange={(e) => setCoaFilter(e.target.value)}>
            <option value="">All</option>
            <option value="received">Received</option>
            <option value="not_received">Not received</option>
            <option value="na">N/A</option>
          </select>
        </div>
        {(dateFrom || dateTo || materialFilter || supplierFilter || decisionFilter || coaFilter) && (
          <button className="text-xs text-gray-500 hover:text-gray-700 underline"
            onClick={() => { setDateFrom(""); setDateTo(""); setMaterialFilter(""); setSupplierFilter(""); setDecisionFilter(""); setCoaFilter(""); }}>
            Clear
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {["Record #", "Date", "Material", "Supplier", "Lot #", "Qty Received", "Decision", "COA", "Received By"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-8 text-sm text-gray-400">Loading…</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-sm text-gray-400">No receiving records found.</td></tr>
            ) : records.map((r, i) => (
              <tr key={r.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                <td className="px-3 py-2.5 font-mono text-xs font-medium">{r.recordNumber}</td>
                <td className="px-3 py-2.5 text-xs">{fmtDate(r.date)}</td>
                <td className="px-3 py-2.5 text-xs font-medium">{r.materialName}</td>
                <td className="px-3 py-2.5 text-xs text-gray-600">{r.supplierName}</td>
                <td className="px-3 py-2.5 font-mono text-xs">{r.lotNumber}</td>
                <td className="px-3 py-2.5 text-xs">{r.quantityReceived} {r.unit}</td>
                <td className="px-3 py-2.5"><DecisionBadge d={r.decision} /></td>
                <td className="px-3 py-2.5"><CoaBadge required={r.coaRequired} received={r.coaReceived} /></td>
                <td className="px-3 py-2.5 text-xs text-gray-500">{r.receivedBy.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
