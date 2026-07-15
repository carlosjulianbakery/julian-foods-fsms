"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatProjectStatus } from "@/lib/rdStatusLabels";

interface RdProject {
  id: string;
  name: string;
  description: string | null;
  productType: string;
  status: string;
  startedDate: string;
  targetLaunchDate: string | null;
  createdAt: string;
  updatedAt: string;
  iterationCount: number;
  createdByName: string | null;
  collaborators?: { name: string; email: string | null }[] | null;
}

interface Counts {
  active: number;
  inDevelopment: number;
  testing: number;
  pendingApproval: number;
  launched: number;
  discontinued: number;
}

interface Props {
  projects: RdProject[];
  counts: Counts;
}

function relativeTime(d: Date | string): string {
  const ms = Date.now() - new Date(d).getTime();
  const days = Math.floor(ms / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1mo ago" : `${months}mo ago`;
}

const STATUS_ACCENT_COLOR: Record<string, string> = {
  concept:             "#8B8B8B",
  in_development:      "#60A5FA",
  testing:             "#F59E0B",
  pending_approval:    "#A78BFA",
  closed_launched:     "#34D399",
  closed_discontinued: "#4B4B4B",
};

const KANBAN_COLUMNS = [
  { status: "concept",          label: "Concept",          dot: "#8B8B8B" },
  { status: "in_development",   label: "In Development",   dot: "#60A5FA" },
  { status: "testing",          label: "Testing",          dot: "#F59E0B" },
  { status: "pending_approval", label: "Pending Approval", dot: "#A78BFA" },
];

const CLOSED_STATUSES = ["closed_launched", "closed_discontinued"];

const RD_CARD_STYLE: React.CSSProperties = {
  backgroundColor: "#252118",
  border: "1px solid #3D3427",
  borderRadius: 14,
  overflow: "hidden",
  transition: "border-color 0.2s, box-shadow 0.2s",
};

function ProjectCard({
  project,
  onDeleteClick,
}: {
  project: RdProject;
  onDeleteClick: (p: RdProject) => void;
}) {
  const accentColor = STATUS_ACCENT_COLOR[project.status] ?? "#8B8B8B";
  const [hovered, setHovered] = useState(false);
  const collabCount = project.collaborators?.length ?? 0;

  return (
    <div
      style={{ ...RD_CARD_STYLE, borderColor: hovered ? "#F59E0B40" : "#3D3427", boxShadow: hovered ? "0 4px 32px rgba(245,158,11,0.1)" : "none", position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Top accent line by status */}
      <div style={{ height: 4, backgroundColor: accentColor }} />

      {/* Delete button — visible on hover */}
      {hovered && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDeleteClick(project); }}
          title="Delete project"
          style={{
            position: "absolute",
            top: 12,
            right: 10,
            zIndex: 2,
            background: "transparent",
            border: "1px solid #F8717140",
            borderRadius: 6,
            padding: "2px 6px",
            cursor: "pointer",
            color: "#F87171",
            fontSize: 13,
            lineHeight: 1,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F8717115"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
        >
          ✕
        </button>
      )}

      <Link href={`/dashboard/admin/rd/projects/${project.id}`} className="block p-4 space-y-3">
        {/* Project name */}
        <p className="text-[15px] font-semibold leading-tight" style={{ color: "#F5F0E8" }}>
          {project.name}
        </p>
        {/* Description */}
        {project.description && (
          <p className="text-xs leading-relaxed line-clamp-2" style={{ color: "#A89880" }}>
            {project.description}
          </p>
        )}
        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: "#3D3427" }}>
          <div className="flex items-center gap-3">
            <span className="text-[11px]" style={{ color: "#6B5F50" }}>
              🔬 {project.iterationCount} iter{project.iterationCount !== 1 ? "s" : ""}
            </span>
            {collabCount > 0 && (
              <span className="text-[11px]" style={{ color: "#F59E0B" }}>
                👥 {collabCount}
              </span>
            )}
            <span className="text-[11px]" style={{ color: "#6B5F50" }}>
              {relativeTime(project.updatedAt)}
            </span>
          </div>
          <span className="text-[11px] font-medium" style={{ color: "#F59E0B" }}>
            Open →
          </span>
        </div>
      </Link>
    </div>
  );
}

function KanbanColumn({
  column,
  projects,
  onDeleteClick,
}: {
  column: (typeof KANBAN_COLUMNS)[number];
  projects: RdProject[];
  onDeleteClick: (p: RdProject) => void;
}) {
  return (
    <div
      className="flex flex-col gap-3 shrink-0"
      style={{
        width: 280,
        backgroundColor: "#1E1B17",
        borderRadius: 16,
        padding: 16,
        minHeight: 400,
        border: "1px solid #3D3427",
      }}
    >
      {/* Column header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: column.dot }}
          />
          <span
            className="text-[13px] font-semibold"
            style={{ color: "#F5F0E8" }}
          >
            {column.label}
          </span>
        </div>
        <span
          className="text-[11px] font-mono px-2 py-0.5 rounded-full"
          style={{ backgroundColor: "#2E2820", color: "#A89880" }}
        >
          {projects.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-3">
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} onDeleteClick={onDeleteClick} />
        ))}
        {projects.length === 0 && (
          <Link href={`/dashboard/admin/rd/projects/new`}>
            <div
              className="flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors"
              style={{ borderColor: "#3D3427", color: "#6B5F50" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "#F59E0B60";
                (e.currentTarget as HTMLDivElement).style.color = "#A89880";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "#3D3427";
                (e.currentTarget as HTMLDivElement).style.color = "#6B5F50";
              }}
            >
              <span className="text-xl">+</span>
              <span className="text-[11px] font-medium text-center">Start a project here</span>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}

interface DeleteTarget {
  project: RdProject;
  counts: { evaluations: number; attachments: number } | null;
  loading: boolean;
}

export function ProjectsClient({ projects: initialProjects }: Props) {
  const router = useRouter();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [projects, setProjects] = useState<RdProject[]>(initialProjects);
  const [closedOpen, setClosedOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  }

  async function openDeleteModal(p: RdProject) {
    setDeleteTarget({ project: p, counts: null, loading: true });
    setDeleteError(null);
    try {
      const res = await fetch(`/api/rd/projects/${p.id}`);
      if (res.ok) {
        const data = await res.json();
        const evaluations = (data.iterations ?? []).reduce(
          (sum: number, iter: { evaluations?: unknown[] }) => sum + (iter.evaluations?.length ?? 0),
          0
        );
        const attachments = (data.iterations ?? []).reduce(
          (sum: number, iter: { attachments?: unknown[] }) => sum + (iter.attachments?.length ?? 0),
          0
        );
        setDeleteTarget({ project: p, counts: { evaluations, attachments }, loading: false });
      } else {
        setDeleteTarget({ project: p, counts: null, loading: false });
      }
    } catch {
      setDeleteTarget({ project: p, counts: null, loading: false });
    }
    setTimeout(() => cancelRef.current?.focus(), 50);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/rd/projects/${deleteTarget.project.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete project");
      }
      // Optimistic removal
      setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.project.id));
      setDeleteTarget(null);
      showToast("Project deleted successfully");
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setDeleting(false);
    }
  }

  const byStatus = (status: string) => projects.filter((p) => p.status === status);
  const closedProjects = projects.filter((p) => CLOSED_STATUSES.includes(p.status));

  return (
    <div className="space-y-6">
      {/* Lab pill */}
      <div className="flex items-center gap-3">
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest"
          style={{ background: "#F59E0B15", border: "1px solid #F59E0B40", color: "#F59E0B" }}
        >
          🧪 R&D Lab
        </span>
        <span className="text-xs" style={{ color: "#6B5F50" }}>
          {projects.length} project{projects.length !== 1 ? "s" : ""} total
        </span>
      </div>

      {/* Kanban board */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4" style={{ minWidth: "max-content" }}>
          {KANBAN_COLUMNS.map((col) => (
            <KanbanColumn
              key={col.status}
              column={col}
              projects={byStatus(col.status)}
              onDeleteClick={openDeleteModal}
            />
          ))}
        </div>
      </div>

      {/* Closed projects */}
      {closedProjects.length > 0 && (
        <div style={{ backgroundColor: "#1E1B17", border: "1px solid #3D3427", borderRadius: 16 }}>
          <button
            onClick={() => setClosedOpen((v) => !v)}
            className="w-full flex items-center gap-3 px-5 py-4"
          >
            {closedOpen ? (
              <ChevronDown className="w-4 h-4" style={{ color: "#A89880" }} />
            ) : (
              <ChevronRight className="w-4 h-4" style={{ color: "#A89880" }} />
            )}
            <span className="text-[13px] font-semibold" style={{ color: "#A89880" }}>
              Closed Projects
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full font-mono" style={{ backgroundColor: "#2E2820", color: "#6B5F50" }}>
              {closedProjects.length}
            </span>
          </button>
          {closedOpen && (
            <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {closedProjects.map((p) => {
                const { label, color } = formatProjectStatus(p.status);
                return (
                  <div key={p.id} style={{ position: "relative" }}>
                    <Link href={`/dashboard/admin/rd/projects/${p.id}`}>
                      <div
                        style={{ backgroundColor: "#252118", border: "1px solid #3D3427", borderRadius: 12, padding: "14px 16px", cursor: "pointer" }}
                        className="group hover:border-rd-accent/30 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold" style={{ color: "#F5F0E8" }}>{p.name}</p>
                          <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${color}`}>{label}</span>
                        </div>
                        <p className="text-[11px] mt-1" style={{ color: "#6B5F50" }}>
                          {p.iterationCount} iteration{p.iterationCount !== 1 ? "s" : ""} · {relativeTime(p.updatedAt)}
                        </p>
                      </div>
                    </Link>
                    <button
                      onClick={() => openDeleteModal(p)}
                      style={{ position: "absolute", top: 10, right: 10, background: "transparent", border: "1px solid #F8717140", borderRadius: 6, padding: "2px 6px", cursor: "pointer", color: "#F87171", fontSize: 12, lineHeight: 1 }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F8717115"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
                      title="Delete project"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* FAB */}
      <Link href="/dashboard/admin/rd/projects/new">
        <button
          className="fixed bottom-8 right-8 w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold transition-transform hover:scale-105 z-40"
          style={{ backgroundColor: "#F59E0B", color: "#1A1714", boxShadow: "0 8px 24px rgba(245,158,11,0.4)" }}
          title="New R&D Project"
        >
          +
        </button>
      </Link>

      {/* ── Delete confirmation modal ── */}
      {deleteTarget && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 100, backgroundColor: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteTarget(null); }}
        >
          <div style={{ backgroundColor: "#252118", border: "1px solid #3D3427", borderRadius: 20, width: "100%", maxWidth: 440, boxShadow: "0 24px 64px rgba(0,0,0,0.7)" }}>
            <div style={{ padding: "24px 28px 20px", borderBottom: "1px solid #3D3427" }}>
              <p style={{ color: "#F87171", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
                Destructive Action
              </p>
              <h2 style={{ color: "#F5F0E8", fontSize: "1.25rem", fontWeight: 700 }}>Delete Project?</h2>
            </div>
            <div style={{ padding: "20px 28px" }}>
              <p style={{ color: "#A89880", fontSize: 14, marginBottom: 16 }}>
                This will permanently delete:
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#F5F0E8", fontSize: 14 }}>
                  <span style={{ color: "#F59E0B" }}>•</span>
                  <strong>{deleteTarget.project.name}</strong>
                </li>
                <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#A89880", fontSize: 14 }}>
                  <span style={{ color: "#F59E0B" }}>•</span>
                  {deleteTarget.loading ? "Loading counts…" : `${deleteTarget.project.iterationCount} iteration${deleteTarget.project.iterationCount !== 1 ? "s" : ""}`}
                </li>
                <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#A89880", fontSize: 14 }}>
                  <span style={{ color: "#F59E0B" }}>•</span>
                  {deleteTarget.loading ? "…" : `${deleteTarget.counts?.evaluations ?? 0} sensory evaluation${(deleteTarget.counts?.evaluations ?? 0) !== 1 ? "s" : ""}`}
                </li>
                <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#A89880", fontSize: 14 }}>
                  <span style={{ color: "#F59E0B" }}>•</span>
                  {deleteTarget.loading ? "…" : `${deleteTarget.counts?.attachments ?? 0} file attachment${(deleteTarget.counts?.attachments ?? 0) !== 1 ? "s" : ""}`}
                </li>
              </ul>
              <p style={{ color: "#6B5F50", fontSize: 12, fontStyle: "italic" }}>This action cannot be undone.</p>
              {deleteError && (
                <div style={{ marginTop: 12, backgroundColor: "#F8717115", border: "1px solid #F87171", borderRadius: 8, padding: "8px 12px", color: "#F87171", fontSize: 13 }}>
                  {deleteError}
                </div>
              )}
            </div>
            <div style={{ padding: "0 28px 24px", display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                ref={cancelRef}
                onClick={() => setDeleteTarget(null)}
                style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid #3D3427", background: "transparent", color: "#A89880", fontSize: 14, cursor: "pointer" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#6B5F50"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#3D3427"; }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid #F87171", backgroundColor: "#F8717115", color: "#F87171", fontSize: 14, fontWeight: 600, cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.6 : 1 }}
                onMouseEnter={(e) => { if (!deleting) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F8717125"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F8717115"; }}
              >
                {deleting ? "Deleting…" : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success toast */}
      {toastMsg && (
        <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 200, backgroundColor: "#34D399", color: "#1A1714", padding: "12px 20px", borderRadius: 12, boxShadow: "0 8px 24px rgba(52,211,153,0.3)", fontSize: 14, fontWeight: 600 }}>
          {toastMsg}
        </div>
      )}
    </div>
  );
}
