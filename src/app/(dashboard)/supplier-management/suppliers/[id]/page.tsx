"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  ArrowLeft, Building2, Pencil, FileText, Upload, Trash2,
  CheckCircle2, AlertTriangle, Clock, XCircle, HelpCircle,
  Package, ExternalLink, Lock
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { filterApplicableRequirements, getTriggerLabel, type MaterialAttrs } from "@/lib/document-trigger";

type SupplierStatus = "APPROVED" | "EXPIRING_SOON" | "EXPIRED" | "PENDING" | "INACTIVE";

const STATUS_LABEL: Record<SupplierStatus, string> = {
  APPROVED: "Approved", EXPIRING_SOON: "Expiring Soon",
  EXPIRED: "Expired", PENDING: "Pending", INACTIVE: "Inactive",
};
const STATUS_COLOR: Record<SupplierStatus, string> = {
  APPROVED: "bg-green-50 text-green-700", EXPIRING_SOON: "bg-amber-50 text-amber-700",
  EXPIRED: "bg-red-50 text-red-700", PENDING: "bg-yellow-50 text-yellow-700",
  INACTIVE: "bg-gray-100 text-gray-500",
};
const STATUS_ICON: Record<SupplierStatus, React.ReactNode> = {
  APPROVED: <CheckCircle2 className="w-4 h-4" />, EXPIRING_SOON: <Clock className="w-4 h-4" />,
  EXPIRED: <XCircle className="w-4 h-4" />, PENDING: <HelpCircle className="w-4 h-4" />,
  INACTIVE: <AlertTriangle className="w-4 h-4" />,
};

interface DocumentReq {
  id: string;
  name: string;
  description: string | null;
  requirementType: string;
  isRequired: boolean;
  isSystemLocked: boolean;
  triggerType: string | null;
  triggerCondition: string | null;
}

interface SupplierDoc {
  id: string;
  requirementId: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  expiresAt: string | null;
  uploadedAt: string;
  notes: string | null;
  requirement: DocumentReq;
}

interface Material {
  id: string;
  name: string;
  category: string;
  unit: string | null;
  isOrganic: boolean;
  isAllergen: boolean;
  isGlutenFree: boolean;
  hasSpecialRisk: boolean;
  specialRiskTypes: unknown;
}

interface Supplier {
  id: string;
  name: string;
  manufacturerName: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  status: SupplierStatus;
  materials: { material: Material }[];
  documents: SupplierDoc[];
}

export default function SupplierDetailPage({ params }: { params: { id: string } }) {
  const { data: session } = useSession();

  const role = (session?.user as { role?: string })?.role ?? "";
  const isAdmin = role === "ADMIN";

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [requirements, setRequirements] = useState<DocumentReq[]>([]);
  const [productsAffected, setProductsAffected] = useState<Array<{ id: string; name: string; materialName: string; supplierStatus: string; materialType?: string; presentationName?: string | null }>>([]);
  const [loading, setLoading] = useState(true);

  // Upload state
  const [uploadReqId, setUploadReqId] = useState("");
  const [uploadExpiry, setUploadExpiry] = useState("");
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete doc state
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  // Signed-URL state — tracks which doc is currently fetching its signed link
  const [signingDocId, setSigningDocId] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);

  async function loadData() {
    const [supRes, reqRes, prodRes] = await Promise.all([
      fetch(`/api/supplier-management/suppliers/${params.id}`),
      fetch("/api/supplier-management/document-requirements"),
      fetch(`/api/supplier-management/suppliers/${params.id}/products`),
    ]);
    if (supRes.ok) setSupplier(await supRes.json());
    if (reqRes.ok) setRequirements(await reqRes.json());
    if (prodRes.ok) setProductsAffected(await prodRes.json());
    setLoading(false);
  }

  useEffect(() => { loadData(); }, [params.id]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!fileInputRef.current?.files?.[0] || !uploadReqId) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", fileInputRef.current.files[0]);
    fd.append("requirementId", uploadReqId);
    if (uploadExpiry) fd.append("expiresAt", uploadExpiry);
    if (uploadNotes) fd.append("notes", uploadNotes);
    try {
      const res = await fetch(`/api/supplier-management/suppliers/${params.id}/documents`, {
        method: "POST", body: fd,
      });
      if (res.ok) {
        setUploadReqId("");
        setUploadExpiry("");
        setUploadNotes("");
        if (fileInputRef.current) fileInputRef.current.value = "";
        setToast("Document uploaded.");
        setTimeout(() => setToast(null), 3500);
        await loadData();
      } else {
        const data = await res.json();
        alert(data.error ?? "Upload failed.");
      }
    } catch { alert("An unexpected error occurred."); }
    finally { setUploading(false); }
  }

  async function handleDeleteDoc(docId: string) {
    if (!confirm("Delete this document?")) return;
    setDeletingDocId(docId);
    try {
      const res = await fetch(`/api/supplier-management/suppliers/${params.id}/documents/${docId}`, { method: "DELETE" });
      if (res.ok) {
        setToast("Document deleted.");
        setTimeout(() => setToast(null), 3500);
        await loadData();
      } else {
        alert("Failed to delete document.");
      }
    } finally { setDeletingDocId(null); }
  }

  /**
   * Fetch a 1-hour signed URL from the server and open it in a new tab.
   * The raw fileUrl is never exposed to the browser — only the time-limited presigned URL is.
   */
  async function openDocument(doc: SupplierDoc) {
    setSigningDocId(doc.id);
    try {
      const res = await fetch(
        `/api/supplier-management/suppliers/${params.id}/documents/${doc.id}/signed-url`
      );
      if (res.ok) {
        const { url } = await res.json();
        window.open(url, "_blank", "noopener noreferrer");
      } else {
        alert("Could not generate a download link. Please try again.");
      }
    } catch {
      alert("An unexpected error occurred.");
    } finally {
      setSigningDocId(null);
    }
  }

  function formatFileSize(bytes: number | null) {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (loading) {
    return (
      <div className="card p-12 flex items-center justify-center gap-2 text-gray-400 font-mono text-sm">
        <div className="w-4 h-4 border-2 border-gray-300 border-t-[#D64D4D] rounded-full animate-spin" />
        Loading…
      </div>
    );
  }

  if (!supplier) {
    return <div className="card p-12 text-center text-gray-500">Supplier not found.</div>;
  }

  // Compute applicable requirements based on supplier's material attributes
  const matAttrs: MaterialAttrs[] = supplier.materials.map(({ material }) => material as MaterialAttrs);
  const applicableRequirements = filterApplicableRequirements(
    requirements.filter((r) => (r as { isActive?: boolean }).isActive !== false),
    matAttrs
  );

  // Group docs by requirement
  const docsByReq = new Map<string, SupplierDoc[]>();
  for (const doc of supplier.documents) {
    const arr = docsByReq.get(doc.requirementId) ?? [];
    arr.push(doc);
    docsByReq.set(doc.requirementId, arr);
  }

  return (
    <div className="max-w-4xl space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm font-mono px-4 py-2.5 rounded-md shadow-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />{toast}
        </div>
      )}

      {/* Header */}
      <div className="page-header">
        <div>
          <Link href="/supplier-management/suppliers" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Suppliers
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="page-title mb-0">{supplier.name}</h1>
            <span className={`inline-flex items-center gap-1.5 text-sm px-3 py-1 rounded-full font-medium ${STATUS_COLOR[supplier.status]}`}>
              {STATUS_ICON[supplier.status]} {STATUS_LABEL[supplier.status]}
            </span>
          </div>
        </div>
        {isAdmin && (
          <Link href={`/supplier-management/suppliers/${supplier.id}/edit`} className="btn-secondary">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Link>
        )}
      </div>

      {/* Info card */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-4 h-4 text-gray-400" />
          <h2 className="font-semibold text-gray-900 text-sm">Supplier Information</h2>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          {supplier.manufacturerName && (
            <div><dt className="text-gray-400 text-xs mb-0.5">Manufacturer / Brand</dt><dd className="text-gray-900">{supplier.manufacturerName}</dd></div>
          )}
          {supplier.contactName && (
            <div><dt className="text-gray-400 text-xs mb-0.5">Contact</dt><dd className="text-gray-900">{supplier.contactName}</dd></div>
          )}
          {supplier.email && (
            <div><dt className="text-gray-400 text-xs mb-0.5">Email</dt><dd className="text-gray-900">{supplier.email}</dd></div>
          )}
          {supplier.phone && (
            <div><dt className="text-gray-400 text-xs mb-0.5">Phone</dt><dd className="text-gray-900">{supplier.phone}</dd></div>
          )}
          {supplier.address && (
            <div className="sm:col-span-2"><dt className="text-gray-400 text-xs mb-0.5">Address</dt><dd className="text-gray-900">{supplier.address}</dd></div>
          )}
          {supplier.notes && (
            <div className="sm:col-span-2"><dt className="text-gray-400 text-xs mb-0.5">Notes</dt><dd className="text-gray-700">{supplier.notes}</dd></div>
          )}
        </dl>
      </div>

      {/* Materials */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Package className="w-4 h-4 text-gray-400" />
          <h2 className="font-semibold text-gray-900 text-sm">Supplied Materials</h2>
          <span className="text-xs text-gray-400 font-mono">({supplier.materials.length})</span>
        </div>
        {supplier.materials.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No materials assigned</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {supplier.materials.map(({ material }) => (
              <Link
                key={material.id}
                href={`/supplier-management/materials/${material.id}/edit`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <Package className="w-3 h-3 text-gray-400" />
                {material.name}
                {material.unit && <span className="text-gray-400">({material.unit})</span>}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Products Affected */}
      {productsAffected.length > 0 && (
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-4 h-4 text-gray-400" />
            <h2 className="font-semibold text-gray-900 text-sm">Products Affected</h2>
            <span className="text-xs text-gray-400 font-mono">({productsAffected.length})</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal">Product</th>
                <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal">Material</th>
                <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal">Role</th>
                <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {productsAffected.map((p) => {
                const isPkg = p.materialType === "packaging";
                const roleLabel = isPkg
                  ? `Packaging supplier${p.presentationName ? ` — ${p.presentationName}` : ""}`
                  : "Ingredient supplier";
                return (
                  <tr key={`${p.id}-${p.materialName}-${p.presentationName ?? ""}`}>
                    <td className="py-1.5 pr-3">
                      <Link href={`/supplier-management/products/${p.id}`} className="text-gray-800 hover:text-[#D64D4D]">{p.name}</Link>
                    </td>
                    <td className="py-1.5 pr-3 text-gray-700">{p.materialName}</td>
                    <td className="py-1.5 pr-3 text-gray-500 text-xs">{roleLabel}</td>
                    <td className="py-1.5 pr-3">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLOR[p.supplierStatus as SupplierStatus] ?? "bg-gray-100 text-gray-500"}`}>
                        {p.supplierStatus}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Documents */}
      <div className="card p-6 space-y-6">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-400" />
          <h2 className="font-semibold text-gray-900 text-sm">Compliance Documents</h2>
        </div>

        {/* Per-requirement document sections */}
        <div className="space-y-4">
          {applicableRequirements.map((req) => {
            const docs = docsByReq.get(req.id) ?? [];
            const latest = docs[0] ?? null;
            const isExpired = latest?.expiresAt && new Date(latest.expiresAt) < new Date();
            const isExpiringSoon = latest?.expiresAt && !isExpired && new Date(latest.expiresAt) < new Date(Date.now() + 30 * 86400000);

            return (
              <div key={req.id} className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                  <div className="flex items-center gap-2">
                    {req.isSystemLocked && <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                    <span className="text-sm font-medium text-gray-900">{req.name}</span>
                    {req.isRequired && <span className="text-xs text-red-500 font-medium">Required</span>}
                    <span className="text-xs text-gray-400">{req.requirementType === "ANNUAL" ? "Annual" : "One-time"}</span>
                    <span className="text-xs text-gray-400">{getTriggerLabel(req.triggerType, req.triggerCondition)}</span>
                  </div>
                  <div>
                    {!latest && <span className="text-xs text-gray-400 italic">No document uploaded</span>}
                    {latest && !isExpired && !isExpiringSoon && <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" /> Valid</span>}
                    {latest && isExpiringSoon && <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full"><Clock className="w-3 h-3" /> Expiring Soon</span>}
                    {latest && isExpired && <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" /> Expired</span>}
                  </div>
                </div>

                {docs.length > 0 && (
                  <div className="divide-y divide-gray-100">
                    {docs.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                        <FileText className="w-4 h-4 text-gray-300 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-gray-800 truncate">{doc.fileName}</span>
                          <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                            <span>Uploaded {formatDate(doc.uploadedAt)}</span>
                            {doc.expiresAt && <span>Expires {formatDate(doc.expiresAt)}</span>}
                            {doc.fileSize && <span>{formatFileSize(doc.fileSize)}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => openDocument(doc)}
                            disabled={signingDocId === doc.id}
                            title="View / Download (signed link, 1-hour expiry)"
                            className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100 disabled:opacity-40"
                          >
                            {signingDocId === doc.id
                              ? <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                              : <ExternalLink className="w-3.5 h-3.5" />}
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteDoc(doc.id)}
                              disabled={deletingDocId === doc.id}
                              title="Delete document"
                              className="p-1.5 text-gray-300 hover:text-[#D64D4D] rounded hover:bg-red-50 disabled:opacity-40"
                            >
                              {deletingDocId === doc.id
                                ? <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-red-500 rounded-full animate-spin" />
                                : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Upload form (admin only) */}
        {isAdmin && (
          <form onSubmit={handleUpload} className="border border-dashed border-gray-200 rounded-lg p-5 space-y-4 bg-gray-50">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Upload className="w-4 h-4" /> Upload New Document
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Requirement <span className="text-red-500">*</span></label>
                <select
                  className="input text-sm"
                  value={uploadReqId}
                  onChange={(e) => setUploadReqId(e.target.value)}
                  required
                >
                  <option value="">Select requirement…</option>
                  {applicableRequirements.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Expiration Date</label>
                <input
                  type="date"
                  className="input text-sm"
                  value={uploadExpiry}
                  onChange={(e) => setUploadExpiry(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">File <span className="text-red-500">*</span></label>
                <input ref={fileInputRef} type="file" className="input text-sm py-1.5" required accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Notes</label>
                <input className="input text-sm" value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} placeholder="Optional notes" />
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={uploading} className="btn-primary disabled:opacity-60">
                {uploading ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Uploading…</> : <><Upload className="w-3.5 h-3.5" />Upload Document</>}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
