"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────

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

interface USDAResult {
  fdcId: string;
  description: string;
  dataType: string;
  brandOwner: string | null;
  brandName: string | null;
  nutrition: {
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
  };
}

interface FormState {
  caloriesPer100g: string;
  fatPer100g: string;
  saturatedFatPer100g: string;
  transFatPer100g: string;
  cholesterolPer100g: string;
  sodiumPer100g: string;
  carbsPer100g: string;
  fiberPer100g: string;
  sugarsPer100g: string;
  proteinPer100g: string;
  containsAddedSugars: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────

const FORM_FIELDS: Array<{ key: keyof Omit<FormState, "containsAddedSugars">; label: string; unit: string }> = [
  { key: "caloriesPer100g", label: "Calories", unit: "kcal" },
  { key: "fatPer100g", label: "Total Fat", unit: "g" },
  { key: "saturatedFatPer100g", label: "Saturated Fat", unit: "g" },
  { key: "transFatPer100g", label: "Trans Fat", unit: "g" },
  { key: "cholesterolPer100g", label: "Cholesterol", unit: "mg" },
  { key: "sodiumPer100g", label: "Sodium", unit: "mg" },
  { key: "carbsPer100g", label: "Total Carbohydrates", unit: "g" },
  { key: "fiberPer100g", label: "Dietary Fiber", unit: "g" },
  { key: "sugarsPer100g", label: "Total Sugars", unit: "g" },
  { key: "proteinPer100g", label: "Protein", unit: "g" },
];

const DATA_TYPE_BADGES: Record<string, { label: string; bg: string; color: string }> = {
  Foundation:          { label: "Foundation",     bg: "#D1FAE5", color: "#065F46" },
  "SR Legacy":         { label: "SR Legacy",      bg: "#DBEAFE", color: "#1E3A8A" },
  "Survey (FNDDS)":    { label: "Survey (FNDDS)", bg: "#DBEAFE", color: "#1E3A8A" },
  Branded:             { label: "Branded",        bg: "#F3F4F6", color: "#374151" },
};

function profileToForm(p: NutritionProfile): FormState {
  return {
    caloriesPer100g: p.caloriesPer100g != null ? String(p.caloriesPer100g) : "",
    fatPer100g: p.fatPer100g != null ? String(p.fatPer100g) : "",
    saturatedFatPer100g: p.saturatedFatPer100g != null ? String(p.saturatedFatPer100g) : "",
    transFatPer100g: p.transFatPer100g != null ? String(p.transFatPer100g) : "",
    cholesterolPer100g: p.cholesterolPer100g != null ? String(p.cholesterolPer100g) : "",
    sodiumPer100g: p.sodiumPer100g != null ? String(p.sodiumPer100g) : "",
    carbsPer100g: p.carbsPer100g != null ? String(p.carbsPer100g) : "",
    fiberPer100g: p.fiberPer100g != null ? String(p.fiberPer100g) : "",
    sugarsPer100g: p.sugarsPer100g != null ? String(p.sugarsPer100g) : "",
    proteinPer100g: p.proteinPer100g != null ? String(p.proteinPer100g) : "",
    containsAddedSugars: p.containsAddedSugars,
  };
}

function usdaToForm(u: USDAResult): FormState {
  const n = u.nutrition;
  return {
    caloriesPer100g: n.caloriesPer100g != null ? String(n.caloriesPer100g) : "",
    fatPer100g: n.fatPer100g != null ? String(n.fatPer100g) : "",
    saturatedFatPer100g: n.saturatedFatPer100g != null ? String(n.saturatedFatPer100g) : "",
    transFatPer100g: n.transFatPer100g != null ? String(n.transFatPer100g) : "",
    cholesterolPer100g: n.cholesterolPer100g != null ? String(n.cholesterolPer100g) : "",
    sodiumPer100g: n.sodiumPer100g != null ? String(n.sodiumPer100g) : "",
    carbsPer100g: n.carbsPer100g != null ? String(n.carbsPer100g) : "",
    fiberPer100g: n.fiberPer100g != null ? String(n.fiberPer100g) : "",
    sugarsPer100g: n.sugarsPer100g != null ? String(n.sugarsPer100g) : "",
    proteinPer100g: n.proteinPer100g != null ? String(n.proteinPer100g) : "",
    containsAddedSugars: false,
  };
}

// ── Shared sub-components ──────────────────────────────────────────────────

function Spinner() {
  return <div style={{ width: 14, height: 14, border: "2px solid rgba(0,0,0,0.15)", borderTopColor: "#F59E0B", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />;
}

function SourceBadge({ source }: { source: string }) {
  const cfg: Record<string, { label: string; bg: string; color: string }> = {
    usda:            { label: "USDA",            bg: "#D1FAE5", color: "#065F46" },
    manual:          { label: "Manual",          bg: "#F3F4F6", color: "#4B5563" },
    usda_overridden: { label: "USDA Overridden", bg: "#FEF3C7", color: "#92400E" },
  };
  const s = cfg[source] ?? { label: source, bg: "#F3F4F6", color: "#4B5563" };
  return <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 5, background: s.bg, color: s.color }}>{s.label}</span>;
}

function TypeBadge({ materialId, rdIngredientId }: { materialId: string | null; rdIngredientId: string | null }) {
  const isMat = !!materialId;
  return <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 5, background: isMat ? "#EDE9FE" : "#DBEAFE", color: isMat ? "#5B21B6" : "#1E40AF" }}>{isMat ? "Material" : "R&D Ingredient"}</span>;
}

function DataTypeBadge({ dataType }: { dataType: string }) {
  const cfg = DATA_TYPE_BADGES[dataType] ?? { label: dataType, bg: "#F3F4F6", color: "#374151" };
  return <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>;
}

function fmt(v: number | null, unit: string) {
  if (v == null) return "—";
  return `${v}${unit}`;
}

function CurrentSourceInfo({ profile }: { profile: NutritionProfile }) {
  const isUsda = profile.dataSource === "usda" || profile.dataSource === "usda_overridden";
  return (
    <div style={{ fontSize: 11, color: "#6B5F50", lineHeight: 1.7, padding: "8px 10px", background: "#F7F2E8", border: "1px solid #E8DDD0", borderRadius: 7, marginBottom: 12 }}>
      <div>
        Current source:{" "}
        <span style={{ fontWeight: 700 }}>
          {isUsda ? "USDA" : "Manually entered"}
          {profile.dataSource === "usda_overridden" ? " (manually adjusted)" : ""}
        </span>
      </div>
      {isUsda && profile.usdaFoodDescription && (
        <div style={{ color: "#A89880" }}>&ldquo;{profile.usdaFoodDescription}&rdquo;</div>
      )}
      {isUsda && profile.usdaFdcId && (
        <div style={{ color: "#A89880" }}>FDC ID: {profile.usdaFdcId}</div>
      )}
    </div>
  );
}

// ── LibraryEditPanel ───────────────────────────────────────────────────────

function LibraryEditPanel({
  profile,
  onSuccess,
  onCancel,
}: {
  profile: NutritionProfile;
  onSuccess: (updated: NutritionProfile) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(profileToForm(profile));
  const [originalDataSource] = useState(profile.dataSource);

  // USDA re-search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<USDAResult[]>([]);
  const [searchTotalHits, setSearchTotalHits] = useState(0);
  const [searchPage, setSearchPage] = useState(1);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [selectedUsda, setSelectedUsda] = useState<USDAResult | null>(null);
  const [usdaJustSelected, setUsdaJustSelected] = useState<USDAResult | null>(null);
  const [originalUsdaForm, setOriginalUsdaForm] = useState<FormState | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editFormRef = useRef<HTMLDivElement>(null);

  const inp = { padding: "5px 8px", border: "1px solid #E8DDD0", borderRadius: 6, fontSize: 12, color: "#1A1714", background: "#FFFFFF", width: "100%" } as React.CSSProperties;
  const lbl = { fontSize: 11, color: "#6B5F50", marginBottom: 2, display: "block" } as React.CSSProperties;

  async function fetchUsda(query: string, page: number): Promise<{ results: USDAResult[]; totalHits: number }> {
    const r = await fetch(`/api/rd/nutrition/usda-search?query=${encodeURIComponent(query)}&page=${page}`);
    if (!r.ok) return { results: [], totalHits: 0 };
    const data = await r.json();
    return { results: data.results ?? [], totalHits: data.totalHits ?? 0 };
  }

  async function openSearch() {
    const query = profile.ingredientName;
    setSearchOpen(true);
    setUsdaJustSelected(null);
    setSearchQuery(query);
    setSearchResults([]);
    setSearchPage(1);
    setSearchTotalHits(0);
    if (!query.trim()) return;
    setSearchLoading(true);
    try {
      const { results, totalHits } = await fetchUsda(query, 1);
      setSearchResults(results);
      setSearchTotalHits(totalHits);
    } catch { /* ignore */ }
    setSearchLoading(false);
  }

  async function runSearch(resetPage = true) {
    if (!searchQuery.trim()) return;
    if (resetPage) {
      setSearchLoading(true);
      setSearchResults([]);
      setSearchPage(1);
    } else {
      setSearchLoadingMore(true);
    }
    try {
      const { results, totalHits } = await fetchUsda(searchQuery, resetPage ? 1 : searchPage);
      setSearchTotalHits(totalHits);
      if (resetPage) setSearchResults(results);
      else { setSearchResults((p) => [...p, ...results]); setSearchPage((p) => p + 1); }
    } catch { /* ignore */ }
    setSearchLoading(false);
    setSearchLoadingMore(false);
  }

  async function loadMore() {
    const nextPage = searchPage + 1;
    setSearchPage(nextPage);
    setSearchLoadingMore(true);
    try {
      const { results, totalHits } = await fetchUsda(searchQuery, nextPage);
      setSearchResults((p) => [...p, ...results]);
      setSearchTotalHits(totalHits);
    } catch { /* ignore */ }
    setSearchLoadingMore(false);
  }

  function selectResult(result: USDAResult) {
    const f = usdaToForm(result);
    setForm(f);
    setOriginalUsdaForm(f);
    setSelectedUsda(result);
    setUsdaJustSelected(result);
    setSearchOpen(false);
    setSearchResults([]);
  }

  function focusManualEdit() {
    if (editFormRef.current) {
      const first = editFormRef.current.querySelector('input[type="number"]') as HTMLInputElement | null;
      first?.focus();
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  async function save() {
    setSaving(true);
    setError(null);

    let dataSource = "manual";
    if (selectedUsda) {
      const changed = originalUsdaForm && FORM_FIELDS.some((f) => form[f.key] !== originalUsdaForm![f.key]);
      dataSource = changed ? "usda_overridden" : "usda";
    } else {
      dataSource = originalDataSource;
    }

    const body: Record<string, unknown> = {
      ingredientName: profile.ingredientName,
      dataSource,
      containsAddedSugars: form.containsAddedSugars,
    };

    if (profile.materialId) body.materialId = profile.materialId;
    if (profile.rdIngredientId) body.rdIngredientId = profile.rdIngredientId;

    if (selectedUsda) {
      body.usdaFdcId = selectedUsda.fdcId;
      body.usdaFoodDescription = selectedUsda.description;
    } else {
      body.usdaFdcId = profile.usdaFdcId;
      body.usdaFoodDescription = profile.usdaFoodDescription;
    }

    FORM_FIELDS.forEach((f) => {
      body[f.key] = form[f.key] !== "" ? parseFloat(form[f.key]) : null;
    });

    try {
      const r = await fetch("/api/rd/nutrition/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const updated: NutritionProfile = await r.json();
        onSuccess(updated);
      } else {
        const d = await r.json();
        setError(d.error ?? "Failed to save.");
      }
    } catch { setError("Network error."); }
    setSaving(false);
  }

  const hasMore = searchResults.length < searchTotalHits;

  return (
    <div style={{ padding: "16px", background: "#FFFBF5", border: "1px solid #F59E0B", borderRadius: 10, margin: "4px 0 8px" }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: "#1A1714", marginBottom: 8 }}>Edit: {profile.ingredientName}</p>
      <CurrentSourceInfo profile={profile} />

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          onClick={openSearch}
          disabled={searchLoading}
          style={{ padding: "8px 14px", borderRadius: 8, border: "1.5px solid #F59E0B", background: "#FEF3C740", color: "#D97706", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
        >
          🔍 Search USDA again
        </button>
        <button
          onClick={focusManualEdit}
          style={{ padding: "8px 14px", borderRadius: 8, border: "1.5px solid #E8DDD0", background: "transparent", color: "#6B5F50", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
        >
          ✏ Edit values manually
        </button>
      </div>

      {/* Inline USDA search */}
      {searchOpen && (
        <div style={{ background: "#FFFFFF", border: "1px solid #E8DDD0", borderRadius: 8, padding: "12px", marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              style={{ flex: 1, padding: "6px 10px", border: "1px solid #E8DDD0", borderRadius: 8, fontSize: 13, color: "#1A1714", background: "#FFFFFF" }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ingredient name…"
              onKeyDown={(e) => e.key === "Enter" && runSearch(true)}
            />
            <button
              onClick={() => runSearch(true)}
              disabled={searchLoading}
              style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #F59E0B", background: "#FEF3C7", color: "#92400E", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
            >
              {searchLoading ? "…" : "Search"}
            </button>
            <button
              onClick={() => { setSearchOpen(false); setSearchResults([]); }}
              style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #E8DDD0", background: "#FFFFFF", color: "#6B5F50", fontSize: 12, cursor: "pointer" }}
            >
              ✕
            </button>
          </div>

          {searchLoading && (
            <div style={{ display: "flex", gap: 8, color: "#A89880", fontSize: 12, alignItems: "center" }}>
              <Spinner /> Searching USDA…
            </div>
          )}

          {searchResults.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: "#6B5F50", marginBottom: 6 }}>
                Showing {searchResults.length}{searchTotalHits > 0 ? ` of ${searchTotalHits.toLocaleString()}` : ""} results
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
                {searchResults.map((res) => {
                  const n = res.nutrition;
                  const f2 = (v: number | null) => v != null ? v : "—";
                  const brand = res.brandOwner || res.brandName;
                  return (
                    <div
                      key={res.fdcId}
                      onClick={() => selectResult(res)}
                      style={{ padding: "10px 12px", border: "1px solid #E8DDD0", borderRadius: 8, cursor: "pointer", background: "#FFFFFF" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#FFFBF5")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "#FFFFFF")}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
                        <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#1A1714", lineHeight: 1.3 }}>{res.description}</div>
                        <DataTypeBadge dataType={res.dataType} />
                      </div>
                      {brand && <div style={{ fontSize: 11, color: "#6B5F50", marginBottom: 4 }}>Brand: <span style={{ fontWeight: 600 }}>{brand}</span></div>}
                      <div style={{ fontSize: 10, color: "#A89880", marginBottom: 6 }}>FDC ID: {res.fdcId}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 11, color: "#6B5F50", fontFamily: "monospace" }}>
                        <span>Cal: {f2(n.caloriesPer100g)}</span>
                        <span>Prot: {f2(n.proteinPer100g)}g</span>
                        <span>Carb: {f2(n.carbsPer100g)}g</span>
                        <span>Fat: {f2(n.fatPer100g)}g</span>
                        <span>Fiber: {f2(n.fiberPer100g)}g</span>
                        <span>Sugar: {f2(n.sugarsPer100g)}g</span>
                      </div>
                      <div style={{ fontSize: 10, color: "#A89880", marginTop: 3 }}>Per 100g (USDA reference)</div>
                    </div>
                  );
                })}
                {hasMore && (
                  <button onClick={loadMore} disabled={searchLoadingMore} style={{ padding: "7px", borderRadius: 7, border: "1px dashed #E8DDD0", background: "#FFFFFF", color: "#6B5F50", fontSize: 12, cursor: "pointer" }}>
                    {searchLoadingMore ? "Loading…" : `Show more (${searchTotalHits - searchResults.length} remaining)`}
                  </button>
                )}
              </div>
            </>
          )}
          {searchResults.length === 0 && !searchLoading && searchQuery && (
            <p style={{ fontSize: 12, color: "#A89880" }}>No results yet — press Search or refine your query</p>
          )}
        </div>
      )}

      {/* Green confirmation banner */}
      {usdaJustSelected && (
        <div style={{ padding: "8px 12px", background: "#D1FAE5", border: "1px solid #6EE7B7", borderRadius: 8, fontSize: 11, color: "#065F46", marginBottom: 10 }}>
          ✓ Values updated from USDA &ldquo;{usdaJustSelected.description}&rdquo; (FDC ID: {usdaJustSelected.fdcId})
        </div>
      )}

      {/* Form fields — always visible */}
      <div ref={editFormRef}>
        <p style={{ fontSize: 12, fontWeight: 700, color: "#1A1714", marginBottom: 6 }}>Values (per 100g)</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          {FORM_FIELDS.map((f) => (
            <div key={f.key}>
              <label style={lbl}>{f.label} ({f.unit})</label>
              <input
                type="number" min="0" step="any"
                style={inp}
                value={form[f.key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder="0"
              />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <input
            type="checkbox"
            id={`addedSugarsLib-${profile.id}`}
            checked={form.containsAddedSugars}
            onChange={(e) => setForm((prev) => ({ ...prev, containsAddedSugars: e.target.checked }))}
          />
          <label htmlFor={`addedSugarsLib-${profile.id}`} style={{ fontSize: 12, color: "#1A1714" }}>Contains added sugars</label>
        </div>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: "#DC2626", marginBottom: 8 }}>{error}</div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #E8DDD0", background: "#FFFFFF", color: "#6B5F50", fontSize: 12, cursor: "pointer" }}>
          Cancel
        </button>
        <button onClick={save} disabled={saving} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#F59E0B", color: "#1A1714", fontSize: 12, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
          {saving ? "Saving…" : "Save Profile"}
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function NutritionLibraryClient() {
  const [profiles, setProfiles] = useState<NutritionProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadProfiles = useCallback(() => {
    fetch("/api/rd/nutrition/library")
      .then((r) => r.json())
      .then((data) => {
        setProfiles(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  function handleEditSuccess(updated: NutritionProfile) {
    setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setEditingId(null);
    setToast(`✓ Profile saved for ${updated.ingredientName}`);
    setTimeout(() => setToast(null), 3000);
  }

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
    input: { padding: "8px 12px", border: "1px solid #E8DDD0", borderRadius: 8, fontSize: 13, color: "#1A1714", background: "#FFFFFF" } as React.CSSProperties,
    select: { padding: "8px 12px", border: "1px solid #E8DDD0", borderRadius: 8, fontSize: 13, color: "#1A1714", background: "#FFFFFF", cursor: "pointer" } as React.CSSProperties,
    th: { padding: "10px 14px", textAlign: "left" as const, fontSize: 11, fontWeight: 700, color: "#6B5F50", borderBottom: "1px solid #E8DDD0", background: "#F7F2E8", textTransform: "uppercase" as const, letterSpacing: "0.04em" },
    td: { padding: "12px 14px", fontSize: 13, color: "#1A1714", borderBottom: "1px solid #F3EDE5" } as React.CSSProperties,
  };

  return (
    <div style={S.page}>
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 100, background: "#1A1714", color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, boxShadow: "0 4px 20px rgba(0,0,0,0.2)" }}>
          {toast}
        </div>
      )}

      {/* Back button */}
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/dashboard/admin/rd/projects"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, border: "1.5px solid #E8DDD0", background: "#FFFFFF", color: "#6B5F50", fontSize: "0.875rem", fontWeight: 600, textDecoration: "none", transition: "all 0.15s" }}
          onMouseEnter={(e) => { const el = e.currentTarget as HTMLAnchorElement; el.style.borderColor = "#F59E0B"; el.style.color = "#D97706"; el.style.background = "#FEF3C7"; }}
          onMouseLeave={(e) => { const el = e.currentTarget as HTMLAnchorElement; el.style.borderColor = "#E8DDD0"; el.style.color = "#6B5F50"; el.style.background = "#FFFFFF"; }}
        >
          ← R&D Projects
        </Link>
      </div>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#F59E0B" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#A89880", letterSpacing: "0.1em", textTransform: "uppercase" }}>R&D · Nutrition Library</span>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: "#1A1714", margin: 0 }}>Nutrition Library</h1>
        <p style={{ fontSize: 13, color: "#6B5F50", marginTop: 4 }}>
          Nutritional profiles for ingredients used across R&D projects. Profiles are shared globally and reused when calculating iteration nutrition facts.
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input style={{ ...S.input, flex: 1, minWidth: 200 }} placeholder="Search ingredients…" value={search} onChange={(e) => setSearch(e.target.value)} />
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

      <div style={{ fontSize: 12, color: "#A89880", marginBottom: 10 }}>
        {loading ? "Loading…" : `${filtered.length} of ${profiles.length} profiles`}
      </div>

      {/* Table */}
      <div style={S.card}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#A89880", fontSize: 13 }}>Loading profiles…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#A89880", fontSize: 13 }}>
            {profiles.length === 0
              ? "No profiles yet. Add nutritional data to ingredients inside an R&D iteration."
              : "No profiles match your filters."}
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
              {filtered.map((p) => {
                const isExpanded = expanded === p.id;
                const isEditing = editingId === p.id;

                return (
                  <>
                    <tr
                      key={p.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        if (isExpanded) {
                          setExpanded(null);
                          if (isEditing) setEditingId(null);
                        } else {
                          setExpanded(p.id);
                        }
                      }}
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
                      <td style={{ ...S.td, color: "#A89880", fontSize: 11 }}>{isExpanded ? "▲" : "▼"}</td>
                    </tr>

                    {isExpanded && (
                      <tr key={`${p.id}-detail`}>
                        <td colSpan={10} style={{ padding: "0 0 0 30px", background: "#FFFBF5" }}>
                          {isEditing ? (
                            <div style={{ padding: "12px 16px 12px 0" }}>
                              <LibraryEditPanel
                                profile={p}
                                onSuccess={handleEditSuccess}
                                onCancel={() => setEditingId(null)}
                              />
                            </div>
                          ) : (
                            <div style={{ padding: "14px 16px 14px 0" }}>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
                                {[
                                  ["Calories",      p.caloriesPer100g, "kcal"],
                                  ["Total Fat",     p.fatPer100g,      "g"],
                                  ["Saturated Fat", p.saturatedFatPer100g, "g"],
                                  ["Trans Fat",     p.transFatPer100g, "g"],
                                  ["Cholesterol",   p.cholesterolPer100g, "mg"],
                                  ["Sodium",        p.sodiumPer100g,   "mg"],
                                  ["Total Carbs",   p.carbsPer100g,    "g"],
                                  ["Dietary Fiber", p.fiberPer100g,    "g"],
                                  ["Total Sugars",  p.sugarsPer100g,   "g"],
                                  ["Protein",       p.proteinPer100g,  "g"],
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
                                  <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "#A89880" }}>Added by {p.createdBy.name}</div>
                                )}
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingId(p.id); }}
                                style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #E8DDD0", background: "#FFFFFF", color: "#6B5F50", fontSize: 12, cursor: "pointer", fontWeight: 500 }}
                              >
                                Edit profile
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
