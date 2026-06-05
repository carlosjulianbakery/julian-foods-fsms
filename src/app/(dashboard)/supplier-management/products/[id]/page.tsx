"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft, Pencil, FlaskConical, ExternalLink } from "lucide-react";

type SupplierExposureItem = {
  supplierId: string;
  supplierName: string;
  materialName: string;
  supplierStatus: string;
};

type RecipeItem = {
  id: string;
  materialId: string;
  materialName: string;
  quantity: number;
  unit: string;
  isAllergen?: boolean;
  isOrganic?: boolean;
  isGlutenFree?: boolean;
};

type Submission = {
  id: string;
  productionDate: string;
  productionLot: string | null;
  supervisorName: string;
  status: string;
  templateName: string;
};

type PresentationPackagingMaterial = {
  id: string;
  material_id: string;
  material_name: string;
  food_contact: boolean;
};

type Presentation = {
  id: string;
  name: string;
  upc: string;
  packaging_materials: PresentationPackagingMaterial[];
};

type Product = {
  id: string;
  name: string;
  category: string | null;
  productCode: string | null;
  description: string | null;
  isActive: boolean;
  shelfLifeMonths: number | null;
  recipe: RecipeItem[];
  allergenProfile: string[];
  isOrganic: boolean;
  isGlutenFree: boolean;
  supplierExposure: SupplierExposureItem[];
  presentations: Presentation[];
  templates: Array<{ id: string; name: string }>;
  submissions: Submission[];
};

function statusBadge(s: string): string {
  if (s === "APPROVED") return "bg-green-50 text-green-700";
  if (s === "EXPIRED") return "bg-red-50 text-red-700";
  if (s === "EXPIRING_SOON") return "bg-amber-50 text-amber-700";
  if (s === "PENDING") return "bg-yellow-50 text-yellow-700";
  return "bg-gray-100 text-gray-500";
}

function fmtDate(d: string) {
  try { return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" }); }
  catch { return d; }
}

export default function ProductDetailPage({ params }: { params: { id: string } }) {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string })?.role === "ADMIN";

  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/products/${params.id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setProduct(await r.json());
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [params.id]);

  if (error) return <div className="card p-6 text-sm text-red-600">{error}</div>;
  if (!product) {
    return (
      <div className="card p-12 flex items-center justify-center gap-2 text-gray-400 font-mono text-sm">
        <div className="w-4 h-4 border-2 border-gray-300 border-t-[#D64D4D] rounded-full animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <Link href="/supplier-management/products" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 font-mono">
          <ArrowLeft className="w-4 h-4" /> Back to Products
        </Link>
        {isAdmin && (
          <Link href={`/supplier-management/products/${product.id}/edit`} className="btn-secondary flex items-center gap-1.5">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Link>
        )}
      </div>

      {/* Header */}
      <div className="card p-6 space-y-3">
        <div className="flex items-start gap-3">
          <FlaskConical className="w-6 h-6 text-[#D64D4D] shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-gray-900">{product.name}</h1>
            <p className="text-xs text-gray-500 font-mono mt-1">
              {product.productCode ? `${product.productCode} · ` : ""}
              {product.category ?? "Uncategorized"}
              {!product.isActive && " · INACTIVE"}
            </p>
            {product.description && <p className="text-sm text-gray-600 mt-2">{product.description}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {(product.allergenProfile ?? []).map((a) => (
            <span key={a} className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full">{a}</span>
          ))}
          {product.isOrganic && (
            <span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full">ORGANIC</span>
          )}
          {product.isGlutenFree && (
            <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">GLUTEN FREE</span>
          )}
        </div>
      </div>

      {/* Recipe */}
      <div className="card p-6 space-y-3">
        <h2 className="text-sm font-mono font-semibold text-gray-500 uppercase tracking-wider">Recipe</h2>
        {product.recipe.length === 0 ? (
          <p className="text-xs text-gray-400 font-mono">No ingredients defined.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal w-8">#</th>
                  <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal">Material</th>
                  <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal">Qty / Bowl</th>
                  <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal">Unit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {product.recipe.map((r, i) => (
                  <tr key={r.id}>
                    <td className="py-1.5 pr-3 text-gray-400 font-mono text-xs">{i + 1}</td>
                    <td className="py-1.5 pr-3 text-gray-800">
                      {r.materialId ? (
                        <Link href={`/supplier-management/materials/${r.materialId}/edit`} className="hover:text-[#D64D4D]">{r.materialName}</Link>
                      ) : (
                        r.materialName
                      )}
                    </td>
                    <td className="py-1.5 pr-3 font-mono text-gray-700">{r.quantity}</td>
                    <td className="py-1.5 pr-3 font-mono text-gray-500">{r.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Presentations & Packaging */}
      <div className="card p-6 space-y-3">
        <h2 className="text-sm font-mono font-semibold text-gray-500 uppercase tracking-wider">Presentations &amp; Packaging</h2>
        {(product.presentations ?? []).length === 0 ? (
          <p className="text-xs text-gray-400 font-mono">No presentations defined.</p>
        ) : (
          <div className="space-y-4">
            {(product.presentations ?? []).map((pres) => (
              <div key={pres.id} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between bg-gray-50 px-4 py-3 border-b border-gray-100">
                  <div>
                    <p className="font-semibold text-sm text-gray-800">{pres.name}</p>
                    {pres.upc && <p className="text-xs text-gray-500 font-mono mt-0.5">UPC: {pres.upc}</p>}
                  </div>
                </div>
                {pres.packaging_materials.length === 0 ? (
                  <p className="text-xs text-gray-400 font-mono p-4">No packaging materials defined.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 px-4 text-xs font-mono text-gray-400 font-normal">Material</th>
                        <th className="text-left py-2 px-4 text-xs font-mono text-gray-400 font-normal">Food Contact</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {pres.packaging_materials.map((mat) => (
                        <tr key={mat.id}>
                          <td className="py-2 px-4 text-gray-800">{mat.material_name}</td>
                          <td className="py-2 px-4">
                            {mat.food_contact && (
                              <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded font-mono">Food Contact</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Supplier Exposure */}
      <div className="card p-6 space-y-3">
        <h2 className="text-sm font-mono font-semibold text-gray-500 uppercase tracking-wider">Supplier Exposure</h2>
        {product.supplierExposure.length === 0 ? (
          <p className="text-xs text-gray-400 font-mono">No supplier exposure recorded.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal">Supplier</th>
                <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal">Material</th>
                <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {product.supplierExposure.map((s, i) => (
                <tr key={i}>
                  <td className="py-1.5 pr-3">
                    <Link href={`/supplier-management/suppliers/${s.supplierId}`} className="text-gray-800 hover:text-[#D64D4D]">{s.supplierName}</Link>
                  </td>
                  <td className="py-1.5 pr-3 text-gray-700">{s.materialName}</td>
                  <td className="py-1.5 pr-3">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusBadge(s.supplierStatus)}`}>{s.supplierStatus}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Linked Template */}
      <div className="card p-6 space-y-3">
        <h2 className="text-sm font-mono font-semibold text-gray-500 uppercase tracking-wider">Linked Batch Sheet Template</h2>
        {product.templates.length === 0 ? (
          <p className="text-xs text-gray-400 font-mono">No template linked.</p>
        ) : (
          <ul className="space-y-1">
            {product.templates.map((t) => (
              <li key={t.id}>
                <Link href={`/dashboard/admin/batch-sheet-templates/${t.id}/edit`} className="inline-flex items-center gap-1.5 text-sm text-gray-800 hover:text-[#D64D4D]">
                  {t.name} <ExternalLink className="w-3 h-3" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Recent Production */}
      <div className="card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-mono font-semibold text-gray-500 uppercase tracking-wider">Recent Production</h2>
          <Link
            href={`/dashboard/logs/lot-traceability?productId=${product.id}`}
            className="text-xs text-[#D64D4D] hover:underline font-mono"
          >
            View all →
          </Link>
        </div>
        {product.submissions.length === 0 ? (
          <p className="text-xs text-gray-400 font-mono">No production submissions yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal">Date</th>
                <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal">Lot</th>
                <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal">Supervisor</th>
                <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {product.submissions.slice(0, 5).map((s) => (
                <tr key={s.id}>
                  <td className="py-1.5 pr-3 font-mono text-gray-700">{fmtDate(s.productionDate)}</td>
                  <td className="py-1.5 pr-3 font-mono text-gray-700 text-xs">{s.productionLot ?? "—"}</td>
                  <td className="py-1.5 pr-3 text-gray-700">{s.supervisorName}</td>
                  <td className="py-1.5 pr-3 text-xs font-mono text-gray-500">{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
