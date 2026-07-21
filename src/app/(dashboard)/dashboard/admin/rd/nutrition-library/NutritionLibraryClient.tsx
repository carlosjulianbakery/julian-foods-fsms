"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface NutritionProfile {
  id: string;
  ingredientName: string;
  materialId: string | null;
  rdIngredientId: string | null;
  caloriesPer100g: number | null;
  fatPer100g: number | null;
  saturatedFatPer100g: number | null;
  transFatPer100g: number | null;
  cholesterolPer100g: number | null;
  sodiumPer100g: number | null;
  carbsPer100g: number | null;
  fiberPer100g: number | null;
  sugarsPer100g: number | null;
  proteinPer100g: number | null;
  usdaFdcId: string | null;
  usdaFoodDescription: string | null;
  dataSource: string;
  containsAddedSugars: boolean;
  updatedAt: string;
  createdBy: { name: string | null } | null;
}

function SourceBadge({ source }: { source: string }) {
  const cfg: Record<string, { label: string; bg: string; color: string }> = {
    usda:            { label: "USDA",            bg: "#D1FAE5", color: "#065F46" },
    manual:          { label: "Manual",          bg: "#F3F4F6", color: "#4B5563" },
    usda_overridden: { label: "USDA Overridden", bg: "#FEF3C7", color: "#92400E" },
  };
  const s = cfg[source] ?? { label: source, bg: "#F3F4F6", color: "#4B5563" };
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 5, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function TypeBadge({ materialId, rdIngredientId }: { materialId: string | null; rdIngredientId: string | null }) {
  const isMat = !!materialId;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 5, background: isMat ? "#EDE9FE" : "#DBEAFE", color: isMat ? "#5B21B6" : "#1E40AF" }}>
      {isMat ? "Material" : "R&D Ingredient"}
    </span>
  );
}

function fmt(v: number | null, unit: string) {
  if (v == null) return "—";
  return `${v}${unit}`;
}

export default function NutritionLibraryClient() {
  const [profiles, setProfiles] = useState<NutritionProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/rd/nutrition/library")
      .then((r) => r.json())
      .then((data) => {
        setProfiles(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = profiles.filter((p) => {
    if (search && !p.ingredientName.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterSource !== "all" && p.dataSource !== filterSource) return false;
    if (filterType === "material" && !p.materialId) return false;
    if (filterType === "rd_ingredient" && !p.rdIngredientId) return false;
    return true;
  });

  const S = {
    page: { background: "#F7F2E8", minHeight: "100vh", padding: "24px" } as React.CSSProperties,
    card: { background: "#FFFFFF", border: "1px solid #E8DDD0", borderRadius: 12, overflow: "hidden" } as React.CSSProperties,
    hdr: { background: "#1A1714", color: "#FFFFFF", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" } as React.CSSProperties,
    input: { padding: "8px 12px", border: "1px solid #E8DDD0", borderRadius: 8, fontSize: 13, color: "#1A1714", background: "#FFFFFF" } as React.CSSProperties,
    select: { padding: "8px 12px", border: "1px solid #E8DDD0", borderRadius: 8, fontSize: 13, color: "#1A1714", background: "#FFFFFF", cursor: "pointer" } as React.CSSProperties,
    th: { padding: "10px 14px", textAlign: "left" as const, fontSize: 11, fontWeight: 700, color: "#6B5F50", borderBottom: "1px solid #E8DDD0", background: "#F7F2E8", textTransform: "uppercase" as const, letterSpacing: "0.04em" },
    td: { padding: "12px 14px", fontSize: 13, color: "#1A1714", borderBottom: "1px solid #F3EDE5" } as React.CSSProperties,
  };

  return (
    <div style={S.page}>
      {/* Back button */}
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/dashboard/admin/rd/projects"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "8px 16px", borderRadius: 10,
            border: "1.5px solid #E8DDD0", background: "#FFFFFF",
            color: "#6B5F50", fontSize: "0.875rem", fontWeight: 600,
            textDecoration: "none", transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLAnchorElement;
            el.style.borderColor = "#F59E0B";
            el.style.color = "#D97706";
            el.style.background = "#FEF3C7";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLAnchorElement;
            el.style.borderColor = "#E8DDD0";
            el.style.color = "#6B5F50";
            el.style.background = "#FFFFFF";
          }}
        >
          ← R&D Projects
        </Link>
      </div>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#F59E0B" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#A89880", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            R&D · Nutrition Library
          </span>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: "#1A1714", margin: 0 }}>Nutrition Library</h1>
        <p style={{ fontSize: 13, color: "#6B5F50", marginTop: 4 }}>
          Nutritional profiles for ingredients used across R&D projects. Profiles are shared globally and reused when calculating iteration nutrition facts.
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          style={{ ...S.input, flex: 1, minWidth: 200 }}
          placeholder="Search ingredients…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select style={S.select} value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
          <option value="all">All sources</option>
          <option value="usda">USDA</option>
          <option value="manual">Manual</option>
          <option value="usda_overridden">USDA Overridden</option>
        </select>
        <select style={S.select} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="all">All types</option>
          <option value="material">Materials</option>
          <option value="rd_ingredient">R&D Ingredients</option>
        </select>
      </div>

      {/* Count */}
      <div style={{ fontSize: 12, color: "#A89880", marginBottom: 10 }}>
        {loading ? "Loading…" : `${filtered.length} of ${profiles.length} profiles`}
      </div>

      {/* Table */}
      <div style={S.card}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#A89880", fontSize: 13 }}>Loading profiles…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#A89880", fontSize: 13 }}>
            {profiles.length === 0 ? "No profiles yet. Add nutritional data to ingredients inside an R&D iteration." : "No profiles match your filters."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={S.th}>Ingredient</th>
                <th style={S.th}>Type</th>
                <th style={S.th}>Source</th>
                <th style={S.th}>Cal</th>
                <th style={S.th}>Fat</th>
                <th style={S.th}>Carbs</th>
                <th style={S.th}>Protein</th>
                <th style={S.th}>Sodium</th>
                <th style={S.th}>Last Updated</th>
                <th style={S.th} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <>
                  <tr
                    key={p.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#FFFBF5")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                  >
                    <td style={{ ...S.td, fontWeight: 600 }}>
                      {p.ingredientName}
                      {p.usdaFoodDescription && (
                        <div style={{ fontSize: 11, color: "#A89880", marginTop: 2 }}>{p.usdaFoodDescription}</div>
                      )}
                    </td>
                    <td style={S.td}><TypeBadge materialId={p.materialId} rdIngredientId={p.rdIngredientId} /></td>
                    <td style={S.td}><SourceBadge source={p.dataSource} /></td>
                    <td style={{ ...S.td, fontFamily: "monospace" }}>{fmt(p.caloriesPer100g, " kcal")}</td>
                    <td style={{ ...S.td, fontFamily: "monospace" }}>{fmt(p.fatPer100g, "g")}</td>
                    <td style={{ ...S.td, fontFamily: "monospace" }}>{fmt(p.carbsPer100g, "g")}</td>
                    <td style={{ ...S.td, fontFamily: "monospace" }}>{fmt(p.proteinPer100g, "g")}</td>
                    <td style={{ ...S.td, fontFamily: "monospace" }}>{fmt(p.sodiumPer100g, "mg")}</td>
                    <td style={{ ...S.td, color: "#6B5F50", fontSize: 12 }}>
                      {new Date(p.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td style={{ ...S.td, color: "#A89880", fontSize: 11 }}>
                      {expanded === p.id ? "▲" : "▼"}
                    </td>
                  </tr>
                  {expanded === p.id && (
                    <tr key={`${p.id}-detail`}>
                      <td colSpan={10} style={{ padding: "0 0 0 30px", background: "#FFFBF5" }}>
                        <div style={{ padding: "14px 16px 14px 0", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
                          {[
                            ["Calories",        p.caloriesPer100g, "kcal"],
                            ["Total Fat",        p.fatPer100g,      "g"],
                            ["Saturated Fat",    p.saturatedFatPer100g, "g"],
                            ["Trans Fat",        p.transFatPer100g, "g"],
                            ["Cholesterol",      p.cholesterolPer100g, "mg"],
                            ["Sodium",           p.sodiumPer100g,   "mg"],
                            ["Total Carbs",      p.carbsPer100g,    "g"],
                            ["Dietary Fiber",    p.fiberPer100g,    "g"],
                            ["Total Sugars",     p.sugarsPer100g,   "g"],
                            ["Protein",          p.proteinPer100g,  "g"],
                          ].map(([label, val, unit]) => (
                            <div key={String(label)} style={{ background: "#FFFFFF", border: "1px solid #E8DDD0", borderRadius: 8, padding: "8px 12px" }}>
                              <div style={{ fontSize: 10, color: "#A89880", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
                              <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1714", marginTop: 2, fontFamily: "monospace" }}>
                                {val != null ? `${val} ${unit}` : "—"}
                              </div>
                              <div style={{ fontSize: 10, color: "#A89880" }}>per 100g</div>
                            </div>
                          ))}
                          {p.containsAddedSugars && (
                            <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "#92400E", background: "#FEF3C7", border: "1px solid #F59E0B", borderRadius: 8, padding: "6px 10px" }}>
                              ⚠ Contains added sugars
                            </div>
                          )}
                          {p.createdBy?.name && (
                            <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "#A89880" }}>
                              Added by {p.createdBy.name}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
