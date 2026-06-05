"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { FlaskConical, Plus, Search, Eye, Pencil, AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";

type TemplateRef = { id: string; name: string };

type SupplierExposureItem = {
  supplierId: string;
  supplierName: string;
  materialName: string;
  supplierStatus: string;
};

type Product = {
  id: string;
  name: string;
  category: string | null;
  productCode: string | null;
  description: string | null;
  isActive: boolean;
  recipe: unknown[];
  allergenProfile: string[];
  isOrganic: boolean;
  isGlutenFree: boolean;
  supplierExposure: SupplierExposureItem[];
  templates: TemplateRef[];
};

function summarizeExposure(items: SupplierExposureItem[]): { count: number; colorClass: string; label: string } {
  const uniq = new Set(items.map((i) => i.supplierId));
  const count = uniq.size;
  if (count === 0) return { count, colorClass: "text-gray-400 bg-gray-100", label: "No suppliers" };
  if (items.some((i) => i.supplierStatus === "EXPIRED")) {
    return { count, colorClass: "text-red-700 bg-red-50", label: `${count} supplier${count !== 1 ? "s" : ""} · EXPIRED` };
  }
  if (items.some((i) => i.supplierStatus === "PENDING" || i.supplierStatus === "EXPIRING_SOON")) {
    return { count, colorClass: "text-amber-700 bg-amber-50", label: `${count} supplier${count !== 1 ? "s" : ""} · Pending` };
  }
  return { count, colorClass: "text-green-700 bg-green-50", label: `${count} supplier${count !== 1 ? "s" : ""} · Approved` };
}

export default function ProductsListPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role ?? "";
  const isAdmin = role === "ADMIN";

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [linkedFilter, setLinkedFilter] = useState<"all" | "linked" | "unlinked">("all");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleDeactivate(p: Product) {
    if (!confirm(`Deactivate product "${p.name}"?`)) return;
    try {
      const res = await fetch(`/api/products/${p.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Could not deactivate.");
        return;
      }
      setToast("Product deactivated.");
      setTimeout(() => setToast(null), 3000);
      load();
    } catch {
      alert("Unexpected error.");
    }
  }

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p.category && set.add(p.category));
    return Array.from(set).sort();
  }, [products]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q.toLowerCase())) return false;
      if (categoryFilter && p.category !== categoryFilter) return false;
      if (linkedFilter === "linked" && p.templates.length === 0) return false;
      if (linkedFilter === "unlinked" && p.templates.length > 0) return false;
      return true;
    });
  }, [products, q, categoryFilter, linkedFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, Product[]>();
    filtered.forEach((p) => {
      const key = p.category ?? "Uncategorized";
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])) as Array<[string, Product[]]>;
  }, [filtered]);

  return (
    <div className="space-y-5 max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FlaskConical className="w-6 h-6 text-[#D64D4D]" />
            Products
          </h1>
          <p className="page-subtitle">Master recipe registry — defines what ingredients (and which suppliers) each product uses.</p>
        </div>
        {isAdmin && (
          <Link href="/supplier-management/products/new" className="btn-primary flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Add Product
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="label">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
              <input
                className="input pl-8"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name…"
              />
            </div>
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">All</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Linked status</label>
            <select
              className="input"
              value={linkedFilter}
              onChange={(e) => setLinkedFilter(e.target.value as "all" | "linked" | "unlinked")}
            >
              <option value="all">All</option>
              <option value="linked">Linked to template</option>
              <option value="unlinked">No template</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm font-mono">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {loading ? (
        <div className="card p-12 flex items-center justify-center gap-2 text-gray-400 font-mono text-sm">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-[#D64D4D] rounded-full animate-spin" />
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <FlaskConical className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500 font-mono">No products match the current filters.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([category, items]) => (
            <div key={category} className="space-y-2">
              <h2 className="text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider">{category}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {items.map((p) => {
                  const exposure = summarizeExposure(p.supplierExposure);
                  return (
                    <div key={p.id} className="card p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link href={`/supplier-management/products/${p.id}`} className="font-semibold text-gray-900 hover:text-[#D64D4D]">{p.name}</Link>
                          <p className="text-xs text-gray-500 font-mono">
                            {p.productCode ? `${p.productCode} · ` : ""}{(p.recipe ?? []).length} ingredient{(p.recipe ?? []).length !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Link href={`/supplier-management/products/${p.id}`} className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100" title="View">
                            <Eye className="w-4 h-4" />
                          </Link>
                          {isAdmin && (
                            <>
                              <Link href={`/supplier-management/products/${p.id}/edit`} className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100" title="Edit">
                                <Pencil className="w-4 h-4" />
                              </Link>
                              <button onClick={() => handleDeactivate(p)} className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50" title="Deactivate">
                                <AlertTriangle className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {(p.allergenProfile ?? []).map((a) => (
                          <span key={a} className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded-full">{a}</span>
                        ))}
                        {p.isOrganic && (
                          <span className="bg-green-100 text-green-800 text-[10px] px-1.5 py-0.5 rounded-full">ORGANIC</span>
                        )}
                        {p.isGlutenFree && (
                          <span className="bg-blue-100 text-blue-800 text-[10px] px-1.5 py-0.5 rounded-full">GLUTEN FREE</span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                        <span className={`px-2 py-0.5 rounded ${exposure.colorClass}`}>{exposure.label}</span>
                        {p.templates.length > 0 ? (
                          <span className="px-2 py-0.5 rounded bg-green-50 text-green-700">Linked: {p.templates[0].name}</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-500">No template</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm font-mono px-4 py-2.5 rounded-md shadow-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />{toast}
        </div>
      )}
    </div>
  );
}
