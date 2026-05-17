import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { ClipboardList, Plus, Search, ArrowRight } from "lucide-react";

const CATEGORIES = [
  "Temperature Control",
  "Sanitation",
  "Pest Control",
  "Receiving",
  "HACCP",
  "Personnel Hygiene",
  "Equipment",
  "Other",
];

export default async function FormsPage({
  searchParams,
}: {
  searchParams: { category?: string; q?: string };
}) {
  const session = await getServerSession(authOptions);
  const role = session!.user.role;
  const canManage = role === "ADMIN" || role === "SUPERVISOR";

  const where: any = { active: true };
  if (searchParams.category) where.category = searchParams.category;
  if (searchParams.q) where.title = { contains: searchParams.q, mode: "insensitive" };

  const forms = await prisma.form.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      createdBy: { select: { name: true } },
      _count: { select: { submissions: true } },
    },
  });

  return (
    <div className="max-w-5xl space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Forms</h1>
          <p className="page-subtitle">Food safety inspection and audit forms</p>
        </div>
        {canManage && (
          <Link href="/forms/builder" className="btn-primary">
            <Plus className="w-4 h-4" /> New Form
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3">
        <form method="GET" className="flex gap-2 flex-1 min-w-48">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              name="q"
              defaultValue={searchParams.q}
              placeholder="Search forms…"
              className="input pl-9"
            />
          </div>
          <select name="category" defaultValue={searchParams.category ?? ""} className="input w-48">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button type="submit" className="btn-secondary">Filter</button>
        </form>
      </div>

      {forms.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-gray-400">
          <ClipboardList className="w-10 h-10 mb-3" />
          <p className="font-medium text-gray-600">No forms found</p>
          <p className="text-sm mt-1">
            {canManage ? "Create your first form to get started." : "No forms available yet."}
          </p>
          {canManage && (
            <Link href="/forms/builder" className="btn-primary mt-4">
              <Plus className="w-4 h-4" /> Create Form
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {forms.map((form) => (
            <div key={form.id} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs font-medium bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full">
                  {form.category}
                </span>
                <span className="text-xs text-gray-400">v{form.version}</span>
              </div>
              <h3 className="font-semibold text-gray-900 mt-2">{form.title}</h3>
              {form.description && (
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">{form.description}</p>
              )}
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                <div className="text-xs text-gray-400">
                  <span>{form._count.submissions} submissions</span>
                  <span className="mx-1.5">·</span>
                  <span>{form.createdBy.name}</span>
                </div>
                <div className="flex gap-2">
                  {canManage && (
                    <Link
                      href={`/forms/${form.id}/edit`}
                      className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      Edit
                    </Link>
                  )}
                  <Link
                    href={`/forms/${form.id}/submit`}
                    className="btn-primary text-xs px-3 py-1.5"
                  >
                    Fill <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
