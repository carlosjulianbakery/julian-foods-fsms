"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Dna, Download, ChevronUp, ChevronDown, ChevronsUpDown,
  X, ChevronLeft, ChevronRight, AlertCircle, CheckCircle2, XCircle,
} from "lucide-react";
import { formatDate } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SwabAttempt {
  attempt_number: number;
  equipment_swabbed: string;
  time_recorded: string;
  result: "pass" | "fail";
  initials: string;
}

interface AllergenRow {
  id: string;
  date: string;
  previous_product: string;
  allergens: string;
  allergens_array: string[];
  current_product: string;
  attempts_to_pass: number;
  equipment_on_passing: string;
  time_cleared: string;
  observations: string;
  supervisor_name: string;
  notes: string | null;
  swab_attempts: SwabAttempt[];
}

type SortKey = keyof Pick<AllergenRow, "date" | "previous_product" | "current_product" | "attempts_to_pass" | "time_cleared">;
type SortDir = "asc" | "desc";

const PAGE_SIZE = 25;

const ALLERGEN_OPTIONS = [
  { value: "egg",       label: "Egg" },
  { value: "peanut",    label: "Peanut" },
  { value: "milk",      label: "Milk" },
  { value: "sesame",    label: "Sesame" },
  { value: "tree nut",  label: "Tree Nut" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined) { return formatDate(d ?? null); }

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCSV(rows: AllergenRow[]) {
  const header = ["Date", "Previous Product", "Allergens", "Current Product", "Attempts to Pass", "Equipment Swabbed", "Time Cleared", "Observations"];
  const lines = rows.map((r) => [
    fmtDate(r.date),
    r.previous_product,
    r.allergens,
    r.current_product,
    r.attempts_to_pass,
    r.equipment_on_passing,
    r.time_cleared,
    r.observations,
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `allergen-changeover-log-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── PDF export ───────────────────────────────────────────────────────────────

function exportPDF(rows: AllergenRow[], filters: { allergens: string[]; product: string; dateFrom: string; dateTo: string; attempts: string }) {
  const tableRows = rows.map((r) => `
    <tr style="border-bottom:1px solid #F3F4F6">
      <td style="padding:5px 8px;font-size:10px">${fmtDate(r.date)}</td>
      <td style="padding:5px 8px;font-size:10px;font-weight:600">${r.previous_product}</td>
      <td style="padding:5px 8px;font-size:10px">${r.allergens}</td>
      <td style="padding:5px 8px;font-size:10px">${r.current_product}</td>
      <td style="padding:5px 8px;font-size:10px;text-align:center">${r.attempts_to_pass}</td>
      <td style="padding:5px 8px;font-size:10px">${r.equipment_on_passing}</td>
      <td style="padding:5px 8px;font-size:10px;font-family:monospace">${r.time_cleared}</td>
      <td style="padding:5px 8px;font-size:10px;color:#6B7280">${r.observations}</td>
    </tr>`).join("");

  const filterParts = [
    filters.product               ? `Product: ${filters.product}`       : null,
    filters.allergens.length > 0  ? `Allergens: ${filters.allergens.join(", ")}` : null,
    filters.dateFrom              ? `From: ${fmtDate(filters.dateFrom)}` : null,
    filters.dateTo                ? `To: ${fmtDate(filters.dateTo)}`     : null,
    filters.attempts !== "any"    ? `Attempts: ${filters.attempts}`      : null,
  ].filter(Boolean).join("  ·  ");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Allergen Changeover Log — Julian Bakery</title>
<style>body{font-family:Georgia,serif;margin:32px;color:#111827}table{width:100%;border-collapse:collapse}th{background:#FEF2F2;font-family:monospace;font-size:9px;color:#D64D4D;text-transform:uppercase;padding:5px 8px;text-align:left;border-bottom:2px solid #D64D4D}@media print{body{margin:16px}}</style>
</head><body>
<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;border-bottom:2px solid #D64D4D;padding-bottom:14px">
  <div style="width:36px;height:36px;background:#D64D4D;border-radius:8px;display:flex;align-items:center;justify-content:center">
    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" width="20" height="20"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
  </div>
  <div style="flex:1">
    <div style="font-size:16px;font-weight:bold">Julian Bakery — Allergen Changeover Log</div>
    <div style="font-size:10px;color:#6B7280;font-family:monospace">${filterParts || "All records"}</div>
  </div>
  <div style="text-align:right;font-size:10px;color:#9CA3AF;font-family:monospace">
    Generated ${new Date().toLocaleString()}<br/>${rows.length} record${rows.length !== 1 ? "s" : ""}
  </div>
</div>
<table>
  <thead><tr>
    <th>Date</th><th>Previous Product</th><th>Allergens</th><th>Current Product</th>
    <th style="text-align:center">Attempts</th><th>Equipment Swabbed</th><th>Time Cleared</th><th>Observations</th>
  </tr></thead>
  <tbody>${tableRows}</tbody>
</table>
<div style="margin-top:20px;font-size:9px;color:#9CA3AF;font-family:monospace;font-style:italic">
  All records auto-generated from submitted Batch Sheet forms.
</div>
<div style="margin-top:8px;padding-top:8px;border-top:1px solid #E5E7EB;font-size:9px;color:#9CA3AF;font-family:monospace;text-align:center">
  Julian Bakery Food Safety Management System — Internal Use Only
</div>
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

// ─── Row detail modal ─────────────────────────────────────────────────────────

function RowModal({ row, onClose }: { row: AllergenRow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-lg border border-gray-200 shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="font-bold text-gray-900">Allergen Changeover Detail</h2>
            <p className="text-xs text-gray-500 font-mono mt-0.5">
              {fmtDate(row.date)} · {row.supervisor_name} · Current: {row.current_product}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Date",             value: fmtDate(row.date) },
              { label: "Current Product",  value: row.current_product },
              { label: "Previous Product", value: row.previous_product },
              { label: "Allergens Present",value: row.allergens },
              { label: "Time Cleared",     value: row.time_cleared },
              { label: "Attempts to Pass", value: row.attempts_to_pass },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                <p className="text-sm text-gray-800">{value}</p>
              </div>
            ))}
          </div>

          {/* Swab attempt table */}
          {row.swab_attempts.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide font-mono mb-2">Swab Attempt Log</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {["#", "Equipment Swabbed", "Time", "Result", "Initials"].map((h) => (
                        <th key={h} className="text-left px-3 py-2 text-xs font-mono text-gray-500 font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {row.swab_attempts.map((att) => (
                      <tr key={att.attempt_number}>
                        <td className="px-3 py-2 text-center font-mono text-gray-500">{att.attempt_number}</td>
                        <td className="px-3 py-2 text-gray-800">{att.equipment_swabbed}</td>
                        <td className="px-3 py-2 font-mono text-gray-600">{att.time_recorded}</td>
                        <td className="px-3 py-2">
                          {att.result === "pass"
                            ? <span className="badge bg-emerald-100 text-emerald-700 flex items-center gap-1 w-fit"><CheckCircle2 className="w-3 h-3" />PASS</span>
                            : <span className="badge bg-purple-100 text-purple-700 flex items-center gap-1 w-fit"><XCircle className="w-3 h-3" />FAIL</span>
                          }
                        </td>
                        <td className="px-3 py-2 font-mono text-gray-600">{att.initials}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {row.observations && (
            <div>
              <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-1">Observations</p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{row.observations}</p>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end shrink-0">
          <button onClick={onClose} className="btn-secondary">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Sort header ──────────────────────────────────────────────────────────────

function SortTh({ label, col, sortKey, sortDir, onSort }: {
  label: string; col: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <th
      className="text-left px-4 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 transition-colors"
      onClick={() => onSort(col)}
    >
      <span className="flex items-center gap-1">
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AllergenChangeoverLogPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as { role?: string })?.role ?? "";

  const [allRows,  setAllRows]  = useState<AllergenRow[]>([]);
  const [products, setProducts] = useState<string[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [selected, setSelected] = useState<AllergenRow | null>(null);

  // Filters
  const [fAllergens, setFAllergens] = useState<string[]>([]);
  const [fDateFrom,  setFDateFrom]  = useState("");
  const [fDateTo,    setFDateTo]    = useState("");
  const [fProduct,   setFProduct]   = useState("");
  const [fAttempts,  setFAttempts]  = useState("any");

  // Sort & pagination
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page,    setPage]    = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    fAllergens.forEach((a) => params.append("allergen", a));
    if (fDateFrom) params.set("date_from", fDateFrom);
    if (fDateTo)   params.set("date_to",   fDateTo);
    if (fProduct)  params.set("product",   fProduct);
    if (fAttempts !== "any") params.set("attempts", fAttempts);
    try {
      const res = await fetch(`/api/logs/allergen-changeover?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAllRows(data.rows ?? []);
      setProducts(data.product_list ?? []);
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [fAllergens, fDateFrom, fDateTo, fProduct, fAttempts]);

  useEffect(() => {
    if (status !== "loading" && (role === "SUPERVISOR" || role === "ADMIN")) {
      fetchData();
    } else if (status !== "loading") {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, role]);

  function handleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  }

  function clearFilters() {
    setFAllergens([]); setFDateFrom(""); setFDateTo(""); setFProduct(""); setFAttempts("any");
  }

  const hasFilters = fAllergens.length > 0 || fDateFrom || fDateTo || fProduct || fAttempts !== "any";

  const sorted = useMemo(() => {
    return [...allRows].sort((a, b) => {
      const va = a[sortKey] ?? "";
      const vb = b[sortKey] ?? "";
      const cmp = String(va) < String(vb) ? -1 : String(va) > String(vb) ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [allRows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows   = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (status === "loading") return null;
  if (role !== "SUPERVISOR" && role !== "ADMIN") {
    return <div className="flex items-center gap-2 text-[#D64D4D] font-mono text-sm"><AlertCircle className="w-4 h-4" /> Access restricted.</div>;
  }

  return (
    <>
      {selected && <RowModal row={selected} onClose={() => setSelected(null)} />}

      <div className="space-y-5 max-w-7xl">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Dna className="w-6 h-6 text-[#D64D4D]" />
              Allergen Changeover Log
            </h1>
            <p className="page-subtitle">Auto-populated from submitted batch sheets · read-only</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => exportCSV(sorted)}
              disabled={sorted.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-gray-300 rounded hover:bg-gray-50 text-gray-600 transition-colors disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
            <button
              onClick={() => exportPDF(sorted, { allergens: fAllergens, product: fProduct, dateFrom: fDateFrom, dateTo: fDateTo, attempts: fAttempts })}
              disabled={sorted.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-[#D64D4D] rounded hover:bg-red-50 text-[#D64D4D] transition-colors disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" /> Export PDF
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="card p-4 space-y-4">
          {/* Allergen checkboxes */}
          <div>
            <label className="label mb-2">Allergen (filter by allergens present in previous product)</label>
            <div className="flex flex-wrap gap-3">
              {ALLERGEN_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-[#D64D4D]"
                    checked={fAllergens.includes(opt.value)}
                    onChange={(e) => setFAllergens(
                      e.target.checked
                        ? [...fAllergens, opt.value]
                        : fAllergens.filter((a) => a !== opt.value)
                    )}
                  />
                  <span className="text-sm text-gray-700 group-hover:text-gray-900 font-mono">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="label">From</label>
              <input type="date" className="input" value={fDateFrom} onChange={(e) => setFDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">To</label>
              <input type="date" className="input" value={fDateTo} onChange={(e) => setFDateTo(e.target.value)} />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="label">Current Product</label>
              <select className="input" value={fProduct} onChange={(e) => setFProduct(e.target.value)}>
                <option value="">All Products</option>
                {products.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Attempts to Pass</label>
              <select className="input" value={fAttempts} onChange={(e) => setFAttempts(e.target.value)}>
                <option value="any">Any</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3+">3+</option>
              </select>
            </div>
            <button onClick={fetchData} className="btn-primary text-xs py-2">Apply</button>
            {hasFilters && (
              <button onClick={() => { clearFilters(); }} className="inline-flex items-center gap-1 px-3 py-2 text-xs font-mono border border-gray-200 rounded hover:bg-gray-50 text-gray-500">
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-red-600 text-sm font-mono">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {/* Table */}
        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-12 gap-2 text-gray-400 font-mono text-sm">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-[#D64D4D] rounded-full animate-spin" />
              Loading…
            </div>
          ) : sorted.length === 0 ? (
            <div className="p-12 text-center">
              <Dna className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-500 font-mono">
                {hasFilters
                  ? "No records found for the selected filters."
                  : "No completed batch sheets found. Logs will populate automatically as batch sheets are submitted."
                }
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <SortTh label="Date"             col="date"             sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <SortTh label="Previous Product" col="previous_product" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap">Allergens</th>
                      <SortTh label="Current Product"  col="current_product"  sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <SortTh label="Attempts"         col="attempts_to_pass" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap">Equipment Swabbed</th>
                      <SortTh label="Time Cleared"     col="time_cleared"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider">Observations</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pageRows.map((row, i) => (
                      <tr
                        key={row.id}
                        className={cn(
                          "hover:bg-[#FEF2F2]/50 cursor-pointer transition-colors",
                          i % 2 === 1 ? "bg-amber-50/20" : ""
                        )}
                        onClick={() => setSelected(row)}
                      >
                        <td className="px-4 py-3 font-mono text-gray-700 whitespace-nowrap">{fmtDate(row.date)}</td>
                        <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{row.previous_product}</td>
                        <td className="px-4 py-3 text-xs text-gray-600 max-w-[160px]">
                          <div className="flex flex-wrap gap-1">
                            {row.allergens_array.map((a) => (
                              <span key={a} className="badge bg-red-50 text-red-700 text-[10px]">{a.split(" ")[0]}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{row.current_product}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn(
                            "inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold",
                            row.attempts_to_pass === 1
                              ? "bg-emerald-100 text-emerald-700"
                              : row.attempts_to_pass === 2
                              ? "bg-amber-100 text-amber-700"
                              : "bg-red-100 text-red-700"
                          )}>
                            {row.attempts_to_pass}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{row.equipment_on_passing}</td>
                        <td className="px-4 py-3 font-mono text-gray-600 whitespace-nowrap">{row.time_cleared}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">{row.observations}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50">
                <p className="text-xs text-gray-500 font-mono">
                  Showing {Math.min((page - 1) * PAGE_SIZE + 1, sorted.length)}–{Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length} record{sorted.length !== 1 ? "s" : ""}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-600" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .reduce<(number | "…")[]>((acc, p, i, arr) => {
                      if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === "…" ? (
                        <span key={i} className="px-1 text-xs text-gray-400">…</span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setPage(p as number)}
                          className={cn(
                            "w-7 h-7 rounded text-xs font-mono transition-colors",
                            page === p ? "bg-[#D64D4D] text-white" : "hover:bg-gray-200 text-gray-600"
                          )}
                        >
                          {p}
                        </button>
                      )
                    )}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
