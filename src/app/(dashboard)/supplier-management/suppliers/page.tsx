"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Building2, Plus, Search, CheckCircle2, AlertTriangle, Clock, XCircle, HelpCircle, Trash2, Lock } from "lucide-react";

const STATUSES = ["APPROVED", "EXPIRING_SOON", "EXPIRED", "PENDING", "INACTIVE"] as const;
type SupplierStatus = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<SupplierStatus, string> = {
  APPROVED: "Approved",
  EXPIRING_SOON: "Expiring Soon",
  EXPIRED: "Expired",
  PENDING: "Pending",
  INACTIVE: "Inactive",
};

export const STATUS_COLOR: Record<SupplierStatus, string> = {
  APPROVED: "bg-green-50 text-green-700",
  EXPIRING_SOON: "bg-amber-50 text-amber-700",
  EXPIRED: "bg-red-50 text-red-700",
  PENDING: "bg-yellow-50 text-yellow-700",
  INACTIVE: "bg-gray-100 text-gray-500",
};

export const STATUS_ICON: Record<SupplierStatus, React.ReactNode> = {
  APPROVED: <CheckCircle2 className="w-3.5 h-3.5" />,
  EXPIRING_SOON: <Clock className="w-3.5 h-3.5" />,
  EXPIRED: <XCircle className="w-3.5 h-3.5" />,
  PENDING: <HelpCircle className="w-3.5 h-3.5" />,
  INACTIVE: <AlertTriangle className="w-3.5 h-3.5" />,
};

interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  status: SupplierStatus;
  isSystemLocked?: boolean;
  materials: { material: { id: string; name: string; category: string; materialType?: string } }[];
  brands?: { id: string; brandName: string }[];
}

type SupplierTypeBadge = { label: string; colorClass: string };

function computeTypeBadges(materials: Supplier["materials"]): SupplierTypeBadge[] {
  if (materials.length === 0) {
    return [{ label: "No materials linked yet", colorClass: "bg-gray-100 text-gray-500" }];
  }
  const badges: SupplierTypeBadge[] = [];
  const cats = new Set(materials.map((m) => m.material.category));
  const types = new Set(materials.map((m) => m.material.materialType ?? "raw"));
  if (types.has("wip")) badges.push({ label: "Internal", colorClass: "bg-blue-50 text-blue-700" });
  if (cats.has("INGREDIENT")) badges.push({ label: "Ingredient Supplier", colorClass: "bg-green-50 text-green-700" });
  if (cats.has("PACKAGING")) badges.push({ label: "Packaging Supplier", colorClass: "bg-sky-50 text-sky-700" });
  if (cats.has("OTHER")) badges.push({ label: "Other Supplier", colorClass: "bg-gray-100 text-gray-600" });
  return badges.length > 0 ? badges : [{ label: "No materials linked yet", colorClass: "bg-gray-100 text-gray-500" }];
}

const TYPE_FILTER_OPTIONS = [
  { value: "ingredient", label: "Ingredient Supplier" },
  { value: "packaging", label: "Packaging Supplier" },
  { value: "other", label: "Other Supplier" },
  { value: "internal", label: "Internal" },
  { value: "none", label: "No materials linked" },
] as const;

function supplierMatchesTypeFilter(sup: Supplier, typeFilters: Set<string>): boolean {
  if (typeFilters.size === 0) return true;
  const cats = new Set(sup.materials.map((m) => m.material.category));
  const types = new Set(sup.materials.map((m) => m.material.materialType ?? "raw"));
  if (typeFilters.has("ingredient") && cats.has("INGREDIENT")) return true;
  if (typeFilters.has("packaging") && cats.has("PACKAGING")) return true;
  if (typeFilters.has("other") && cats.has("OTHER")) return true;
  if (typeFilters.has("internal") && types.has("wip")) return true;
  if (typeFilters.has("none") && sup.materials.length === 0) return true;
  return false;
}

export default function SuppliersPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const role = (session?.user as { role?: string })?.role ?? "";
  const isAdmin = role === "ADMIN";

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [typeFilters, setTypeFilters] = useState<Set<string>>(new Set());

  const statusParam = searchParams.get("status") ?? "";
  const qParam = searchParams.get("q") ?? "";

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (statusParam) p.set("status", statusParam);
    if (qParam) p.set("q", qParam);
    try {
      const res = await fetch(`/api/supplier-management/suppliers?${p}`);
      if (res.ok) setSuppliers(await res.json());
    } finally {
      setLoading(false);
    }
  }, [statusParam, qParam]);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  function toggleTypeFilter(value: string) {
    setTypeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/supplier-management/suppliers/${deleteTarget.id}`, { method: "DELETE" });
      if (r.ok) {
        setSuppliers((prev) => prev.filter((s) => s.id !== deleteTarget.id));
        setDeleteTarget(null);
        setToast("Supplier deactivated.");
        setTimeout(() => setToast(null), 3500);
      } else {
        alert("Failed to deactivate supplier.");
      }
    } catch { alert("An unexpected error occurred."); }
    finally { setDeleting(false); }
  }

  return (
    <div className="max-w-5xl space-y-6">
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-md border border-gray-200 shadow-xl w-full max-w-md">
            <div className="flex items-start gap-3 px-6 pt-6 pb-4">
              <div className="shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-[#D64D4D]" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 text-lg">Deactivate Supplier</h2>
                <p className="text-xs text-gray-500 font-mono mt-0.5">Supplier will be hidden from all views.</p>
              </div>
            </div>
            <div className="px-6 pb-4">
              <div className="bg-gray-50 border border-gray-200 rounded-md p-4 text-sm font-mono space-y-1">
                <div className="flex gap-2"><span className="text-gray-400 w-20 shrink-0">Name</span><span className="font-semibold text-gray-900">{deleteTarget.name}</span></div>
                <div className="flex gap-2"><span className="text-gray-400 w-20 shrink-0">Status</span><span className="text-gray-800">{STATUS_LABEL[deleteTarget.status]}</span></div>
              </div>
            </div>
            <div className="px-6 pb-6 flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="btn-secondary disabled:opacity-50">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#D64D4D] hover:bg-[#c44] text-white text-sm font-semibold transition-colors disabled:opacity-60">
                {deleting ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Deactivating…</> : <><Trash2 className="w-3.5 h-3.5" />Deactivate</>}
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

      <div className="page-header">
        <div>
          <h1 className="page-title">Suppliers</h1>
          <p className="page-subtitle">Approved vendor registry and compliance tracking</p>
        </div>
        {isAdmin && (
          <Link href="/supplier-management/suppliers/new" className="btn-primary">
            <Plus className="w-4 h-4" /> New Supplier
          </Link>
        )}
      </div>

      {/* Status summary chips */}
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => {
          const count = suppliers.filter((sup) => sup.status === s).length;
          if (!loading && count === 0) return null;
          return (
            <button
              key={s}
              onClick={() => router.push(`/supplier-management/suppliers?status=${statusParam === s ? "" : s}`)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                statusParam === s ? STATUS_COLOR[s] + " border-current" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {STATUS_ICON[s]} {STATUS_LABEL[s]} {!loading && <span className="opacity-60">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Type filter */}
      <div className="card px-4 py-3">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-xs font-medium text-gray-500 shrink-0">Filter by type:</span>
          <div className="flex flex-wrap gap-3">
            {TYPE_FILTER_OPTIONS.map((opt) => (
              <label key={opt.value} className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 rounded border-gray-300 accent-[#D64D4D]"
                  checked={typeFilters.has(opt.value)}
                  onChange={() => toggleTypeFilter(opt.value)}
                />
                <span className="text-xs text-gray-700">{opt.label}</span>
              </label>
            ))}
            {typeFilters.size > 0 && (
              <button onClick={() => setTypeFilters(new Set())} className="text-xs text-gray-400 hover:text-gray-600 underline">
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="card p-4">
        <form
          method="GET"
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const p = new URLSearchParams();
            const q = fd.get("q") as string;
            if (q) p.set("q", q);
            if (statusParam) p.set("status", statusParam);
            router.push(`/supplier-management/suppliers?${p}`);
          }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input name="q" defaultValue={qParam} placeholder="Search suppliers…" className="input pl-9" />
          </div>
          <button type="submit" className="btn-secondary">Search</button>
          {(qParam || statusParam) && <Link href="/supplier-management/suppliers" className="btn-secondary">Clear</Link>}
        </form>
      </div>

      {loading ? (
        <div className="card p-12 flex items-center justify-center gap-2 text-gray-400 font-mono text-sm">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-[#D64D4D] rounded-full animate-spin" />
          Loading suppliers…
        </div>
      ) : suppliers.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-gray-400">
          <Building2 className="w-10 h-10 mb-3" />
          <p className="font-medium text-gray-600">No suppliers found</p>
          {isAdmin && (
            <Link href="/supplier-management/suppliers/new" className="btn-primary mt-4">
              <Plus className="w-4 h-4" /> Add Supplier
            </Link>
          )}
        </div>
      ) : (() => {
        const filtered = suppliers.filter((sup) => supplierMatchesTypeFilter(sup, typeFilters));
        return filtered.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-12 text-gray-400">
            <Building2 className="w-8 h-8 mb-2" />
            <p className="text-sm font-medium text-gray-500">No suppliers match the selected filters</p>
            <button onClick={() => setTypeFilters(new Set())} className="mt-2 text-xs text-[#D64D4D] hover:underline">
              Clear type filters
            </button>
          </div>
        ) : (
        <div className="card divide-y divide-gray-100">
          {filtered.map((sup) => {
            const typeBadges = computeTypeBadges(sup.materials);
            return (
            <div key={sup.id} className="flex items-start gap-4 px-6 py-4 hover:bg-gray-50 transition-colors group">
              <Link href={`/supplier-management/suppliers/${sup.id}`} className="flex items-start gap-4 flex-1 min-w-0">
                <div className="w-9 h-9 bg-teal-50 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                  <Building2 className="w-4 h-4 text-teal-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <p className="font-medium text-gray-900">{sup.name}</p>
                    {typeBadges.map((b) => (
                      <span key={b.label} className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${b.colorClass}`}>
                        {b.label}
                      </span>
                    ))}
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[sup.status]}`}>
                      {STATUS_ICON[sup.status]} {STATUS_LABEL[sup.status]}
                    </span>
                  </div>
                  {sup.contactName && <p className="text-sm text-gray-500">{sup.contactName}</p>}
                  {sup.materials.length > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {sup.materials.slice(0, 4).map((m) => m.material.name).join(", ")}
                      {sup.materials.length > 4 && ` +${sup.materials.length - 4} more`}
                    </p>
                  )}
                  {(sup.brands?.length ?? 0) > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {sup.brands!.length} brand{sup.brands!.length !== 1 ? "s" : ""}:{" "}
                      {sup.brands!.map((b) => b.brandName).join(", ")}
                    </p>
                  )}
                </div>
              </Link>
              {isAdmin && (
                sup.isSystemLocked ? (
                  <span title="System-locked — cannot be deleted" className="shrink-0 p-1.5 text-gray-300 opacity-0 group-hover:opacity-100">
                    <Lock className="w-4 h-4" />
                  </span>
                ) : (
                  <button
                    onClick={() => setDeleteTarget(sup)}
                    title="Deactivate supplier"
                    className="shrink-0 p-1.5 text-gray-300 hover:text-[#D64D4D] transition-colors rounded hover:bg-red-50 opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )
              )}
            </div>
            );
          })}
        </div>
        );
      })()}
    </div>
  );
}
