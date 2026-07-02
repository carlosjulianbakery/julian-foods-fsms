"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  BookMarked, Download, ChevronUp, ChevronDown, ChevronsUpDown,
  X, ChevronLeft, ChevronRight, AlertCircle, Eye, Trash2, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { formatDate } from "@/lib/dateUtils";
import { formatQtyUnit } from "@/lib/formatNumber";
import { cn } from "@/lib/utils";
import { DateInput } from "@/components/DateInput";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LotRow {
  id: string;
  product_id?: string | null;
  production_date: string;
  lot: string | null;
  product: string;
  bowls_produced: number | null;
  base_unit_name?: string | null;
  items_produced: string | null;
  presentations: string;
  yield: string | null;
  expiration_date: string | null;
  has_expiration_date?: boolean;
  supervisor_name: string;
  shift: string;
  status: string;
  ingredients: Array<{ name: string; quantity_per_bowl: number; total_qty_used?: number | null; unit: string; supplier: string; supplier_source?: string | null; lot_number: string; is_wip?: boolean; wip_lot_verified?: boolean | null; wip_source_submission_id?: string | null; use_inventory?: boolean; inventory_lots?: Array<{ lot_id: string; lot_number: string; qty_used: number; unit: string }> }>;
}

type SortKey = keyof Pick<LotRow, "production_date" | "lot" | "product" | "bowls_produced" | "items_produced" | "presentations" | "expiration_date">;
type SortDir = "asc" | "desc";

const PAGE_SIZE = 25;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PASS:             "bg-emerald-100 text-emerald-700",
    PASS_WITH_ISSUES: "bg-amber-100 text-amber-700",
    FAIL:             "bg-red-100 text-red-700",
    COMPLETE:         "bg-blue-100 text-blue-700",
  };
  const cls = map[status] ?? "bg-gray-100 text-gray-500";
  const label = status === "PASS_WITH_ISSUES" ? "Pass w/ Issues" : status.charAt(0) + status.slice(1).toLowerCase().replace("_", " ");
  return <span className={cn("badge", cls)}>{label}</span>;
}

function fmtDate(d: string | null | undefined) { return formatDate(d ?? null); }

/** "67" for the default Bowl unit, or "67 pouches" for a custom base unit (lowercase, pluralized via "s"). */
function fmtBaseUnits(row: { bowls_produced: number | null; base_unit_name?: string | null }): string {
  if (row.bowls_produced == null) return "—";
  const unit = (row.base_unit_name || "Bowl").trim();
  if (unit.toLowerCase() === "bowl") return String(row.bowls_produced);
  return `${row.bowls_produced} ${unit.toLowerCase()}${row.bowls_produced === 1 ? "" : "s"}`;
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCSV(rows: LotRow[]) {
  const header = ["Production Date", "Lot", "Product", "Base Units Produced", "Items Produced", "Presentation", "Yield", "Expiration Date"];
  const lines = rows.map((r) => [
    fmtDate(r.production_date),
    r.lot ?? "",
    r.product,
    fmtBaseUnits(r),
    r.items_produced ?? "",
    r.presentations,
    r.yield ?? "N/A",
    r.has_expiration_date === false ? "N/A" : fmtDate(r.expiration_date),
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `lot-traceability-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── PDF export ───────────────────────────────────────────────────────────────

function exportPDF(rows: LotRow[], filters: { product: string; dateFrom: string; dateTo: string; lot: string }) {
  const tableRows = rows.map((r) => `
    <tr style="border-bottom:1px solid #F3F4F6">
      <td style="padding:5px 8px;font-size:11px">${fmtDate(r.production_date)}</td>
      <td style="padding:5px 8px;font-size:11px;font-family:monospace">${r.lot ?? "—"}</td>
      <td style="padding:5px 8px;font-size:11px;font-weight:600">${r.product}</td>
      <td style="padding:5px 8px;font-size:11px;text-align:center">${fmtBaseUnits(r)}</td>
      <td style="padding:5px 8px;font-size:11px;text-align:center">${r.items_produced ?? "—"}</td>
      <td style="padding:5px 8px;font-size:11px">${r.presentations}</td>
      <td style="padding:5px 8px;font-size:11px">${r.yield ?? "N/A"}</td>
      <td style="padding:5px 8px;font-size:11px">${r.has_expiration_date === false ? "N/A" : fmtDate(r.expiration_date)}</td>
    </tr>`).join("");

  const filterLine = [
    filters.product  ? `Product: ${filters.product}`               : null,
    filters.dateFrom ? `From: ${fmtDate(filters.dateFrom)}`        : null,
    filters.dateTo   ? `To: ${fmtDate(filters.dateTo)}`            : null,
    filters.lot      ? `Lot: ${filters.lot}`                       : null,
  ].filter(Boolean).join("  ·  ");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Lot Traceability Log — Julian Bakery</title>
<style>body{font-family:Georgia,serif;margin:32px;color:#111827}table{width:100%;border-collapse:collapse}th{background:#FEF2F2;font-family:monospace;font-size:10px;color:#D64D4D;text-transform:uppercase;padding:6px 8px;text-align:left;border-bottom:2px solid #D64D4D}@media print{body{margin:16px}}</style>
</head><body>
<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;border-bottom:2px solid #D64D4D;padding-bottom:14px">
  <div style="width:36px;height:36px;background:#D64D4D;border-radius:8px;display:flex;align-items:center;justify-content:center">
    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" width="20" height="20"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
  </div>
  <div style="flex:1">
    <div style="font-size:16px;font-weight:bold">Julian Bakery — Lot Traceability Log</div>
    <div style="font-size:10px;color:#6B7280;font-family:monospace">${filterLine || "All records"}</div>
  </div>
  <div style="text-align:right;font-size:10px;color:#9CA3AF;font-family:monospace">
    Generated ${new Date().toLocaleString("en-US")}<br/>${rows.length} record${rows.length !== 1 ? "s" : ""}
  </div>
</div>
<table>
  <thead><tr>
    <th>Production Date</th><th>Lot</th><th>Product</th>
    <th style="text-align:center">Base Units</th><th style="text-align:center">Items</th>
    <th>Presentation</th><th>Yield</th><th>Expiration Date</th>
  </tr></thead>
  <tbody>${tableRows}</tbody>
</table>
<div style="margin-top:28px;padding-top:8px;border-top:1px solid #E5E7EB;font-size:9px;color:#9CA3AF;font-family:monospace;text-align:center">
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

function RowModal({ row, onClose }: { row: LotRow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-lg border border-gray-200 shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="font-bold text-gray-900">{row.product}</h2>
            <p className="text-xs text-gray-500 font-mono mt-0.5">
              {fmtDate(row.production_date)} · {row.shift} Shift · Lot {row.lot ?? "—"} · {row.supervisor_name}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {statusBadge(row.status)}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Production Date", value: fmtDate(row.production_date) },
              { label: "Lot #",           value: row.lot ?? "—" },
              { label: "Expiration Date", value: row.has_expiration_date === false ? "N/A" : fmtDate(row.expiration_date) },
              { label: "Base Units Produced", value: fmtBaseUnits(row) },
              { label: "Items Produced",  value: row.items_produced ?? "—" },
              { label: "Presentation",    value: row.presentations },
              { label: "Yield",           value: row.yield ?? "N/A" },
              { label: "Supervisor",      value: row.supervisor_name },
              { label: "Shift",           value: row.shift },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                <p className="text-sm text-gray-800">{value}</p>
              </div>
            ))}
          </div>

          {row.ingredients.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide font-mono mb-2">Ingredients Used</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {["Ingredient", `Qty/${row.base_unit_name || "Bowl"}`, "Total", "Supplier", "Lot #", "Source Batch"].map((h) => (
                        <th key={h} className="text-left px-3 py-2 text-xs font-mono text-gray-500 font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {row.ingredients.map((ing, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 font-medium text-gray-800">
                          {ing.name}
                          {ing.is_wip && (
                            <span className="ml-1.5 text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">IN-HOUSE</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-500 font-mono text-xs">
                          {ing.quantity_per_bowl > 0 ? ing.quantity_per_bowl : "—"} {ing.quantity_per_bowl > 0 ? ing.unit : ""}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-[#D64D4D] font-semibold">
                          {ing.total_qty_used != null
                            ? formatQtyUnit(ing.total_qty_used, ing.unit)
                            : row.bowls_produced && ing.quantity_per_bowl > 0
                            ? formatQtyUnit(ing.quantity_per_bowl * row.bowls_produced, ing.unit)
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {ing.use_inventory
                            ? <span className="text-[10px] text-brand-600 font-mono">Inventory</span>
                            : <span className={(ing.supplier_source === "other" || ing.supplier_source === "free_text") ? "text-amber-600" : "text-gray-600"}>
                                {ing.supplier || "—"}
                              </span>
                          }
                        </td>
                        <td className="px-3 py-2 text-gray-600 font-mono text-xs">
                          {ing.inventory_lots && ing.inventory_lots.length > 0
                            ? ing.inventory_lots.map((l, li) => (
                                <span key={li} className="block">
                                  <a href={`/dashboard/inventory/lot-lookup?q=${encodeURIComponent(l.lot_number)}`}
                                    className="text-brand-600 hover:underline">{l.lot_number}</a>
                                  {" "}({l.qty_used} {l.unit})
                                </span>
                              ))
                            : (ing.lot_number || "—")}
                        </td>
                        <td className="px-3 py-2 text-gray-600 font-mono text-xs">
                          {ing.is_wip && ing.wip_lot_verified && ing.wip_source_submission_id ? (
                            <a
                              href={`/dashboard/supervisor/batch-sheet/records?submission=${ing.wip_source_submission_id}`}
                              className="text-blue-600 hover:text-blue-800 underline text-[10px]"
                            >
                              View PreMix →
                            </a>
                          ) : ing.is_wip && ing.wip_lot_verified === false ? (
                            <span className="text-amber-600 text-[10px]">⚠ unverified</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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

export default function LotTraceabilityPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as { role?: string })?.role ?? "";

  const [allRows,      setAllRows]      = useState<LotRow[]>([]);
  const [products,     setProducts]     = useState<string[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [selected,     setSelected]     = useState<LotRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LotRow | null>(null);
  const [deleting,     setDeleting]     = useState(false);
  const [toast,        setToast]        = useState<string | null>(null);

  // Filters
  const [fProduct,  setFProduct]  = useState("");
  const [fDateFrom, setFDateFrom] = useState("");
  const [fDateTo,   setFDateTo]   = useState("");
  const [fLot,      setFLot]      = useState("");

  // Sort & pagination
  const [sortKey, setSortKey] = useState<SortKey>("production_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page,    setPage]    = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (fProduct)  params.set("product",   fProduct);
    if (fDateFrom) params.set("date_from", fDateFrom);
    if (fDateTo)   params.set("date_to",   fDateTo);
    if (fLot)      params.set("lot",       fLot);
    try {
      const res = await fetch(`/api/logs/lot-traceability?${params}`);
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
  }, [fProduct, fDateFrom, fDateTo, fLot]);

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

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/batch-sheet/${deleteTarget.id}`, { method: "DELETE" });
      if (r.ok) {
        setAllRows((prev) => prev.filter((row) => row.id !== deleteTarget.id));
        setDeleteTarget(null);
        setToast("Record deleted successfully.");
        setTimeout(() => setToast(null), 3500);
      } else {
        const err = await r.json().catch(() => ({}));
        alert(err.error ?? "Failed to delete record.");
      }
    } catch { alert("An unexpected error occurred."); }
    finally { setDeleting(false); }
  }

  function clearFilters() {
    setFProduct(""); setFDateFrom(""); setFDateTo(""); setFLot("");
  }

  function applyFilters() {
    fetchData();
  }

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

  const hasFilters = fProduct || fDateFrom || fDateTo || fLot;

  if (status === "loading") return null;
  if (role !== "SUPERVISOR" && role !== "ADMIN") {
    return <div className="flex items-center gap-2 text-[#D64D4D] font-mono text-sm"><AlertCircle className="w-4 h-4" /> Access restricted.</div>;
  }

  return (
    <>
      {selected && <RowModal row={selected} onClose={() => setSelected(null)} />}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-md border border-gray-200 shadow-xl w-full max-w-md">
            <div className="flex items-start gap-3 px-6 pt-6 pb-4">
              <div className="shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-[#D64D4D]" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 text-lg">Delete Lot Traceability Record</h2>
                <p className="text-xs text-gray-500 font-mono mt-0.5">This action cannot be undone.</p>
              </div>
            </div>
            <div className="px-6 pb-4">
              <p className="text-sm text-gray-700 mb-3">You are about to permanently delete this record:</p>
              <div className="bg-gray-50 border border-gray-200 rounded-md p-4 space-y-1.5 text-sm font-mono">
                <div className="flex gap-2"><span className="text-gray-400 w-24 shrink-0">Date</span><span className="text-gray-800 font-semibold">{fmtDate(deleteTarget.production_date)}</span></div>
                <div className="flex gap-2"><span className="text-gray-400 w-24 shrink-0">Product</span><span className="text-gray-800">{deleteTarget.product}</span></div>
                <div className="flex gap-2"><span className="text-gray-400 w-24 shrink-0">Lot</span><span className="text-gray-800">{deleteTarget.lot ?? "—"}</span></div>
              </div>
              <p className="text-xs text-gray-500 mt-3">This will remove the record from all logs. Are you sure?</p>
            </div>
            <div className="px-6 pb-6 flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="btn-secondary disabled:opacity-50">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#D64D4D] hover:bg-[#c44] text-white text-sm font-semibold transition-colors disabled:opacity-60">
                {deleting ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Deleting…</> : <><Trash2 className="w-3.5 h-3.5" />Delete Record</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm font-mono px-4 py-2.5 rounded-md shadow-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />{toast}
        </div>
      )}

      <div className="space-y-5 max-w-7xl">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <BookMarked className="w-6 h-6 text-[#D64D4D]" />
              Lot Traceability Log
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
              onClick={() => exportPDF(sorted, { product: fProduct, dateFrom: fDateFrom, dateTo: fDateTo, lot: fLot })}
              disabled={sorted.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-[#D64D4D] rounded hover:bg-red-50 text-[#D64D4D] transition-colors disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" /> Export PDF
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="card p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[160px]">
              <label className="label">Product</label>
              <select className="input" value={fProduct} onChange={(e) => setFProduct(e.target.value)}>
                <option value="">All Products</option>
                {products.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="label">From</label>
              <DateInput className="input" value={fDateFrom} onChange={setFDateFrom} />
            </div>
            <div>
              <label className="label">To</label>
              <DateInput className="input" value={fDateTo} onChange={setFDateTo} />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="label">Lot #</label>
              <input className="input" value={fLot} placeholder="Search lot…" onChange={(e) => setFLot(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()} />
            </div>
            <button onClick={applyFilters} className="btn-primary text-xs py-2">Apply</button>
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
              <BookMarked className="w-10 h-10 text-gray-200 mx-auto mb-3" />
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
                      <SortTh label="Production Date" col="production_date" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <SortTh label="Lot"             col="lot"             sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <SortTh label="Product"         col="product"         sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <SortTh label="Base Units Produced" col="bowls_produced"  sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <SortTh label="Items Produced"  col="items_produced"  sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <SortTh label="Presentation"    col="presentations"   sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap">Yield</th>
                      <SortTh label="Expiration Date" col="expiration_date" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <th className="px-4 py-3 w-10" />
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
                        <td className="px-4 py-3 font-mono text-gray-700 whitespace-nowrap">{fmtDate(row.production_date)}</td>
                        <td className="px-4 py-3 font-mono text-gray-600 text-xs whitespace-nowrap">{row.lot ?? "—"}</td>
                        <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            {row.product}
                            {row.product_id && (
                              <a
                                href={`/supplier-management/products/${row.product_id}`}
                                onClick={(e) => e.stopPropagation()}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="View product"
                                className="text-gray-300 hover:text-[#D64D4D]"
                              >
                                <BookMarked className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-gray-600">{fmtBaseUnits(row)}</td>
                        <td className="px-4 py-3 text-center font-mono text-gray-800 font-semibold">{row.items_produced ?? "—"}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{row.presentations}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">{row.yield ?? "N/A"}</td>
                        <td className="px-4 py-3 font-mono text-gray-700 whitespace-nowrap">{row.has_expiration_date === false ? "N/A" : fmtDate(row.expiration_date)}</td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <Eye className="w-3.5 h-3.5 text-gray-300" />
                            {role === "ADMIN" && (
                              <button onClick={() => setDeleteTarget(row)} title="Delete record" className="p-1.5 text-gray-300 hover:text-[#D64D4D] transition-colors rounded hover:bg-red-50">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
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
