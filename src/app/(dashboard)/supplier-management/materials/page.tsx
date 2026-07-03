"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Package, Plus, Search, Pencil, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";

const CATEGORIES = ["INGREDIENT", "PACKAGING", "OTHER"] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_LABEL: Record<Category, string> = {
  INGREDIENT: "Ingredient",
  PACKAGING: "Packaging",
  OTHER: "Other",
};

const CATEGORY_COLOR: Record<Category, string> = {
  INGREDIENT: "bg-green-50 text-green-700",
  PACKAGING: "bg-blue-50 text-blue-700",
  OTHER: "bg-gray-100 text-gray-600",
};

interface Supplier {
  id: string;
  name: string;
  status: string;
}

interface Material {
  id: string;
  name: string;
  description: string | null;
  category: Category;
  unit: string | null;
  isOrganic: boolean;
  isAllergen: boolean;
  allergens: string[] | null;
  isGlutenFree: boolean;
  hasSpecialRisk: boolean;
  isActive: boolean;
  materialType?: string;
  suppliers: { supplier: Supplier }[];
}

export default function MaterialsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const role = (session?.user as { role?: string })?.role ?? "";
  const isAdmin = role === "ADMIN";

  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const categoryParam = searchParams.get("category") ?? "";

  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (categoryParam) p.set("category", categoryParam);
    try {
      const res = await fetch(`/api/supplier-management/materials?${p}`);
      if (res.ok) setMaterials(await res.json());
    } finally {
      setLoading(false);
    }
  }, [categoryParam]);

  const filteredMaterials = useMemo(() => {
    const lq = q.toLowerCase().trim();
    if (!lq) return materials;
    return materials.filter((mat) =>
      mat.name.toLowerCase().includes(lq) ||
      CATEGORY_LABEL[mat.category].toLowerCase().includes(lq) ||
      mat.suppliers.some((s) => s.supplier.name.toLowerCase().includes(lq))
    );
  }, [materials, q]);

  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/supplier-management/materials/${deleteTarget.id}`, { method: "DELETE" });
      if (r.ok) {
        setMaterials((prev) => prev.filter((m) => m.id !== deleteTarget.id));
        setDeleteTarget(null);
        setToast("Material deleted.");
        setTimeout(() => setToast(null), 3500);
      } else {
        alert("Failed to delete material.");
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
                <h2 className="font-bold text-gray-900 text-lg">Delete Material</h2>
                <p className="text-xs text-gray-500 font-mono mt-0.5">This cannot be undone.</p>
              </div>
            </div>
            <div className="px-6 pb-4">
              <div className="bg-gray-50 border border-gray-200 rounded-md p-4 text-sm font-mono space-y-1">
                <div className="flex gap-2"><span className="text-gray-400 w-20 shrink-0">Name</span><span className="font-semibold text-gray-900">{deleteTarget.name}</span></div>
                <div className="flex gap-2"><span className="text-gray-400 w-20 shrink-0">Category</span><span className="text-gray-800">{CATEGORY_LABEL[deleteTarget.category]}</span></div>
              </div>
            </div>
            <div className="px-6 pb-6 flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="btn-secondary disabled:opacity-50">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#D64D4D] hover:bg-[#c44] text-white text-sm font-semibold transition-colors disabled:opacity-60">
                {deleting ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Deleting…</> : <><Trash2 className="w-3.5 h-3.5" />Delete</>}
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
          <h1 className="page-title">Materials Registry</h1>
          <p className="page-subtitle">Ingredients, packaging, and other materials used in production</p>
        </div>
        {isAdmin && (
          <Link href="/supplier-management/materials/new" className="btn-primary">
            <Plus className="w-4 h-4" /> New Material
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search materials..."
              className="input pl-9"
            />
          </div>
          <select
            value={categoryParam}
            onChange={(e) => {
              const p = new URLSearchParams();
              if (e.target.value) p.set("category", e.target.value);
              router.push(`/supplier-management/materials?${p}`);
            }}
            className="input w-44"
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
          {categoryParam && <Link href="/supplier-management/materials" className="btn-secondary">Clear</Link>}
        </div>
      </div>

      {loading ? (
        <div className="card p-12 flex items-center justify-center gap-2 text-gray-400 font-mono text-sm">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-[#D64D4D] rounded-full animate-spin" />
          Loading materials…
        </div>
      ) : materials.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-gray-400">
          <Package className="w-10 h-10 mb-3" />
          <p className="font-medium text-gray-600">No materials found</p>
          {isAdmin && (
            <Link href="/supplier-management/materials/new" className="btn-primary mt-4">
              <Plus className="w-4 h-4" /> Add Material
            </Link>
          )}
        </div>
      ) : filteredMaterials.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 text-gray-400">
          <Package className="w-8 h-8 mb-2" />
          <p className="text-sm font-medium text-gray-500">No materials match your search</p>
        </div>
      ) : (
        <div className="card divide-y divide-gray-100">
          {filteredMaterials.map((mat) => (
            <div key={mat.id} className="flex items-start gap-4 px-6 py-4 hover:bg-gray-50 transition-colors group">
              <Link href={`/supplier-management/materials/${mat.id}/edit`} className="flex items-start gap-4 flex-1 min-w-0">
                <div className="w-9 h-9 bg-indigo-50 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                  <Package className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <p className="font-medium text-gray-900">{mat.name}
                      {mat.materialType === "wip" && (
                        <span className="ml-1.5 text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">IN-HOUSE</span>
                      )}
                    </p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLOR[mat.category]}`}>
                      {CATEGORY_LABEL[mat.category]}
                    </span>
                    {mat.unit && <span className="text-xs text-gray-400">{mat.unit}</span>}
                    {mat.isOrganic && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-50 text-green-700">
                        ORGANIC
                      </span>
                    )}
                    {mat.isAllergen && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700 cursor-default"
                        title={mat.allergens && mat.allergens.length > 0 ? `Contains: ${mat.allergens.join(", ")}` : "Allergen"}
                      >
                        ALLERGEN
                      </span>
                    )}
                    {mat.isGlutenFree && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700">GLUTEN FREE</span>
                    )}
                    {mat.hasSpecialRisk && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-50 text-[#D64D4D]">SPECIAL RISK</span>
                    )}
                  </div>
                  {mat.description && <p className="text-sm text-gray-500 truncate">{mat.description}</p>}
                  {mat.suppliers.length > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {mat.suppliers.length} supplier{mat.suppliers.length !== 1 ? "s" : ""}:{" "}
                      {mat.suppliers.slice(0, 3).map((s) => s.supplier.name).join(", ")}
                    </p>
                  )}
                </div>
              </Link>
              {isAdmin && (
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Link href={`/supplier-management/materials/${mat.id}/edit`} title="Edit" className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100">
                    <Pencil className="w-3.5 h-3.5" />
                  </Link>
                  <button onClick={() => setDeleteTarget(mat)} title="Delete" className="p-1.5 text-gray-300 hover:text-[#D64D4D] rounded hover:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
