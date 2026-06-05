"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, XCircle, Clock, FileText, Building2, RefreshCw } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface AlertDoc {
  id: string;
  fileName: string;
  expiresAt: string | null;
  supplier: { id: string; name: string };
  requirement: { id: string; name: string };
}

interface MissingDoc {
  supplier: { id: string; name: string };
  requirement: { id: string; name: string };
  triggerLabel: string;
  triggeringMaterial: string | null;
}

interface AlertData {
  expired: AlertDoc[];
  expiringSoon: AlertDoc[];
  missingDocs: MissingDoc[];
}

export default function AlertsPage() {
  const [data, setData] = useState<AlertData | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/supplier-management/alerts");
    if (res.ok) setData(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const totalAlerts = data ? data.expired.length + data.expiringSoon.length + data.missingDocs.length : 0;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Supplier Alerts</h1>
          <p className="page-subtitle">Expired documents, expiring soon, and missing compliance records</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="card p-12 flex items-center justify-center gap-2 text-gray-400 font-mono text-sm">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-[#D64D4D] rounded-full animate-spin" />
          Loading alerts…
        </div>
      ) : totalAlerts === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-gray-400">
          <Bell className="w-10 h-10 mb-3 text-emerald-400" />
          <p className="font-medium text-gray-600">All clear — no alerts</p>
          <p className="text-sm text-gray-400 mt-1">All supplier documents are valid and up to date.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Missing required docs — FIRST */}
          {data!.missingDocs.length > 0 && (
            <div className="card overflow-hidden">
              <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100 bg-red-50">
                <Building2 className="w-4 h-4 text-red-600" />
                <h2 className="font-semibold text-red-800 text-sm">Missing Required Documents ({data!.missingDocs.length})</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {data!.missingDocs.map((item, i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-3">
                    <FileText className="w-4 h-4 text-red-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/supplier-management/suppliers/${item.supplier.id}`} className="text-sm font-medium text-gray-900 hover:text-[#D64D4D]">
                          {item.supplier.name}
                        </Link>
                        {item.triggeringMaterial && (
                          <>
                            <span className="text-gray-300">·</span>
                            <span className="text-xs text-gray-500">{item.triggeringMaterial}</span>
                          </>
                        )}
                        <span className="text-gray-300">·</span>
                        <span className="text-sm text-gray-600">{item.requirement.name}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">Required: {item.triggerLabel}</p>
                    </div>
                    <Link href={`/supplier-management/suppliers/${item.supplier.id}`} className="btn-secondary text-xs py-1">
                      Upload Now
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expired */}
          {data!.expired.length > 0 && (
            <div className="card overflow-hidden">
              <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100 bg-red-50">
                <XCircle className="w-4 h-4 text-red-600" />
                <h2 className="font-semibold text-red-800 text-sm">Expired Documents ({data!.expired.length})</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {data!.expired.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-4 px-6 py-3">
                    <FileText className="w-4 h-4 text-red-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/supplier-management/suppliers/${doc.supplier.id}`} className="text-sm font-medium text-gray-900 hover:text-[#D64D4D]">
                          {doc.supplier.name}
                        </Link>
                        <span className="text-gray-300">·</span>
                        <span className="text-sm text-gray-600">{doc.requirement.name}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        <span className="text-red-600 font-medium">Expired {doc.expiresAt ? formatDate(doc.expiresAt) : "—"}</span>
                        &ensp;· File: {doc.fileName}
                      </p>
                    </div>
                    <Link href={`/supplier-management/suppliers/${doc.supplier.id}`} className="btn-secondary text-xs py-1">
                      View Supplier
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expiring soon */}
          {data!.expiringSoon.length > 0 && (
            <div className="card overflow-hidden">
              <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100 bg-amber-50">
                <Clock className="w-4 h-4 text-amber-600" />
                <h2 className="font-semibold text-amber-800 text-sm">Expiring Within 30 Days ({data!.expiringSoon.length})</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {data!.expiringSoon.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-4 px-6 py-3">
                    <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/supplier-management/suppliers/${doc.supplier.id}`} className="text-sm font-medium text-gray-900 hover:text-[#D64D4D]">
                          {doc.supplier.name}
                        </Link>
                        <span className="text-gray-300">·</span>
                        <span className="text-sm text-gray-600">{doc.requirement.name}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        <span className="text-amber-600 font-medium">Expires {doc.expiresAt ? formatDate(doc.expiresAt) : "—"}</span>
                        &ensp;· File: {doc.fileName}
                      </p>
                    </div>
                    <Link href={`/supplier-management/suppliers/${doc.supplier.id}`} className="btn-secondary text-xs py-1">
                      View Supplier
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
