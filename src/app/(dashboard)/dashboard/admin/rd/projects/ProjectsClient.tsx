"use client";

import { useState } from "react";
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
  latestSensoryAvg?: number | null;
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
  concept:             "#6B7280",
  in_development:      "#1D4ED8",
  testing:             "#D97706",
  pending_approval:    "#7C3AED",
  closed_launched:     "#059669",
  closed_discontinued: "#6B7280",
};

const STATUS_GRADIENT: Record<string, string> = {
  concept:             "linear-gradient(90deg, #6B7280, #9CA3AF)",
  in_development:      "linear-gradient(90deg, #1D4ED8, #3B82F6)",
  testing:             "linear-gradient(90deg, #D97706, #F59E0B)",
  pending_approval:    "linear-gradient(90deg, #7C3AED, #8B5CF6)",
  closed_launched:     "linear-gradient(90deg, #059669, #10B981)",
  closed_discontinued: "linear-gradient(90deg, #6B7280, #9CA3AF)",
};

const KANBAN_COLUMNS = [
  { status: "concept",          label: "Concept",          dot: "#6B7280", emoji: "💡", tint: "#6B7280", headerBg: "linear-gradient(135deg, #F9FAFB, #F3F4F6)" },
  { status: "in_development",   label: "In Development",   dot: "#1D4ED8", emoji: "🔬", tint: "#1D4ED8", headerBg: "linear-gradient(135deg, #EFF6FF, #DBEAFE40)" },
  { status: "testing",          label: "Testing",          dot: "#D97706", emoji: "🧪", tint: "#D97706", headerBg: "linear-gradient(135deg, #FFFBEB, #FEF3C740)" },
  { status: "pending_approval", label: "Pending Approval", dot: "#7C3AED", emoji: "✅", tint: "#7C3AED", headerBg: "linear-gradient(135deg, #F5F3FF, #EDE9FE40)" },
];

const CLOSED_STATUSES = ["closed_launched", "closed_discontinued"];

// ── ProjectCard ──────────────────────────────────────────────────────────────

function ProjectCard({ project, cardIndex = 0 }: { project: RdProject; cardIndex?: number }) {
  const [hovered, setHovered] = useState(false);
  const accentColor = STATUS_ACCENT_COLOR[project.status] ?? "#8B8B8B";
  const accentGradient = STATUS_GRADIENT[project.status] ?? `linear-gradient(90deg, ${accentColor}, ${accentColor})`;
  const collabCount = project.collaborators?.length ?? 0;

  return (
    <div
      style={{
        backgroundColor: "#FFFFFF",
        border: `1px solid ${hovered ? `${accentColor}60` : "#E8DDD0"}`,
        borderRadius: 20,
        overflow: "hidden",
        position: "relative",
        transition: "all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
        transform: hovered ? "translateY(-6px) scale(1.01)" : "translateY(0) scale(1)",
        boxShadow: hovered
          ? `0 20px 40px rgba(107,95,80,0.18), 0 0 0 1px ${accentColor}40, 0 12px 32px ${accentColor}25`
          : "0 4px 24px rgba(107,95,80,0.12)",
        animation: `cardFadeIn 0.3s ease-out ${cardIndex * 60}ms both`,
        willChange: "transform",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Top accent line — gradient, 6px */}
      <div style={{ height: 6, background: accentGradient }} />

      {/* Sensory score badge */}
      {project.latestSensoryAvg != null && (
        <div
          aria-label={`Average sensory score: ${project.latestSensoryAvg.toFixed(1)}`}
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            zIndex: 2,
            pointerEvents: "none",
            color: "#F59E0B",
            fontWeight: 800,
            fontSize: "0.95rem",
            textShadow: "0 0 8px rgba(245,158,11,0.4)",
          }}
        >
          ★ {project.latestSensoryAvg.toFixed(1)}
        </div>
      )}

      <Link href={`/dashboard/admin/rd/projects/${project.id}`} style={{ display: "block", padding: 20, textDecoration: "none" }}>
        {/* Project name */}
        <p
          style={{
            color: "#1A1714",
            fontSize: "1.1rem",
            fontWeight: 700,
            lineHeight: 1.3,
            paddingRight: project.latestSensoryAvg != null ? 58 : 0,
          }}
        >
          {project.name}
        </p>

        {/* Description */}
        {project.description && (
          <p
            style={{
              color: "#6B5F50",
              fontSize: 12,
              lineHeight: 1.5,
              marginTop: 8,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical" as const,
              overflow: "hidden",
            }}
          >
            {project.description}
          </p>
        )}

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 10,
            marginTop: 12,
            borderTop: "1px solid #E8DDD0",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {/* Iteration pill */}
            {project.iterationCount > 0 ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  backgroundColor: "#F59E0B20",
                  border: "1px solid #F59E0B40",
                  borderRadius: 20,
                  padding: "2px 8px",
                  color: "#F59E0B",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                🔬 {project.iterationCount}
              </span>
            ) : (
              <span style={{ color: "#A89880", fontSize: 11 }}>🔬 0</span>
            )}
            {collabCount > 0 && (
              <span style={{ color: "#6B5F50", fontSize: 11, fontWeight: 500 }}>
                👥 {collabCount}
              </span>
            )}
            <span style={{ color: "#A89880", fontSize: 11 }}>
              {relativeTime(project.updatedAt)}
            </span>
          </div>

          {/* Status-colored Open button */}
          <span
            style={{
              backgroundColor: `${accentColor}20`,
              border: `1px solid ${accentColor}50`,
              color: accentColor,
              borderRadius: 8,
              padding: "4px 12px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.02em",
            }}
          >
            Open →
          </span>
        </div>
      </Link>
    </div>
  );
}

// ── KanbanColumn ─────────────────────────────────────────────────────────────

function KanbanColumn({
  column,
  projects,
  colIndex = 0,
}: {
  column: (typeof KANBAN_COLUMNS)[number];
  projects: RdProject[];
  colIndex?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        flexShrink: 0,
        width: 280,
        borderRadius: 16,
        padding: 16,
        minHeight: 400,
        border: "1px solid #E8DDD0",
        background: `linear-gradient(to bottom, ${column.tint}08 0%, #F7F2E8 140px)`,
        animation: `columnFadeIn 0.4s ease-out ${colIndex * 80}ms both`,
        willChange: "opacity, transform",
      }}
    >
      {/* Column header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 4,
          padding: "8px 10px",
          borderRadius: 10,
          background: column.headerBg,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              display: "inline-block",
              width: 14,
              height: 14,
              borderRadius: "50%",
              flexShrink: 0,
              backgroundColor: column.dot,
              boxShadow: `0 0 6px ${column.dot}80`,
            }}
          />
          <span style={{ color: "#1A1714", fontSize: "1rem", fontWeight: 700 }}>
            {column.label}
          </span>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            fontFamily: "monospace",
            padding: "2px 8px",
            borderRadius: 20,
            backgroundColor: `${column.dot}25`,
            color: column.dot,
            border: `1px solid ${column.dot}40`,
          }}
        >
          {projects.length}
        </span>
      </div>

      {/* Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {projects.map((p, cardIndex) => (
          <ProjectCard key={p.id} project={p} cardIndex={cardIndex} />
        ))}

        {projects.length === 0 && (
          <Link href="/dashboard/admin/rd/projects/new" style={{ textDecoration: "none" }}>
            <div
              style={{
                border: `2px dashed ${column.dot}40`,
                borderRadius: 16,
                padding: "40px 16px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                transition: "all 0.2s ease",
                backgroundColor: "transparent",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.backgroundColor = `${column.dot}08`;
                (e.currentTarget as HTMLDivElement).style.borderColor = `${column.dot}70`;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.backgroundColor = "transparent";
                (e.currentTarget as HTMLDivElement).style.borderColor = `${column.dot}40`;
              }}
            >
              <span style={{ fontSize: 36 }}>{column.emoji}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: column.dot, textAlign: "center" }}>
                Start a project here
              </span>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}

// ── FAB ──────────────────────────────────────────────────────────────────────

function Fab({ empty }: { empty: boolean }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link href="/dashboard/admin/rd/projects/new" style={{ textDecoration: "none" }}>
      <button
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title="New R&D Project"
        style={{
          position: "fixed",
          bottom: 32,
          right: 32,
          height: 64,
          minWidth: 64,
          paddingLeft: hovered ? 22 : 0,
          paddingRight: hovered ? 26 : 0,
          borderRadius: 32,
          backgroundColor: "#F59E0B",
          color: "#1A1714",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: hovered ? 8 : 0,
          border: "none",
          cursor: "pointer",
          animation: empty ? "fabRing 2s infinite" : undefined,
          boxShadow: empty ? undefined : "0 8px 32px rgba(245,158,11,0.45), 0 4px 12px rgba(245,158,11,0.3)",
          transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
          zIndex: 40,
          overflow: "hidden",
          whiteSpace: "nowrap",
          willChange: "transform",
        }}
      >
        <span
          style={{
            fontSize: 24,
            fontWeight: 700,
            lineHeight: 1,
            display: "inline-block",
            transition: "transform 0.3s ease",
            transform: hovered ? "rotate(45deg)" : "rotate(0deg)",
          }}
        >
          +
        </span>
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            maxWidth: hovered ? 120 : 0,
            opacity: hovered ? 1 : 0,
            overflow: "hidden",
            transition: "max-width 0.3s ease, opacity 0.2s ease",
          }}
        >
          New Project
        </span>
      </button>
    </Link>
  );
}

// ── ProjectsClient ────────────────────────────────────────────────────────────

export function ProjectsClient({ projects: initialProjects }: Props) {
  const [projects] = useState<RdProject[]>(initialProjects);
  const [closedOpen, setClosedOpen] = useState(false);

  const byStatus = (status: string) => projects.filter((p) => p.status === status);
  const closedProjects = projects.filter((p) => CLOSED_STATUSES.includes(p.status));

  return (
    <div className="space-y-6">
      {/* Lab pill — pulsing amber glow */}
      <div className="flex items-center gap-3">
        <span
          className="inline-flex items-center gap-1.5 rounded-full font-bold uppercase tracking-widest"
          style={{
            padding: "8px 20px",
            fontSize: "0.85rem",
            fontWeight: 700,
            background: "#FEF3C7",
            border: "1.5px solid #F59E0B",
            color: "#D97706",
            animation: "labPulse 3s ease-in-out infinite",
          }}
        >
          🧪 R&D Lab
        </span>
        <span className="text-xs" style={{ color: "#A89880" }}>
          {projects.length} project{projects.length !== 1 ? "s" : ""} total
        </span>
      </div>

      {/* Kanban board */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4" style={{ minWidth: "max-content" }}>
          {KANBAN_COLUMNS.map((col, colIndex) => (
            <KanbanColumn
              key={col.status}
              column={col}
              projects={byStatus(col.status)}
              colIndex={colIndex}
            />
          ))}
        </div>
      </div>

      {/* Closed projects */}
      {closedProjects.length > 0 && (
        <div style={{ backgroundColor: "#F7F2E8", border: "1px solid #E8DDD0", borderRadius: 16 }}>
          <button
            onClick={() => setClosedOpen((v) => !v)}
            className="w-full flex items-center gap-3 px-5 py-4"
          >
            {closedOpen ? (
              <ChevronDown className="w-4 h-4" style={{ color: "#6B5F50" }} />
            ) : (
              <ChevronRight className="w-4 h-4" style={{ color: "#6B5F50" }} />
            )}
            <span className="text-[13px] font-semibold" style={{ color: "#6B5F50" }}>
              Closed Projects
            </span>
            <span
              className="text-[11px] px-2 py-0.5 rounded-full font-mono"
              style={{ backgroundColor: "#FFFCF7", color: "#A89880", border: "1px solid #E8DDD0" }}
            >
              {closedProjects.length}
            </span>
          </button>
          {closedOpen && (
            <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {closedProjects.map((p) => {
                const { label, color } = formatProjectStatus(p.status);
                return (
                  <Link key={p.id} href={`/dashboard/admin/rd/projects/${p.id}`} style={{ textDecoration: "none" }}>
                    <div
                      style={{
                        backgroundColor: "#FFFFFF",
                        border: "1px solid #E8DDD0",
                        borderRadius: 12,
                        padding: "14px 16px",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.borderColor = "#F59E0B40";
                        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.borderColor = "#E8DDD0";
                        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold" style={{ color: "#1A1714" }}>{p.name}</p>
                        <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${color}`}>{label}</span>
                      </div>
                      <p className="text-[11px] mt-1" style={{ color: "#A89880" }}>
                        {p.iterationCount} iteration{p.iterationCount !== 1 ? "s" : ""} · {relativeTime(p.updatedAt)}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* FAB */}
      <Fab empty={projects.length === 0} />
    </div>
  );
}
