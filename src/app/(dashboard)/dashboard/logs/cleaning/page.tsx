"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Droplets, Download, ChevronUp, ChevronDown, ChevronsUpDown,
  X, ChevronLeft, ChevronRight, AlertCircle, CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { formatDate } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import { DateInput } from "@/components/DateInput";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GroupSummary {
  groupId:      string;
  label:        string;
  checkedCount: number;
  totalCount:   number;
}

interface LegacyItem { label: string; checked: boolean }

interface DailyRow {
  id:             string;
  date:           string;
  checkedBy:      string;
  notes:          string | null;
  status:         "COMPLETE" | "INCOMPLETE";
  submittedAt:    string;
  submittedBy:    string;
  isLegacy:       boolean;
  legacyItems:    LegacyItem[] | null;
  groupSummaries: GroupSummary[] | null;
  items?:         { id: string; label: string; group: string; checked: boolean; notes?: string }[];
}

interface MonthlyRow {
  id:             string;
  date:           string;
  checkedBy:      string;
  notes:          string | null;
  status:         "COMPLETE" | "INCOMPLETE";
  submittedAt:    string;
  submittedBy:    string;
  groupSummaries: GroupSummary[];
}

type SortKey = "date" | "checkedBy" | "status";
type SortDir = "asc" | "desc";
const PAGE_SIZE = 25;

// ─── Group summary column config ──────────────────────────────────────────────

// Columns reflect the new area-based structure (post-rebuild).
// Records submitted before the rebuild show "OLD" in these columns (handled by isLegacy flag).
const DAILY_GROUP_COLS = [
  { id: "granola_production",  shortLabel: "Granola Prod." },
  { id: "progranola_packing",  shortLabel: "Granola Pkg." },
  { id: "manual_packaging",    shortLabel: "Manual Pkg." },
  { id: "bar_production",      shortLabel: "Bar Prod." },
  { id: "crackers_production", shortLabel: "Crackers Prod." },
];

const MONTHLY_GROUP_COLS = [
  { id: "storage_infra",     shortLabel: "Storage" },
  { id: "deep_clean",        shortLabel: "Deep Clean" },
  { id: "facility_surfaces", shortLabel: "Surfaces" },
  { id: "monthly_checks",    shortLabel: "Checks" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined) { return formatDate(d ?? null); }

function StatusBadge({ status }: { status: "COMPLETE" | "INCOMPLETE" }) {
  if (status === "COMPLETE") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold font-mono bg-emerald-100 text-emerald-700 whitespace-nowrap">
        <CheckCircle2 className="w-3 h-3" /> COMPLETE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold font-mono bg-amber-100 text-amber-700 whitespace-nowrap">
      <AlertTriangle className="w-3 h-3" /> INCOMPLETE
    </span>
  );
}

function GroupCell({ summary }: { summary: GroupSummary | undefined }) {
  if (!summary) return <td className="px-2 py-3 text-center"><span className="text-gray-300 text-xs">—</span></td>;
  const { checkedCount, totalCount } = summary;
  if (totalCount === 0) return <td className="px-2 py-3 text-center"><span className="text-gray-300 text-xs">—</span></td>;
  const all     = checkedCount === totalCount;
  const none    = checkedCount === 0;
  return (
    <td className="px-2 py-3 text-center">
      <span className={cn(
        "inline-block text-xs font-mono font-semibold px-1.5 py-0.5 rounded",
        all  ? "text-emerald-700 bg-emerald-50"
             : none ? "text-red-500 bg-red-50"
             : "text-amber-700 bg-amber-50"
      )}>
        {all ? "✓" : none ? "✗" : "⚠"} {checkedCount}/{totalCount}
      </span>
    </td>
  );
}

function LegacyCell() {
  return (
    <td className="px-2 py-3 text-center">
      <span className="text-[9px] font-mono bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">OLD</span>
    </td>
  );
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

function exportDailyCSV(rows: DailyRow[]) {
  const groupIds = DAILY_GROUP_COLS.map((g) => g.id);
  const header = ["Date", "Checked By", ...DAILY_GROUP_COLS.map((g) => g.shortLabel), "Overall", "Submitted By"];
  const lines = rows.map((r) => {
    const groupCells = groupIds.map((gid) => {
      if (r.isLegacy) return "Legacy";
      const gs = r.groupSummaries?.find((s) => s.groupId === gid);
      if (!gs) return "—";
      return gs.checkedCount === gs.totalCount ? "All Done" : gs.checkedCount === 0 ? "None" : `${gs.checkedCount}/${gs.totalCount}`;
    });
    return [fmtDate(r.date), r.checkedBy, ...groupCells, r.status, r.submittedBy]
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",");
  });
  downloadCSV([header.join(","), ...lines].join("\n"), "cleaning-daily-log");
}

function exportMonthlyCSV(rows: MonthlyRow[]) {
  const groupIds = MONTHLY_GROUP_COLS.map((g) => g.id);
  const header = ["Date", "Checked By", ...MONTHLY_GROUP_COLS.map((g) => g.shortLabel), "Overall", "Submitted By"];
  const lines = rows.map((r) => {
    const groupCells = groupIds.map((gid) => {
      const gs = r.groupSummaries?.find((s) => s.groupId === gid);
      if (!gs) return "—";
      return gs.checkedCount === gs.totalCount ? "All Done" : gs.checkedCount === 0 ? "None" : `${gs.checkedCount}/${gs.totalCount}`;
    });
    return [fmtDate(r.date), r.checkedBy, ...groupCells, r.status, r.submittedBy]
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",");
  });
  downloadCSV([header.join(","), ...lines].join("\n"), "cleaning-monthly-log");
}

function downloadCSV(csv: string, name: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${name}-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── PDF Export ───────────────────────────────────────────────────────────────

function exportDailyPDF(rows: DailyRow[], filterLine: string) {
  const groupIds = DAILY_GROUP_COLS.map((g) => g.id);

  const groupSummaryCell = (r: DailyRow, gid: string) => {
    if (r.isLegacy) return `<td style="padding:5px 4px;text-align:center;font-size:9px;color:#9CA3AF;font-family:monospace">OLD</td>`;
    const gs = r.groupSummaries?.find((s) => s.groupId === gid);
    if (!gs || gs.totalCount === 0) return `<td style="padding:5px 4px;text-align:center;font-size:10px;color:#D1D5DB">—</td>`;
    const all  = gs.checkedCount === gs.totalCount;
    const none = gs.checkedCount === 0;
    const color = all ? "#059669" : none ? "#DC2626" : "#D97706";
    return `<td style="padding:5px 4px;text-align:center;font-size:10px;color:${color};font-weight:bold">${all ? "✓" : none ? "✗" : "⚠"} ${gs.checkedCount}/${gs.totalCount}</td>`;
  };

  const tableRows = rows.map((r) => `
<tr style="border-bottom:1px solid #F3F4F6">
  <td style="padding:5px 7px;font-size:10px;font-family:monospace">${fmtDate(r.date)}</td>
  <td style="padding:5px 7px;font-size:10px">${r.checkedBy}</td>
  ${groupIds.map((gid) => groupSummaryCell(r, gid)).join("")}
  <td style="padding:5px 7px;font-size:10px;color:${r.status === "COMPLETE" ? "#059669" : "#D97706"};font-weight:bold">${r.status === "COMPLETE" ? "✓ COMPLETE" : "⚠ INCOMPLETE"}</td>
</tr>`).join("");

  const thStyle = `background:#FEF2F2;font-family:monospace;font-size:8px;color:#D64D4D;text-transform:uppercase;padding:6px 4px;text-align:center;border-bottom:2px solid #D64D4D;white-space:nowrap`;
  const thLeft  = thStyle.replace("text-align:center", "text-align:left");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Daily Cleaning Log — Julian Bakery</title>
<style>body{font-family:Georgia,serif;margin:24px;color:#111827}table{width:100%;border-collapse:collapse}@media print{body{margin:12px}}</style>
</head><body>
<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;border-bottom:2px solid #D64D4D;padding-bottom:12px">
  <div style="width:32px;height:32px;background:#D64D4D;border-radius:6px;display:flex;align-items:center;justify-content:center">
    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" width="18" height="18"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
  </div>
  <div style="flex:1">
    <div style="font-size:15px;font-weight:bold">Julian Bakery — Daily Cleaning Log</div>
    <div style="font-size:9px;color:#6B7280;font-family:monospace">${filterLine || "All records"}</div>
  </div>
  <div style="text-align:right;font-size:9px;color:#9CA3AF;font-family:monospace">Generated ${new Date().toLocaleString("en-US")}<br/>${rows.length} record${rows.length !== 1 ? "s" : ""}</div>
</div>
<table>
  <thead><tr>
    <th style="${thLeft}">Date</th>
    <th style="${thLeft}">Checked By</th>
    ${DAILY_GROUP_COLS.map((g) => `<th style="${thStyle}">${g.shortLabel}</th>`).join("")}
    <th style="${thStyle}">Overall</th>
  </tr></thead>
  <tbody>${tableRows}</tbody>
</table>
<div style="margin-top:20px;padding-top:8px;border-top:1px solid #E5E7EB;font-size:8px;color:#9CA3AF;font-family:monospace;text-align:center">
  Julian Bakery Food Safety Management System — Internal Use Only
</div></body></html>`;
  openPrintWindow(html);
}

function exportMonthlyPDF(rows: MonthlyRow[], filterLine: string) {
  const groupIds = MONTHLY_GROUP_COLS.map((g) => g.id);

  const groupSummaryCell = (r: MonthlyRow, gid: string) => {
    const gs = r.groupSummaries?.find((s) => s.groupId === gid);
    if (!gs || gs.totalCount === 0) return `<td style="padding:5px 4px;text-align:center;font-size:10px;color:#D1D5DB">—</td>`;
    const all  = gs.checkedCount === gs.totalCount;
    const none = gs.checkedCount === 0;
    const color = all ? "#059669" : none ? "#DC2626" : "#D97706";
    return `<td style="padding:5px 4px;text-align:center;font-size:10px;color:${color};font-weight:bold">${all ? "✓" : none ? "✗" : "⚠"} ${gs.checkedCount}/${gs.totalCount}</td>`;
  };

  const tableRows = rows.map((r) => `
<tr style="border-bottom:1px solid #F3F4F6">
  <td style="padding:5px 7px;font-size:10px;font-family:monospace">${fmtDate(r.date)}</td>
  <td style="padding:5px 7px;font-size:10px">${r.checkedBy}</td>
  ${groupIds.map((gid) => groupSummaryCell(r, gid)).join("")}
  <td style="padding:5px 7px;font-size:10px;color:${r.status === "COMPLETE" ? "#059669" : "#D97706"};font-weight:bold">${r.status === "COMPLETE" ? "✓ COMPLETE" : "⚠ INCOMPLETE"}</td>
</tr>`).join("");

  const thStyle = `background:#FEF2F2;font-family:monospace;font-size:8px;color:#D64D4D;text-transform:uppercase;padding:6px 4px;text-align:center;border-bottom:2px solid #D64D4D;white-space:nowrap`;
  const thLeft  = thStyle.replace("text-align:center", "text-align:left");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Monthly Cleaning Log — Julian Bakery</title>
<style>body{font-family:Georgia,serif;margin:24px;color:#111827}table{width:100%;border-collapse:collapse}@media print{body{margin:12px}}</style>
</head><body>
<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;border-bottom:2px solid #D64D4D;padding-bottom:12px">
  <div style="width:32px;height:32px;background:#D64D4D;border-radius:6px;display:flex;align-items:center;justify-content:center">
    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" width="18" height="18"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
  </div>
  <div style="flex:1">
    <div style="font-size:15px;font-weight:bold">Julian Bakery — Monthly Cleaning Log</div>
    <div style="font-size:9px;color:#6B7280;font-family:monospace">${filterLine || "All records"}</div>
  </div>
  <div style="text-align:right;font-size:9px;color:#9CA3AF;font-family:monospace">Generated ${new Date().toLocaleString("en-US")}<br/>${rows.length} record${rows.length !== 1 ? "s" : ""}</div>
</div>
<table>
  <thead><tr>
    <th style="${thLeft}">Date</th>
    <th style="${thLeft}">Checked By</th>
    ${MONTHLY_GROUP_COLS.map((g) => `<th style="${thStyle}">${g.shortLabel}</th>`).join("")}
    <th style="${thStyle}">Overall</th>
  </tr></thead>
  <tbody>${tableRows}</tbody>
</table>
<div style="margin-top:20px;padding-top:8px;border-top:1px solid #E5E7EB;font-size:8px;color:#9CA3AF;font-family:monospace;text-align:center">
  Julian Bakery Food Safety Management System — Internal Use Only
</div></body></html>`;
  openPrintWindow(html);
}

function openPrintWindow(html: string) {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

// ─── Sort Header ──────────────────────────────────────────────────────────────

function SortTh({ label, col, sortKey, sortDir, onSort, center }: {
  label: string; col: SortKey; sortKey: SortKey; sortDir: SortDir;
  onSort: (k: SortKey) => void; center?: boolean;
}) {
  const active = sortKey === col;
  return (
    <th
      className={cn(
        "px-3 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 transition-colors",
        center ? "text-center" : "text-left"
      )}
      onClick={() => onSort(col)}
    >
      <span className={cn("flex items-center gap-1", center && "justify-center")}>
        {label}
        {active
          ? sortDir === "asc"
            ? <ChevronUp className="w-3 h-3 text-[#D64D4D]" />
            : <ChevronDown className="w-3 h-3 text-[#D64D4D]" />
          : <ChevronsUpDown className="w-3 h-3 text-gray-300" />
        }
      </span>
    </th>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({ page, totalPages, setPage }: { page: number; totalPages: number; setPage: (p: number) => void }) {
  return (
    <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50">
      <p className="text-xs text-gray-500 font-mono">
        Page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed">
          <ChevronLeft className="w-4 h-4 text-gray-600" />
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
          .reduce<(number | "…")[]>((acc, p, i, arr) => {
            if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
            acc.push(p); return acc;
          }, [])
          .map((p, i) =>
            p === "…"
              ? <span key={i} className="px-1 text-xs text-gray-400">…</span>
              : <button key={p} onClick={() => setPage(p as number)} className={cn("w-7 h-7 rounded text-xs font-mono transition-colors", page === p ? "bg-[#D64D4D] text-white" : "hover:bg-gray-200 text-gray-600")}>{p}</button>
          )
        }
        <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed">
          <ChevronRight className="w-4 h-4 text-gray-600" />
        </button>
      </div>
    </div>
  );
}

// ─── Daily Tab ────────────────────────────────────────────────────────────────

function DailyTab() {
  const [allRows,    setAllRows]    = useState<DailyRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [fDateFrom,  setFDateFrom]  = useState("");
  const [fDateTo,    setFDateTo]    = useState("");
  const [fStatus,    setFStatus]    = useState("");
  const [fCheckedBy, setFCheckedBy] = useState("");
  const [sortKey,    setSortKey]    = useState<SortKey>("date");
  const [sortDir,    setSortDir]    = useState<SortDir>("desc");
  const [page,       setPage]       = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true); setError("");
    const params = new URLSearchParams();
    if (fDateFrom)  params.set("date_from",  fDateFrom);
    if (fDateTo)    params.set("date_to",    fDateTo);
    if (fStatus)    params.set("status",     fStatus);
    if (fCheckedBy) params.set("checked_by", fCheckedBy);
    try {
      const res = await fetch(`/api/logs/cleaning/daily?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAllRows(data.rows ?? []);
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally { setLoading(false); }
  }, [fDateFrom, fDateTo, fStatus, fCheckedBy]);

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  }

  const sorted = useMemo(() => [...allRows].sort((a, b) => {
    const va = a[sortKey] ?? ""; const vb = b[sortKey] ?? "";
    const cmp = String(va) < String(vb) ? -1 : String(va) > String(vb) ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  }), [allRows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows   = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasFilters = fDateFrom || fDateTo || fStatus || fCheckedBy;
  const filterLine = [fDateFrom && `From: ${fmtDate(fDateFrom)}`, fDateTo && `To: ${fmtDate(fDateTo)}`, fStatus && `Status: ${fStatus}`, fCheckedBy && `Checked by: ${fCheckedBy}`].filter(Boolean).join("  ·  ");

  return (
    <div className="space-y-4">
      {/* Export */}
      <div className="flex justify-end gap-2">
        <button onClick={() => exportDailyCSV(sorted)} disabled={sorted.length === 0} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-gray-300 rounded hover:bg-gray-50 text-gray-600 transition-colors disabled:opacity-40">
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
        <button onClick={() => exportDailyPDF(sorted, filterLine)} disabled={sorted.length === 0} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-[#D64D4D] rounded hover:bg-red-50 text-[#D64D4D] transition-colors disabled:opacity-40">
          <Download className="w-3.5 h-3.5" /> Export PDF
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div><label className="label">From</label><DateInput className="input" value={fDateFrom} onChange={setFDateFrom} /></div>
          <div><label className="label">To</label><DateInput className="input" value={fDateTo} onChange={setFDateTo} /></div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="">All</option>
              <option value="COMPLETE">Complete</option>
              <option value="INCOMPLETE">Incomplete</option>
            </select>
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="label">Checked By</label>
            <input className="input" value={fCheckedBy} placeholder="Search name…" onChange={(e) => setFCheckedBy(e.target.value)} onKeyDown={(e) => e.key === "Enter" && fetchData()} />
          </div>
          <button onClick={fetchData} className="btn-primary text-xs py-2">Apply</button>
          {hasFilters && (
            <button onClick={() => { setFDateFrom(""); setFDateTo(""); setFStatus(""); setFCheckedBy(""); }} className="inline-flex items-center gap-1 px-3 py-2 text-xs font-mono border border-gray-200 rounded hover:bg-gray-50 text-gray-500">
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {error && <div className="flex items-center gap-2 text-red-600 text-sm font-mono"><AlertCircle className="w-4 h-4" /> {error}</div>}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12 gap-2 text-gray-400 font-mono text-sm">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-[#D64D4D] rounded-full animate-spin" /> Loading…
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-12 text-center">
            <Droplets className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-500 font-mono">{hasFilters ? "No records found for the selected filters." : "No daily cleaning checklists submitted yet."}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <SortTh label="Date"       col="date"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="Checked By" col="checkedBy" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    {DAILY_GROUP_COLS.map((g) => (
                      <th key={g.id} className="px-2 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider text-center whitespace-nowrap">{g.shortLabel}</th>
                    ))}
                    <SortTh label="Overall" col="status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} center />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pageRows.map((row, i) => (
                    <tr key={row.id} className={cn("hover:bg-[#FEF2F2]/40 transition-colors", i % 2 === 1 ? "bg-amber-50/20" : "")}>
                      <td className="px-3 py-3 font-mono text-gray-700 whitespace-nowrap text-xs">{fmtDate(row.date)}</td>
                      <td className="px-3 py-3 text-gray-700 text-sm whitespace-nowrap">{row.checkedBy}</td>
                      {DAILY_GROUP_COLS.map((g) =>
                        row.isLegacy
                          ? <LegacyCell key={g.id} />
                          : <GroupCell key={g.id} summary={row.groupSummaries?.find((s) => s.groupId === g.id)} />
                      )}
                      <td className="px-3 py-3 text-center"><StatusBadge status={row.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && <Pagination page={page} totalPages={totalPages} setPage={setPage} />}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Monthly Tab ──────────────────────────────────────────────────────────────

interface NewMonthlyRecord {
  id: string;
  monthKey: string;
  monthLabel: string;
  status: string;
  submittedAt: string | null;
  submittedBy: string | null;
  progress: {
    production: { total: number; checked: number };
    shipping:   { total: number; checked: number };
    office:     { total: number; checked: number };
    overall:    { total: number; checked: number };
  };
}

function AreaCell({ checked, total }: { checked: number; total: number }) {
  if (total === 0) return <td className="px-2 py-3 text-center"><span className="text-gray-300 text-xs">—</span></td>;
  const all  = checked === total;
  const none = checked === 0;
  return (
    <td className="px-2 py-3 text-center">
      <span className={cn(
        "inline-block text-xs font-mono font-semibold px-1.5 py-0.5 rounded",
        all  ? "text-emerald-700 bg-emerald-50"
             : none ? "text-red-500 bg-red-50"
             : "text-amber-700 bg-amber-50"
      )}>
        {all ? "✓" : none ? "✗" : "⚠"} {checked}/{total}
      </span>
    </td>
  );
}

function MonthlyTab() {
  // New-format records
  const [newRecords,    setNewRecords]    = useState<NewMonthlyRecord[]>([]);
  const [newLoading,    setNewLoading]    = useState(true);
  const [newError,      setNewError]      = useState("");

  // Legacy records
  const [allRows,    setAllRows]    = useState<MonthlyRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [fDateFrom,  setFDateFrom]  = useState("");
  const [fDateTo,    setFDateTo]    = useState("");
  const [fStatus,    setFStatus]    = useState("");
  const [fCheckedBy, setFCheckedBy] = useState("");
  const [sortKey,    setSortKey]    = useState<SortKey>("date");
  const [sortDir,    setSortDir]    = useState<SortDir>("desc");
  const [page,       setPage]       = useState(1);

  // Load new-format records
  useEffect(() => {
    fetch("/api/forms/monthly-cleaning/history")
      .then((r) => r.json())
      .then((data: NewMonthlyRecord[]) => { setNewRecords(Array.isArray(data) ? data : []); setNewLoading(false); })
      .catch(() => { setNewError("Failed to load new records"); setNewLoading(false); });
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true); setError("");
    const params = new URLSearchParams();
    if (fDateFrom)  params.set("date_from",  fDateFrom);
    if (fDateTo)    params.set("date_to",    fDateTo);
    if (fStatus)    params.set("status",     fStatus);
    if (fCheckedBy) params.set("checked_by", fCheckedBy);
    try {
      const res = await fetch(`/api/logs/cleaning/monthly?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAllRows(data.rows ?? []);
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally { setLoading(false); }
  }, [fDateFrom, fDateTo, fStatus, fCheckedBy]);

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  }

  const sorted = useMemo(() => [...allRows].sort((a, b) => {
    const va = a[sortKey] ?? ""; const vb = b[sortKey] ?? "";
    const cmp = String(va) < String(vb) ? -1 : String(va) > String(vb) ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  }), [allRows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows   = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasFilters = fDateFrom || fDateTo || fStatus || fCheckedBy;
  const filterLine = [fDateFrom && `From: ${fmtDate(fDateFrom)}`, fDateTo && `To: ${fmtDate(fDateTo)}`, fStatus && `Status: ${fStatus}`, fCheckedBy && `Checked by: ${fCheckedBy}`].filter(Boolean).join("  ·  ");

  function fmtSubmittedAt(dateStr: string | null) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", {
      timeZone: "America/Los_Angeles",
      month: "short", day: "numeric", year: "numeric",
    });
  }

  return (
    <div className="space-y-6">

      {/* ── New-format records ── */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold font-mono text-gray-700 uppercase tracking-wide">Monthly Cleaning Records</h2>

        {newError && <div className="flex items-center gap-2 text-red-600 text-sm font-mono"><AlertCircle className="w-4 h-4" /> {newError}</div>}

        <div className="card overflow-hidden">
          {newLoading ? (
            <div className="flex items-center justify-center p-8 gap-2 text-gray-400 font-mono text-sm">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-[#D64D4D] rounded-full animate-spin" /> Loading…
            </div>
          ) : newRecords.length === 0 ? (
            <div className="p-8 text-center">
              <Droplets className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-500 font-mono">No monthly cleaning records yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider text-left whitespace-nowrap">Month</th>
                    <th className="px-3 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider text-left whitespace-nowrap">Submitted</th>
                    <th className="px-2 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider text-center whitespace-nowrap">By</th>
                    <th className="px-2 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider text-center whitespace-nowrap">Production</th>
                    <th className="px-2 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider text-center whitespace-nowrap">Shipping</th>
                    <th className="px-2 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider text-center whitespace-nowrap">Office</th>
                    <th className="px-2 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider text-center whitespace-nowrap">Overall %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {newRecords.map((rec, i) => {
                    const pct = rec.progress.overall.total === 0 ? 0 : Math.round((rec.progress.overall.checked / rec.progress.overall.total) * 100);
                    const isDraft = rec.status === "draft";
                    return (
                      <tr key={rec.id} className={cn("hover:bg-[#FEF2F2]/40 transition-colors", i % 2 === 1 ? "bg-amber-50/20" : "")}>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <a
                            href={`/dashboard/supervisor/cleaning/monthly?view=${rec.monthKey}`}
                            className="text-sm font-semibold text-[#C41E3A] hover:underline"
                          >
                            {rec.monthLabel}
                          </a>
                          {isDraft && (
                            <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">draft</span>
                          )}
                        </td>
                        <td className="px-3 py-3 font-mono text-gray-600 whitespace-nowrap text-xs">
                          {isDraft ? <span className="text-gray-400">—</span> : fmtSubmittedAt(rec.submittedAt)}
                        </td>
                        <td className="px-2 py-3 text-center">
                          <span className="text-xs font-mono text-gray-600">
                            {rec.submittedBy === "auto" ? "Auto" : rec.submittedBy ? "Manual" : "—"}
                          </span>
                        </td>
                        <AreaCell checked={rec.progress.production.checked} total={rec.progress.production.total} />
                        <AreaCell checked={rec.progress.shipping.checked} total={rec.progress.shipping.total} />
                        <AreaCell checked={rec.progress.office.checked} total={rec.progress.office.total} />
                        <td className="px-2 py-3 text-center">
                          <span className={cn(
                            "text-xs font-mono font-bold",
                            pct === 100 ? "text-emerald-600" : pct > 0 ? "text-amber-600" : "text-gray-400"
                          )}>
                            {pct}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Legacy records ── */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold font-mono text-gray-500 uppercase tracking-wide">Legacy Records</h2>

        {/* Export */}
        <div className="flex justify-end gap-2">
          <button onClick={() => exportMonthlyCSV(sorted)} disabled={sorted.length === 0} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-gray-300 rounded hover:bg-gray-50 text-gray-600 transition-colors disabled:opacity-40">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button onClick={() => exportMonthlyPDF(sorted, filterLine)} disabled={sorted.length === 0} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-[#D64D4D] rounded hover:bg-red-50 text-[#D64D4D] transition-colors disabled:opacity-40">
            <Download className="w-3.5 h-3.5" /> Export PDF
          </button>
        </div>

        {/* Filters */}
        <div className="card p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div><label className="label">From</label><DateInput className="input" value={fDateFrom} onChange={setFDateFrom} /></div>
            <div><label className="label">To</label><DateInput className="input" value={fDateTo} onChange={setFDateTo} /></div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
                <option value="">All</option>
                <option value="COMPLETE">Complete</option>
                <option value="INCOMPLETE">Incomplete</option>
              </select>
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="label">Checked By</label>
              <input className="input" value={fCheckedBy} placeholder="Search name…" onChange={(e) => setFCheckedBy(e.target.value)} onKeyDown={(e) => e.key === "Enter" && fetchData()} />
            </div>
            <button onClick={fetchData} className="btn-primary text-xs py-2">Apply</button>
            {hasFilters && (
              <button onClick={() => { setFDateFrom(""); setFDateTo(""); setFStatus(""); setFCheckedBy(""); }} className="inline-flex items-center gap-1 px-3 py-2 text-xs font-mono border border-gray-200 rounded hover:bg-gray-50 text-gray-500">
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
        </div>

        {error && <div className="flex items-center gap-2 text-red-600 text-sm font-mono"><AlertCircle className="w-4 h-4" /> {error}</div>}

        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-12 gap-2 text-gray-400 font-mono text-sm">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-[#D64D4D] rounded-full animate-spin" /> Loading…
            </div>
          ) : sorted.length === 0 ? (
            <div className="p-12 text-center">
              <Droplets className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-500 font-mono">{hasFilters ? "No records found for the selected filters." : "No legacy monthly cleaning checklists."}</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <SortTh label="Date"       col="date"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <SortTh label="Checked By" col="checkedBy" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      {MONTHLY_GROUP_COLS.map((g) => (
                        <th key={g.id} className="px-2 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider text-center whitespace-nowrap">{g.shortLabel}</th>
                      ))}
                      <SortTh label="Overall" col="status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} center />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pageRows.map((row, i) => (
                      <tr key={row.id} className={cn("hover:bg-[#FEF2F2]/40 transition-colors", i % 2 === 1 ? "bg-amber-50/20" : "")}>
                        <td className="px-3 py-3 font-mono text-gray-700 whitespace-nowrap text-xs">{fmtDate(row.date)}</td>
                        <td className="px-3 py-3 text-gray-700 text-sm whitespace-nowrap">{row.checkedBy}</td>
                        {MONTHLY_GROUP_COLS.map((g) => (
                          <GroupCell key={g.id} summary={row.groupSummaries?.find((s) => s.groupId === g.id)} />
                        ))}
                        <td className="px-3 py-3 text-center"><StatusBadge status={row.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && <Pagination page={page} totalPages={totalPages} setPage={setPage} />}
            </>
          )}
        </div>
      </div>

    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = "daily" | "monthly";

export default function CleaningLogPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as { role?: string })?.role ?? "";
  const [activeTab, setActiveTab] = useState<Tab>("daily");

  if (status === "loading") return null;
  if (role !== "SUPERVISOR" && role !== "ADMIN") {
    return <div className="flex items-center gap-2 text-[#D64D4D] font-mono text-sm"><AlertCircle className="w-4 h-4" /> Access restricted.</div>;
  }

  return (
    <div className="space-y-5 max-w-full">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Droplets className="w-6 h-6 text-[#D64D4D]" />
            Cleaning Log
          </h1>
          <p className="page-subtitle">Auto-populated from submitted cleaning checklists · read-only</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(["daily", "monthly"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2.5 text-sm font-mono font-semibold capitalize transition-colors border-b-2 -mb-px",
              activeTab === tab
                ? "border-[#D64D4D] text-[#D64D4D]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            {tab === "daily" ? "Daily" : "Monthly"}
          </button>
        ))}
      </div>

      {activeTab === "daily"   && <DailyTab />}
      {activeTab === "monthly" && <MonthlyTab />}
    </div>
  );
}
