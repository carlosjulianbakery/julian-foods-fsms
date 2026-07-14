"use client";

import { useState } from "react";
import Link from "next/link";
import { TabBar } from "@/components/ui/TabBar";
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

function fmtDate(d: string | Date | null): string {
  if (!d) return "Not set";
  return new Date(d).toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

function relativeTime(d: Date | string): string {
  const ms = Date.now() - new Date(d).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return mins <= 1 ? "Just now" : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(d);
}


const SORT_OPTIONS = [
  { value: "last_activity", label: "Last activity" },
  { value: "name_az", label: "Name A→Z" },
  { value: "status", label: "Status" },
  { value: "most_iterations", label: "Most iterations" },
];

const TABS = [
  { id: "active", label: "Active" },
  { id: "all", label: "All" },
  { id: "closed_launched", label: "Closed — Launched" },
  { id: "closed_discontinued", label: "Closed — Discontinued" },
];

const STATUS_ORDER = ["concept", "in_development", "testing", "pending_approval", "closed_launched", "closed_discontinued"];

export function ProjectsClient({ projects, counts }: Props) {
  const [activeTab, setActiveTab] = useState("active");
  const [sort, setSort] = useState("last_activity");

  const filtered = projects.filter((p) => {
    if (activeTab === "active") return !["closed_launched", "closed_discontinued"].includes(p.status);
    if (activeTab === "all") return true;
    return p.status === activeTab;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "name_az") return a.name.localeCompare(b.name);
    if (sort === "status") return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
    if (sort === "most_iterations") return b.iterationCount - a.iterationCount;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const summaryTiles = [
    { label: "Active Projects", value: counts.active, accent: counts.active > 0 ? "#C41E3A" : "#9ca3af" },
    { label: "In Development", value: counts.inDevelopment, accent: "#3b82f6" },
    { label: "Testing", value: counts.testing, accent: "#f59e0b" },
    { label: "Pending Approval", value: counts.pendingApproval, accent: "#a855f7" },
    { label: "Launched", value: counts.launched, accent: "#10b981" },
    { label: "Discontinued", value: counts.discontinued, accent: "#9ca3af" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {summaryTiles.map((tile) => (
          <div
            key={tile.label}
            className="card p-4 border-l-4"
            style={{ borderLeftColor: tile.accent }}
          >
            <p className="text-2xl font-bold font-mono text-gray-900">{tile.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{tile.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <TabBar tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
        <div className="flex items-center gap-3">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20 focus:border-[#C41E3A]"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <Link
            href="/dashboard/admin/rd/projects/new"
            className="bg-[#C41E3A] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a3192f] transition-colors whitespace-nowrap"
          >
            + New Project
          </Link>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="card p-12 flex flex-col items-center gap-3 border-2 border-dashed border-gray-200">
          <p className="text-sm text-gray-500 font-medium">No projects found</p>
          <p className="text-xs text-gray-400">
            {activeTab !== "all"
              ? "No projects match this filter."
              : "Create your first R&D project to get started."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((project) => (
            <div key={project.id} className="card overflow-hidden">
              <div className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-gray-900">{project.name}</h3>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                      {project.productType.charAt(0).toUpperCase() + project.productType.slice(1)}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${formatProjectStatus(project.status).color}`}>
                      {formatProjectStatus(project.status).label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 whitespace-nowrap shrink-0">
                    {relativeTime(project.updatedAt)}
                  </p>
                </div>

                <p className="mt-2 text-sm text-gray-600">
                  {project.description
                    ? project.description.length > 100
                      ? project.description.slice(0, 100) + "..."
                      : project.description
                    : <span className="italic text-gray-400">No description</span>}
                </p>

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span>Started: {fmtDate(project.startedDate)}</span>
                  <span>Target launch: {fmtDate(project.targetLaunchDate)}</span>
                  <span>{project.iterationCount} iteration{project.iterationCount !== 1 ? "s" : ""}</span>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  {project.createdByName && (
                    <p className="text-xs text-gray-400">Created by {project.createdByName}</p>
                  )}
                  <Link
                    href={`/dashboard/admin/rd/projects/${project.id}`}
                    className="text-sm font-medium text-[#C41E3A] hover:text-[#a3192f] transition-colors ml-auto"
                  >
                    View Project →
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
