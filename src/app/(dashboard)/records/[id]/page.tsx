import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft, Calendar, User, Tag, Trash2 } from "lucide-react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DeleteRecordButton } from "@/components/records/DeleteRecordButton";

export default async function RecordDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = session!.user.role;
  const canDelete = role === "ADMIN" || role === "SUPERVISOR";

  const record = await prisma.record.findUnique({
    where: { id: params.id },
    include: { createdBy: { select: { name: true, department: true } } },
  });

  if (!record || record.archived) notFound();

  const data = record.data as Record<string, unknown>;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start gap-3">
        <Link href="/records" className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg mt-0.5">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="page-title">{record.title}</h1>
          </div>
          <span className="text-xs bg-purple-50 text-purple-700 px-2.5 py-0.5 rounded-full font-medium">
            {record.type}
          </span>
        </div>
        {canDelete && <DeleteRecordButton recordId={record.id} />}
      </div>

      <div className="card p-6 space-y-4">
        {record.description && (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Description</p>
            <p className="text-sm text-gray-700">{record.description}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Recorded By</p>
            <p className="flex items-center gap-1.5 text-gray-900">
              <User className="w-3.5 h-3.5 text-gray-400" />
              {record.createdBy.name}
              {record.createdBy.department && (
                <span className="text-gray-500">({record.createdBy.department})</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Date & Time</p>
            <p className="flex items-center gap-1.5 text-gray-900">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              {formatDateTime(record.createdAt)}
            </p>
          </div>
        </div>

        {record.tags.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {record.tags.map((tag) => (
                <span key={tag} className="flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  <Tag className="w-3 h-3" /> {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {Object.keys(data).length > 0 && (
        <div className="card">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Recorded Data</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {Object.entries(data).map(([key, val]) => (
              <div key={key} className="flex items-start px-6 py-3 gap-4">
                <p className="text-sm font-medium text-gray-500 w-44 shrink-0">{key}</p>
                <p className="text-sm text-gray-900">{String(val)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
