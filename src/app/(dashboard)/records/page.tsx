export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { FolderOpen, Plus, Search, Tag, Calendar, User } from "lucide-react";

const RECORD_TYPES = [
  "Temperature Log",
  "Sanitation Report",
  "Incident Report",
  "Supplier Audit",
  "HACCP Record",
  "Training Record",
  "Equipment Maintenance",
  "Corrective Action",
  "Other",
];

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: { type?: string; q?: string };
}) {
  const session = await getServerSession(authOptions);
  const role = session!.user.role;

  const where: any = { archived: false };
  if (searchParams.type) where.type = searchParams.type;
  if (searchParams.q) {
    where.OR = [
      { title: { contains: searchParams.q, mode: "insensitive" } },
      { description: { contains: searchParams.q, mode: "insensitive" } },
    ];
  }

  const records = await prisma.record.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  return (
    <div className="max-w-5xl space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Records</h1>
          <p className="page-subtitle">Food safety audit trail and documentation</p>
        </div>
        <Link href="/records/new" className="btn-primary">
          <Plus className="w-4 h-4" /> New Record
        </Link>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3">
        <form method="GET" className="flex gap-2 flex-1 min-w-48">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input name="q" defaultValue={searchParams.q} placeholder="Search records…" className="input pl-9" />
          </div>
          <select name="type" defaultValue={searchParams.type ?? ""} className="input w-52">
            <option value="">All types</option>
            {RECORD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button type="submit" className="btn-secondary">Filter</button>
          {(searchParams.q || searchParams.type) && (
            <Link href="/records" className="btn-secondary">Clear</Link>
          )}
        </form>
      </div>

      {records.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-gray-400">
          <FolderOpen className="w-10 h-10 mb-3" />
          <p className="font-medium text-gray-600">No records found</p>
          <Link href="/records/new" className="btn-primary mt-4">
            <Plus className="w-4 h-4" /> Add Record
          </Link>
        </div>
      ) : (
        <div className="card divide-y divide-gray-100">
          {records.map((record) => (
            <Link
              key={record.id}
              href={`/records/${record.id}`}
              className="flex items-start gap-4 px-6 py-4 hover:bg-gray-50 transition-colors"
            >
              <div className="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                <FolderOpen className="w-4 h-4 text-purple-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-medium text-gray-900 truncate">{record.title}</p>
                  <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                    {record.type}
                  </span>
                </div>
                {record.description && (
                  <p className="text-sm text-gray-500 truncate">{record.description}</p>
                )}
                <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" /> {record.createdBy.name}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {formatDate(record.createdAt)}
                  </span>
                  {record.tags.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      {record.tags.slice(0, 3).join(", ")}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
