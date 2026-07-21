"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

interface IngredientRow {
  ingredientType: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  notes?: string | null;
}

interface NutritionProfile {
  id: string;
  ingredientName: string;
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

interface CalcResult {
  perServing: {
    calories: number; fat: number; saturatedFat: number; transFat: number;
    cholesterol: number; sodium: number; carbs: number; fiber: number;
    sugars: number; addedSugars: number; protein: number;
  };
  breakdown: Array<{ ingredientName: string; quantityG: number; calories: number; protein: number; carbs: number; fat: number }>;
  totalRecipeWeightG: number;
  servingSize: number;
  servingSizeLabel: string;
  servingsPerContainer: number;
  missingProfiles: Array<{ ingredientName: string; ingredientType: string; id: string }>;
  warnings: string[];
}

interface FormState {
  caloriesPer100g: string; fatPer100g: string; saturatedFatPer100g: string;
  transFatPer100g: string; cholesterolPer100g: string; sodiumPer100g: string;
  carbsPer100g: string; fiberPer100g: string; sugarsPer100g: string;
  proteinPer100g: string; containsAddedSugars: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────

const EMPTY_FORM: FormState = {
  caloriesPer100g: "", fatPer100g: "", saturatedFatPer100g: "", transFatPer100g: "",
  cholesterolPer100g: "", sodiumPer100g: "", carbsPer100g: "", fiberPer100g: "",
  sugarsPer100g: "", proteinPer100g: "", containsAddedSugars: false,
};

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

// FDA 2020 Daily Reference Values
const DRV = { fat: 78, saturatedFat: 20, cholesterol: 300, sodium: 2300, carbs: 275, fiber: 28, addedSugars: 50 };

function dv(val: number, ref: number): number {
  return Math.round((val / ref) * 100);
}

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

function ingKey(ing: IngredientRow) {
  return `${ing.ingredientType}:${ing.name}`;
}

// Data type badge config
const DATA_TYPE_BADGES: Record<string, { label: string; bg: string; color: string; priority: number }> = {
  Foundation:          { label: "Foundation",       bg: "#D1FAE5", color: "#065F46", priority: 1 },
  "SR Legacy":         { label: "SR Legacy",        bg: "#DBEAFE", color: "#1E3A8A", priority: 2 },
  "Survey (FNDDS)":    { label: "Survey (FNDDS)",   bg: "#DBEAFE", color: "#1E3A8A", priority: 3 },
  Branded:             { label: "Branded",          bg: "#F3F4F6", color: "#374151", priority: 4 },
};

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  iterationId: string;
  iterationNumber: number;
  recipe: IngredientRow[];
  projectName: string;
  savedServingSizeG: number | null;
  savedServingSizeLabel: string | null;
  savedServingsPerContainer: number | null;
  savedAddedSugars: number | null;
  onActualsSaved: () => void;
  onSwitchToActuals: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function NutritionCalculatorTab({
  iterationId,
  iterationNumber,
  recipe,
  projectName,
  savedServingSizeG,
  savedServingSizeLabel,
  savedServingsPerContainer,
  savedAddedSugars,
  onActualsSaved,
  onSwitchToActuals,
}: Props) {
  // ID resolution maps
  const [matIdByName, setMatIdByName] = useState<Map<string, string>>(new Map());
  const [rdIdByName, setRdIdByName] = useState<Map<string, string>>(new Map());
  const [idMapsLoaded, setIdMapsLoaded] = useState(false);

  // Profiles keyed by ingKey
  const [profiles, setProfiles] = useState<Map<string, NutritionProfile | null>>(new Map());
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesLoadedOnce, setProfilesLoadedOnce] = useState(false);

  // Active panel
  const [activeKey, setActiveKey] = useState<string | null>(null);
  type PanelMode = "search" | "form" | "edit";
  const [panelMode, setPanelMode] = useState<PanelMode | null>(null);

  // USDA search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<USDAResult[]>([]);
  const [searchTotalHits, setSearchTotalHits] = useState(0);
  const [searchPage, setSearchPage] = useState(1);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const [selectedUsda, setSelectedUsda] = useState<USDAResult | null>(null);
  const [originalUsdaForm, setOriginalUsdaForm] = useState<FormState | null>(null);

  // Edit form
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);
  const [originalDataSource, setOriginalDataSource] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileToast, setProfileToast] = useState<string | null>(null);

  // Serving settings — initialized from saved values
  const [servingSize, setServingSize] = useState(savedServingSizeG != null ? String(savedServingSizeG) : "");
  const [servingSizeLabel, setServingSizeLabel] = useState(savedServingSizeLabel ?? "");
  const [servingsPerContainer, setServingsPerContainer] = useState(
    savedServingsPerContainer != null ? String(savedServingsPerContainer) : "1"
  );
  const [addedSugarsPerServing, setAddedSugarsPerServing] = useState(
    savedAddedSugars != null ? String(savedAddedSugars) : "0"
  );

  // Calculation
  const [calculating, setCalculating] = useState(false);
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null);
  const autoCalcRanRef = useRef(false);

  // Save as actuals
  const [savingActuals, setSavingActuals] = useState(false);
  const [actualsToast, setActualsToast] = useState<string | null>(null);

  // Export
  const [exporting, setExporting] = useState(false);
  const labelRef = useRef<HTMLDivElement>(null);

  // ── Load ID maps ────────────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([
      fetch("/api/supplier-management/materials").then((r) => r.json()).catch(() => []),
      fetch("/api/rd/ingredients").then((r) => r.json()).catch(() => []),
    ]).then(([mats, rdIngs]) => {
      const matMap = new Map<string, string>();
      if (Array.isArray(mats)) mats.forEach((m: { id: string; name: string }) => matMap.set(m.name, m.id));
      const rdMap = new Map<string, string>();
      if (Array.isArray(rdIngs)) rdIngs.forEach((i: { id: string; name: string }) => rdMap.set(i.name, i.id));
      setMatIdByName(matMap);
      setRdIdByName(rdMap);
      setIdMapsLoaded(true);
    });
  }, []);

  // ── Load profiles ────────────────────────────────────────────────────────

  const loadProfiles = useCallback(async (
    matMap: Map<string, string>,
    rdMap: Map<string, string>
  ) => {
    if (recipe.length === 0) { setProfilesLoadedOnce(true); return; }
    setProfilesLoading(true);
    const results = new Map<string, NutritionProfile | null>();
    await Promise.all(
      recipe.map(async (ing) => {
        const key = ingKey(ing);
        const matId = ing.ingredientType === "material" ? matMap.get(ing.name) : null;
        const rdId = ing.ingredientType === "rd_ingredient" ? rdMap.get(ing.name) : null;
        const param = matId ? `materialId=${matId}` : rdId ? `rdIngredientId=${rdId}` : null;
        if (!param) { results.set(key, null); return; }
        try {
          const r = await fetch(`/api/rd/nutrition/profile?${param}`);
          results.set(key, r.ok ? await r.json() : null);
        } catch {
          results.set(key, null);
        }
      })
    );
    setProfiles(results);
    setProfilesLoading(false);
    setProfilesLoadedOnce(true);
  }, [recipe]);

  useEffect(() => {
    if (idMapsLoaded) loadProfiles(matIdByName, rdIdByName);
  }, [idMapsLoaded, loadProfiles]);

  // ── Auto-run calculation if settings were saved and profiles are ready ───

  useEffect(() => {
    if (
      !autoCalcRanRef.current &&
      profilesLoadedOnce &&
      savedServingSizeG != null &&
      savedServingSizeG > 0
    ) {
      const hasAnyProfile = recipe.some((ing) => !!profiles.get(ingKey(ing)));
      if (hasAnyProfile) {
        autoCalcRanRef.current = true;
        runCalculate(
          savedServingSizeG,
          savedServingSizeLabel ?? `${savedServingSizeG}g`,
          savedServingsPerContainer ?? 1,
          savedAddedSugars ?? 0,
        );
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profilesLoadedOnce, profiles]);

  // ── USDA search ─────────────────────────────────────────────────────────

  async function runSearch(resetPage = true) {
    if (!searchQuery.trim()) return;
    const page = resetPage ? 1 : searchPage;
    if (resetPage) {
      setSearchLoading(true);
      setSearchResults([]);
      setSearchPage(1);
    } else {
      setSearchLoadingMore(true);
    }
    setSelectedUsda(null);
    try {
      const r = await fetch(
        `/api/rd/nutrition/usda-search?query=${encodeURIComponent(searchQuery)}&page=${page}`
      );
      if (r.ok) {
        const data = await r.json();
        const incoming: USDAResult[] = data.results ?? [];
        setSearchTotalHits(data.totalHits ?? 0);
        if (resetPage) {
          setSearchResults(incoming);
        } else {
          setSearchResults((prev) => [...prev, ...incoming]);
          setSearchPage((p) => p + 1);
        }
      }
    } catch { /* ignore */ }
    setSearchLoading(false);
    setSearchLoadingMore(false);
  }

  async function loadMoreResults() {
    const nextPage = searchPage + 1;
    setSearchPage(nextPage);
    setSearchLoadingMore(true);
    try {
      const r = await fetch(
        `/api/rd/nutrition/usda-search?query=${encodeURIComponent(searchQuery)}&page=${nextPage}`
      );
      if (r.ok) {
        const data = await r.json();
        const incoming: USDAResult[] = data.results ?? [];
        setSearchResults((prev) => [...prev, ...incoming]);
        setSearchTotalHits(data.totalHits ?? 0);
      }
    } catch { /* ignore */ }
    setSearchLoadingMore(false);
  }

  function selectUsdaResult(result: USDAResult) {
    setSelectedUsda(result);
    const f = usdaToForm(result);
    setFormData(f);
    setOriginalUsdaForm(f);
    setPanelMode("form");
  }

  // ── Open/close panels ────────────────────────────────────────────────────

  function openSearch(key: string, ingredientName: string) {
    setActiveKey(key);
    setPanelMode("search");
    setSearchQuery(ingredientName);
    setSearchResults([]);
    setSearchTotalHits(0);
    setSearchPage(1);
    setSelectedUsda(null);
    setFormData(EMPTY_FORM);
    setOriginalUsdaForm(null);
    setOriginalDataSource(null);
  }

  function openManual(key: string) {
    setActiveKey(key);
    setPanelMode("form");
    setSearchResults([]);
    setSelectedUsda(null);
    setFormData(EMPTY_FORM);
    setOriginalUsdaForm(null);
    setOriginalDataSource(null);
  }

  function openEdit(key: string, profile: NutritionProfile) {
    setActiveKey(key);
    setPanelMode("edit");
    setSearchResults([]);
    setSelectedUsda(null);
    setFormData(profileToForm(profile));
    setOriginalUsdaForm(null);
    setOriginalDataSource(profile.dataSource);
  }

  function closePanel() {
    setActiveKey(null);
    setPanelMode(null);
    setSearchResults([]);
    setSearchTotalHits(0);
    setSearchPage(1);
    setSelectedUsda(null);
    setFormData(EMPTY_FORM);
    setOriginalUsdaForm(null);
    setOriginalDataSource(null);
  }

  // ── Save profile ─────────────────────────────────────────────────────────

  async function saveProfile(ing: IngredientRow) {
    const matId = ing.ingredientType === "material" ? matIdByName.get(ing.name) : null;
    const rdId = ing.ingredientType === "rd_ingredient" ? rdIdByName.get(ing.name) : null;
    if (!matId && !rdId) {
      showToast("Cannot find this ingredient in the registry.");
      return;
    }

    let dataSource = "manual";
    if (selectedUsda) {
      const changed = originalUsdaForm && FORM_FIELDS.some((f) => formData[f.key] !== originalUsdaForm![f.key]);
      dataSource = changed ? "usda_overridden" : "usda";
    } else if (panelMode === "edit" && originalDataSource) {
      dataSource = originalDataSource;
    }

    const body: Record<string, unknown> = {
      ingredientName: ing.name,
      dataSource,
      containsAddedSugars: formData.containsAddedSugars,
    };
    if (matId) body.materialId = matId;
    if (rdId) body.rdIngredientId = rdId;
    if (selectedUsda) {
      body.usdaFdcId = selectedUsda.fdcId;
      body.usdaFoodDescription = selectedUsda.description;
    }
    FORM_FIELDS.forEach((f) => {
      body[f.key] = formData[f.key] !== "" ? parseFloat(formData[f.key]) : null;
    });

    setSavingProfile(true);
    try {
      const r = await fetch("/api/rd/nutrition/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const saved: NutritionProfile = await r.json();
        setProfiles((prev) => new Map(prev).set(ingKey(ing), saved));
        closePanel();
        showToast(`Profile saved for ${ing.name}.`);
        setCalcResult(null);
      } else {
        const d = await r.json();
        showToast(d.error ?? "Failed to save profile.");
      }
    } catch {
      showToast("Network error.");
    }
    setSavingProfile(false);
  }

  function showToast(msg: string) {
    setProfileToast(msg);
    setTimeout(() => setProfileToast(null), 3000);
  }

  // ── Calculate ────────────────────────────────────────────────────────────

  async function runCalculate(
    sizeG: number,
    sizeLabel: string,
    spc: number,
    addedSugars: number,
  ) {
    setCalculating(true);
    try {
      // Save settings in parallel with calculation
      fetch(`/api/rd/iterations/${iterationId}/serving-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          servingSizeG: sizeG,
          servingSizeLabel: sizeLabel,
          servingsPerContainer: spc,
          calculatedAddedSugars: addedSugars,
        }),
      }).catch(() => { /* non-blocking */ });

      const r = await fetch("/api/rd/nutrition/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          iterationId,
          servingSize: sizeG,
          servingSizeLabel: sizeLabel,
          servingsPerContainer: spc,
          addedSugarsPerServing: addedSugars,
        }),
      });
      if (r.ok) setCalcResult(await r.json());
      else { const d = await r.json(); alert(d.error ?? "Calculation failed."); }
    } catch { alert("Network error during calculation."); }
    setCalculating(false);
  }

  async function calculate() {
    if (!servingSize || Number(servingSize) <= 0) return;
    await runCalculate(
      Number(servingSize),
      servingSizeLabel || `${servingSize}g`,
      Number(servingsPerContainer) || 1,
      Number(addedSugarsPerServing) || 0,
    );
  }

  // ── Save as actuals ──────────────────────────────────────────────────────

  async function saveAsActuals() {
    if (!calcResult) return;
    setSavingActuals(true);
    const p = calcResult.perServing;
    try {
      const r = await fetch(`/api/rd/iterations/${iterationId}/nutrition`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actualCalories: p.calories,
          actualFat: p.fat,
          actualSaturatedFat: p.saturatedFat,
          actualCarbs: p.carbs,
          actualFiber: p.fiber,
          actualSugars: p.sugars,
          actualAddedSugars: p.addedSugars,
          actualProtein: p.protein,
          actualSodium: p.sodium,
        }),
      });
      if (r.ok) {
        onActualsSaved();
        setActualsToast("✓ Nutritional actuals updated from calculator");
        setTimeout(() => { setActualsToast(null); onSwitchToActuals(); }, 1500);
      } else {
        alert("Failed to save actuals.");
      }
    } catch { alert("Network error."); }
    setSavingActuals(false);
  }

  // ── Export label ─────────────────────────────────────────────────────────

  async function exportLabel() {
    if (!labelRef.current || exporting) return;
    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(labelRef.current, {
        backgroundColor: "#ffffff",
        scale: 3,
        useCORS: true,
        logging: false,
      });
      const link = document.createElement("a");
      link.download = `${projectName} - Iteration ${iterationNumber} - Nutrition Label.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("Export failed:", err);
      alert("Export failed. Please try again.");
    }
    setExporting(false);
  }

  // ── Derived state ────────────────────────────────────────────────────────

  const profiledCount = recipe.filter((ing) => !!profiles.get(ingKey(ing))).length;
  const totalCount = recipe.length;
  const canCalculate = Number(servingSize) > 0 && profiledCount > 0;
  const hasMoreResults = searchResults.length < searchTotalHits;

  // ── Styles ───────────────────────────────────────────────────────────────

  const S = {
    card: { background: "#FFFFFF", border: "1px solid #E8DDD0", borderRadius: 12, padding: "16px 18px", marginBottom: 14 } as React.CSSProperties,
    sectionTitle: { fontSize: 13, fontWeight: 700, color: "#1A1714", marginBottom: 12 } as React.CSSProperties,
    ingRow: { display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: "1px solid #F3EDE5" } as React.CSSProperties,
    btn: { padding: "5px 12px", borderRadius: 8, border: "1px solid #E8DDD0", background: "#FFFFFF", color: "#6B5F50", fontSize: 12, cursor: "pointer", fontWeight: 500 } as React.CSSProperties,
    btnAmber: { padding: "5px 12px", borderRadius: 8, border: "1px solid #F59E0B", background: "#FEF3C7", color: "#92400E", fontSize: 12, cursor: "pointer", fontWeight: 500 } as React.CSSProperties,
    input: { padding: "6px 10px", border: "1px solid #E8DDD0", borderRadius: 8, fontSize: 13, color: "#1A1714", background: "#FFFFFF", width: "100%" } as React.CSSProperties,
    label: { fontSize: 11, color: "#6B5F50", marginBottom: 3, display: "block", fontWeight: 600 } as React.CSSProperties,
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Toast */}
      {(profileToast || actualsToast) && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 100, background: "#1A1714", color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, boxShadow: "0 4px 20px rgba(0,0,0,0.2)" }}>
          {profileToast ?? actualsToast}
        </div>
      )}

      {/* ── Ingredient Profiles ── */}
      <div style={S.card}>
        <p style={S.sectionTitle}>Ingredient Profiles</p>
        <p style={{ fontSize: 11, color: "#A89880", marginBottom: 10, marginTop: -8 }}>
          Profiles are shared across all R&D projects — enter once, use everywhere.
        </p>

        {profilesLoading && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#A89880", fontSize: 13 }}>
            <Spinner /> Loading profiles…
          </div>
        )}

        {!profilesLoading && recipe.length === 0 && (
          <p style={{ color: "#A89880", fontSize: 13, fontStyle: "italic" }}>No ingredients in this recipe.</p>
        )}

        {!profilesLoading && recipe.map((ing) => {
          const key = ingKey(ing);
          const profile = profiles.get(key) ?? null;
          const isOpen = activeKey === key;
          const matId = ing.ingredientType === "material" ? matIdByName.get(ing.name) : null;
          const rdId = ing.ingredientType === "rd_ingredient" ? rdIdByName.get(ing.name) : null;
          const canResolve = !!(matId || rdId);

          return (
            <div key={key}>
              <div style={S.ingRow}>
                <div style={{ width: 20, paddingTop: 1, flexShrink: 0 }}>
                  {profile
                    ? <span style={{ fontSize: 16, color: "#059669" }}>✓</span>
                    : <span style={{ fontSize: 16, color: "#D97706" }}>⚠</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1714" }}>{ing.name}</div>
                  {profile ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                      <SourceBadge source={profile.dataSource} />
                      <span style={{ fontSize: 11, color: "#6B5F50" }}>
                        {profile.caloriesPer100g != null ? `${profile.caloriesPer100g} kcal/100g` : "0 kcal/100g"}
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: "#D97706", marginTop: 2 }}>
                      {canResolve ? "No profile yet" : "Ingredient not found in registry — profile unavailable"}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {profile ? (
                    <button style={S.btn} onClick={() => isOpen && panelMode === "edit" ? closePanel() : openEdit(key, profile)}>
                      {isOpen && panelMode === "edit" ? "Close" : "Edit profile"}
                    </button>
                  ) : canResolve ? (
                    <>
                      <button
                        style={isOpen && panelMode === "search" ? S.btnAmber : S.btn}
                        onClick={() => isOpen && panelMode === "search" ? closePanel() : openSearch(key, ing.name)}
                      >
                        {isOpen && panelMode === "search" ? "Close" : "Search USDA"}
                      </button>
                      <button
                        style={isOpen && panelMode === "form" ? S.btnAmber : S.btn}
                        onClick={() => isOpen && panelMode === "form" ? closePanel() : openManual(key)}
                      >
                        {isOpen && panelMode === "form" ? "Close" : "Enter manually"}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              {/* Inline panel */}
              {isOpen && (
                <div style={{ background: "#FFFBF5", border: "1px solid #F59E0B", borderRadius: 10, padding: "14px 16px", margin: "4px 0 12px 30px" }}>

                  {/* Search mode */}
                  {panelMode === "search" && !selectedUsda && (
                    <>
                      {/* Search input */}
                      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                        <input
                          style={{ ...S.input, flex: 1 }}
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search ingredient name…"
                          onKeyDown={(e) => e.key === "Enter" && runSearch(true)}
                        />
                        <button
                          style={{ ...S.btnAmber, padding: "6px 14px" }}
                          onClick={() => runSearch(true)}
                          disabled={searchLoading}
                        >
                          {searchLoading ? "…" : "Search"}
                        </button>
                      </div>

                      {/* Guidance note */}
                      {searchResults.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <button
                            onClick={() => setGuidanceOpen((o) => !o)}
                            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 11, color: "#6B5F50" }}
                          >
                            <span style={{ fontSize: 13 }}>ℹ</span>
                            <span style={{ fontWeight: 600 }}>Which result to choose?</span>
                            <span style={{ color: "#A89880" }}>{guidanceOpen ? "▲" : "▼"}</span>
                          </button>
                          {guidanceOpen && (
                            <div style={{ marginTop: 6, padding: "10px 12px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, fontSize: 11, color: "#1E40AF", lineHeight: 1.6 }}>
                              <div><strong>Foundation & SR Legacy</strong> → most accurate for generic ingredients (lab-tested by USDA)</div>
                              <div><strong>Branded</strong> → use when you know the exact brand being used in your recipe</div>
                              <div style={{ marginTop: 4, color: "#6B7280" }}>All values are per 100g (USDA reference weight)</div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Result count */}
                      {searchResults.length > 0 && (
                        <div style={{ fontSize: 11, color: "#6B5F50", marginBottom: 8 }}>
                          Showing {searchResults.length}{searchTotalHits > 0 ? ` of ${searchTotalHits.toLocaleString()}` : ""} results for &ldquo;{searchQuery}&rdquo;
                        </div>
                      )}

                      {/* Results list */}
                      {searchResults.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {searchResults.map((res) => (
                            <USDAResultCard key={res.fdcId} result={res} onSelect={selectUsdaResult} />
                          ))}

                          {/* Show more */}
                          {hasMoreResults && (
                            <button
                              onClick={loadMoreResults}
                              disabled={searchLoadingMore}
                              style={{ marginTop: 4, padding: "8px", borderRadius: 8, border: "1px dashed #E8DDD0", background: "#FFFFFF", color: "#6B5F50", fontSize: 12, cursor: "pointer" }}
                            >
                              {searchLoadingMore ? "Loading…" : `Show more results (${searchTotalHits - searchResults.length} remaining)`}
                            </button>
                          )}
                        </div>
                      )}

                      {searchResults.length === 0 && !searchLoading && searchQuery && (
                        <p style={{ fontSize: 12, color: "#A89880" }}>No results yet — press Search</p>
                      )}
                    </>
                  )}

                  {/* USDA selected badge */}
                  {selectedUsda && panelMode === "form" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, padding: "6px 10px", background: "#D1FAE5", border: "1px solid #6EE7B7", borderRadius: 7 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#065F46" }}>USDA: {selectedUsda.description}</span>
                      <button
                        style={{ marginLeft: "auto", fontSize: 11, color: "#6B5F50", background: "none", border: "none", cursor: "pointer" }}
                        onClick={() => { setSelectedUsda(null); setPanelMode("search"); }}
                      >
                        Change
                      </button>
                    </div>
                  )}

                  {/* Form */}
                  {(panelMode === "form" || panelMode === "edit") && (
                    <NutritionForm
                      form={formData}
                      onChange={setFormData}
                      onSave={() => saveProfile(ing)}
                      onCancel={closePanel}
                      saving={savingProfile}
                      title={panelMode === "edit" ? "Edit Nutritional Profile" : "Nutritional Profile (per 100g)"}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Serving Settings ── */}
      <div style={S.card}>
        <p style={S.sectionTitle}>Serving Settings</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={S.label}>Serving Size (grams) *</label>
            <input
              type="number" min="0" step="0.1" style={S.input}
              value={servingSize}
              onChange={(e) => setServingSize(e.target.value)}
              placeholder="e.g. 28"
            />
          </div>
          <div>
            <label style={S.label}>Serving Size Label</label>
            <input
              type="text" style={S.input}
              value={servingSizeLabel}
              onChange={(e) => setServingSizeLabel(e.target.value)}
              placeholder="e.g. 1 bar, 2 tbsp"
            />
          </div>
          <div>
            <label style={S.label}>Servings per Container</label>
            <input
              type="number" min="1" step="1" style={S.input}
              value={servingsPerContainer}
              onChange={(e) => setServingsPerContainer(e.target.value)}
              placeholder="e.g. 12"
            />
          </div>
          <div>
            <label style={S.label}>Added Sugars per Serving (g)</label>
            <input
              type="number" min="0" step="0.1" style={S.input}
              value={addedSugarsPerServing}
              onChange={(e) => setAddedSugarsPerServing(e.target.value)}
              placeholder="0"
            />
            <p style={{ fontSize: 10, color: "#A89880", marginTop: 3 }}>
              Enter manually based on ingredients marked as containing added sugars above.
            </p>
          </div>
        </div>
      </div>

      {/* ── Calculate button ── */}
      <div style={{ marginBottom: 14 }}>
        {profiledCount < totalCount && profiledCount > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#FEF3C7", border: "1px solid #F59E0B", borderRadius: 8, marginBottom: 10, fontSize: 12, color: "#92400E" }}>
            ⚠ Calculating with {profiledCount} of {totalCount} ingredients profiled. Results will be incomplete.
          </div>
        )}
        <button
          onClick={calculate}
          disabled={!canCalculate || calculating}
          style={{
            width: "100%", padding: "12px", borderRadius: 10, border: "none",
            background: canCalculate ? "#F59E0B" : "#E8DDD0",
            color: canCalculate ? "#1A1714" : "#A89880",
            fontSize: 14, fontWeight: 700, cursor: canCalculate ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          {calculating
            ? <><Spinner /> Calculating…</>
            : "🧮 Calculate Nutrition Facts"}
        </button>
      </div>

      {/* ── Results ── */}
      {calcResult && (
        <div>
          {calcResult.missingProfiles.length > 0 && (
            <div style={{ padding: "10px 14px", background: "#FEF3C7", border: "1px solid #F59E0B", borderRadius: 8, marginBottom: 12, fontSize: 12, color: "#92400E" }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠ Excludes {calcResult.missingProfiles.length} ingredient(s) with no profile:</div>
              {calcResult.missingProfiles.map((mp) => <div key={mp.id}>• {mp.ingredientName}</div>)}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
            {/* Breakdown table */}
            <div style={S.card}>
              <p style={{ ...S.sectionTitle, marginBottom: 10 }}>Calculation Breakdown</p>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #E8DDD0" }}>
                    {["Ingredient", "Qty (g)", "Cal", "Protein", "Carbs", "Fat"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "4px 6px", color: "#6B5F50", fontWeight: 600, fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {calcResult.breakdown.map((row, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #F3EDE5" }}>
                      <td style={{ padding: "5px 6px", color: "#1A1714" }}>{row.ingredientName}</td>
                      <td style={{ padding: "5px 6px", color: "#6B5F50", fontFamily: "monospace" }}>{row.quantityG}</td>
                      <td style={{ padding: "5px 6px", color: "#6B5F50", fontFamily: "monospace" }}>{row.calories}</td>
                      <td style={{ padding: "5px 6px", color: "#6B5F50", fontFamily: "monospace" }}>{row.protein}g</td>
                      <td style={{ padding: "5px 6px", color: "#6B5F50", fontFamily: "monospace" }}>{row.carbs}g</td>
                      <td style={{ padding: "5px 6px", color: "#6B5F50", fontFamily: "monospace" }}>{row.fat}g</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: "2px solid #E8DDD0", fontWeight: 700 }}>
                    <td style={{ padding: "5px 6px", color: "#1A1714" }}>Total recipe</td>
                    <td style={{ padding: "5px 6px", color: "#1A1714", fontFamily: "monospace" }}>{calcResult.totalRecipeWeightG}g</td>
                    <td style={{ padding: "5px 6px", color: "#1A1714", fontFamily: "monospace" }}>
                      {calcResult.breakdown.reduce((s, r) => s + r.calories, 0).toFixed(0)}
                    </td>
                    <td style={{ padding: "5px 6px", color: "#1A1714", fontFamily: "monospace" }}>
                      {calcResult.breakdown.reduce((s, r) => s + r.protein, 0).toFixed(1)}g
                    </td>
                    <td style={{ padding: "5px 6px", color: "#1A1714", fontFamily: "monospace" }}>
                      {calcResult.breakdown.reduce((s, r) => s + r.carbs, 0).toFixed(1)}g
                    </td>
                    <td style={{ padding: "5px 6px", color: "#1A1714", fontFamily: "monospace" }}>
                      {calcResult.breakdown.reduce((s, r) => s + r.fat, 0).toFixed(1)}g
                    </td>
                  </tr>
                  <tr style={{ background: "#FEF3C7" }}>
                    <td style={{ padding: "5px 6px", color: "#1A1714", fontWeight: 700 }}>Per serving ({calcResult.servingSize}g)</td>
                    <td style={{ padding: "5px 6px" }} />
                    <td style={{ padding: "5px 6px", color: "#1A1714", fontFamily: "monospace", fontWeight: 700 }}>{calcResult.perServing.calories}</td>
                    <td style={{ padding: "5px 6px", color: "#1A1714", fontFamily: "monospace", fontWeight: 700 }}>{calcResult.perServing.protein}g</td>
                    <td style={{ padding: "5px 6px", color: "#1A1714", fontFamily: "monospace", fontWeight: 700 }}>{calcResult.perServing.carbs}g</td>
                    <td style={{ padding: "5px 6px", color: "#1A1714", fontFamily: "monospace", fontWeight: 700 }}>{calcResult.perServing.fat}g</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* FDA label */}
            <div>
              <FdaLabel ref={labelRef} result={calcResult} />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={exportLabel} disabled={exporting} style={S.btn}>
                  {exporting ? "Exporting…" : "📥 Export Label (PNG)"}
                </button>
              </div>
            </div>
          </div>

          {/* Save as actuals */}
          <div style={{ marginTop: 16, padding: "14px 18px", background: "#FFFFFF", border: "1px solid #E8DDD0", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#1A1714", margin: 0 }}>Use these values as Actuals</p>
              <p style={{ fontSize: 11, color: "#6B5F50", margin: "2px 0 0" }}>Copies per-serving calculated values to the Actuals vs Target tab.</p>
            </div>
            <button
              onClick={saveAsActuals}
              disabled={savingActuals}
              style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: "#059669", color: "#FFFFFF", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              {savingActuals ? "Saving…" : "Use these values as Actuals"}
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div style={{ width: 14, height: 14, border: "2px solid rgba(0,0,0,0.15)", borderTopColor: "#F59E0B", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
  );
}

function SourceBadge({ source }: { source: string }) {
  const cfg: Record<string, { label: string; bg: string; color: string }> = {
    usda:            { label: "USDA",            bg: "#D1FAE5", color: "#065F46" },
    manual:          { label: "Manual",          bg: "#F3F4F6", color: "#4B5563" },
    usda_overridden: { label: "USDA Overridden", bg: "#FEF3C7", color: "#92400E" },
  };
  const s = cfg[source] ?? { label: source, bg: "#F3F4F6", color: "#4B5563" };
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function DataTypeBadge({ dataType }: { dataType: string }) {
  const cfg = DATA_TYPE_BADGES[dataType] ?? { label: dataType, bg: "#F3F4F6", color: "#374151", priority: 99 };
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

function USDAResultCard({ result, onSelect }: { result: USDAResult; onSelect: (r: USDAResult) => void }) {
  const n = result.nutrition;
  const fmt = (v: number | null) => v != null ? v : "—";
  const brandDisplay = result.brandOwner || result.brandName;

  return (
    <div
      onClick={() => onSelect(result)}
      style={{ padding: "10px 12px", border: "1px solid #E8DDD0", borderRadius: 8, cursor: "pointer", background: "#FFFFFF" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#FFFBF5")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "#FFFFFF")}
    >
      {/* Description + badges */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#1A1714", lineHeight: 1.3 }}>
          {result.description}
        </div>
        <DataTypeBadge dataType={result.dataType} />
      </div>

      {/* Brand owner */}
      {brandDisplay && (
        <div style={{ fontSize: 11, color: "#6B5F50", marginBottom: 4 }}>
          Brand: <span style={{ fontWeight: 600 }}>{brandDisplay}</span>
        </div>
      )}

      {/* FDC ID */}
      <div style={{ fontSize: 10, color: "#A89880", marginBottom: 6 }}>
        FDC ID: {result.fdcId}
      </div>

      {/* Macro row */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 11, color: "#6B5F50", fontFamily: "monospace" }}>
        <span>Cal: {fmt(n.caloriesPer100g)}</span>
        <span>Prot: {fmt(n.proteinPer100g)}g</span>
        <span>Carb: {fmt(n.carbsPer100g)}g</span>
        <span>Fat: {fmt(n.fatPer100g)}g</span>
        <span>Fiber: {fmt(n.fiberPer100g)}g</span>
        <span>Sugar: {fmt(n.sugarsPer100g)}g</span>
      </div>
      <div style={{ fontSize: 10, color: "#A89880", marginTop: 3 }}>Per 100g (USDA reference)</div>
    </div>
  );
}

function NutritionForm({
  form, onChange, onSave, onCancel, saving, title,
}: {
  form: FormState;
  onChange: (f: FormState) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  title: string;
}) {
  const S_input = { padding: "5px 8px", border: "1px solid #E8DDD0", borderRadius: 6, fontSize: 12, color: "#1A1714", background: "#FFFFFF", width: "100%" } as React.CSSProperties;
  const S_label = { fontSize: 11, color: "#6B5F50", marginBottom: 2, display: "block" } as React.CSSProperties;
  const FIELDS: Array<{ key: keyof Omit<FormState, "containsAddedSugars">; label: string; unit: string }> = [
    { key: "caloriesPer100g", label: "Calories", unit: "kcal" },
    { key: "fatPer100g", label: "Total Fat", unit: "g" },
    { key: "saturatedFatPer100g", label: "Saturated Fat", unit: "g" },
    { key: "transFatPer100g", label: "Trans Fat", unit: "g" },
    { key: "cholesterolPer100g", label: "Cholesterol", unit: "mg" },
    { key: "sodiumPer100g", label: "Sodium", unit: "mg" },
    { key: "carbsPer100g", label: "Total Carbs", unit: "g" },
    { key: "fiberPer100g", label: "Dietary Fiber", unit: "g" },
    { key: "sugarsPer100g", label: "Total Sugars", unit: "g" },
    { key: "proteinPer100g", label: "Protein", unit: "g" },
  ];

  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 700, color: "#1A1714", marginBottom: 10 }}>{title}</p>
      <p style={{ fontSize: 11, color: "#A89880", marginTop: -8, marginBottom: 10 }}>Values per 100g — edit if needed</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label style={S_label}>{f.label} ({f.unit})</label>
            <input
              type="number" min="0" step="any" style={S_input}
              value={form[f.key]}
              onChange={(e) => onChange({ ...form, [f.key]: e.target.value })}
              placeholder="0"
            />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <input
          type="checkbox" id="containsAddedSugars"
          checked={form.containsAddedSugars}
          onChange={(e) => onChange({ ...form, containsAddedSugars: e.target.checked })}
        />
        <label htmlFor="containsAddedSugars" style={{ fontSize: 12, color: "#1A1714" }}>Contains added sugars</label>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #E8DDD0", background: "#FFFFFF", color: "#6B5F50", fontSize: 12, cursor: "pointer" }}>
          Cancel
        </button>
        <button
          onClick={onSave} disabled={saving}
          style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#F59E0B", color: "#1A1714", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
        >
          {saving ? "Saving…" : "Save Profile"}
        </button>
      </div>
    </div>
  );
}

// ── FDA Label ──────────────────────────────────────────────────────────────

const FdaLabel = React.forwardRef<HTMLDivElement, { result: CalcResult }>(({ result }, ref) => {
  const p = result.perServing;
  const label = result.servingSizeLabel || `${result.servingSize}g`;
  const fullLabel = label.includes("(") ? label : `${label} (${result.servingSize}g)`;

  return (
    <div
      ref={ref}
      style={{
        background: "#FFFFFF", color: "#000000", padding: "10px 12px",
        border: "1px solid #000", fontFamily: "Arial, Helvetica, sans-serif",
        width: 260, boxSizing: "border-box",
      }}
    >
      <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1, borderBottom: "2px solid #000", paddingBottom: 4, marginBottom: 4 }}>
        Nutrition Facts
      </div>
      <div style={{ fontSize: 11, borderBottom: "1px solid #000", paddingBottom: 4, marginBottom: 4 }}>
        {result.servingsPerContainer} servings per container
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "8px solid #000", paddingBottom: 4, marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Serving size</div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{fullLabel}</div>
      </div>
      <div style={{ fontSize: 11, borderBottom: "1px solid #000", paddingBottom: 2, marginBottom: 2 }}>
        Amount per serving
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "3px solid #000", paddingBottom: 4, marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Calories</div>
        <div style={{ fontSize: 28, fontWeight: 900 }}>{p.calories}</div>
      </div>
      <div style={{ fontSize: 10, textAlign: "right", fontWeight: 700, borderBottom: "1px solid #000", paddingBottom: 2, marginBottom: 2 }}>
        % Daily Value*
      </div>
      <FdaRow label="Total Fat" value={`${p.fat}g`} dv={dv(p.fat, DRV.fat)} bold />
      <FdaRow label="Saturated Fat" value={`${p.saturatedFat}g`} dv={dv(p.saturatedFat, DRV.saturatedFat)} indent />
      <FdaRow label="Trans Fat" value={`${p.transFat}g`} indent />
      <FdaRow label="Cholesterol" value={`${p.cholesterol}mg`} dv={dv(p.cholesterol, DRV.cholesterol)} bold />
      <FdaRow label="Sodium" value={`${p.sodium}mg`} dv={dv(p.sodium, DRV.sodium)} bold />
      <FdaRow label="Total Carbohydrate" value={`${p.carbs}g`} dv={dv(p.carbs, DRV.carbs)} bold />
      <FdaRow label="Dietary Fiber" value={`${p.fiber}g`} dv={dv(p.fiber, DRV.fiber)} indent />
      <FdaRow label="Total Sugars" value={`${p.sugars}g`} indent />
      <FdaRow label={`Includes ${p.addedSugars}g Added Sugars`} dv={dv(p.addedSugars, DRV.addedSugars)} indent={2} value="" />
      <FdaRow label="Protein" value={`${p.protein}g`} bold last />
      <div style={{ fontSize: 9, borderTop: "1px solid #000", paddingTop: 4, marginTop: 4, lineHeight: 1.4 }}>
        * The % Daily Value (DV) tells you how much a nutrient in a serving of food contributes to a daily diet. 2,000 calories a day is used for general nutrition advice.
      </div>
    </div>
  );
});
FdaLabel.displayName = "FdaLabel";

function FdaRow({
  label, value, dv: dvVal, bold, indent, last,
}: {
  label: string; value: string; dv?: number; bold?: boolean;
  indent?: boolean | number; last?: boolean;
}) {
  const indentPx = indent === 2 ? 24 : indent ? 12 : 0;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: last ? "4px solid #000" : "1px solid #000", padding: "2px 0", paddingLeft: indentPx }}>
      <span style={{ fontSize: 11, fontWeight: bold ? 700 : 400 }}>{label}</span>
      <div style={{ display: "flex", gap: 8 }}>
        {value && <span style={{ fontSize: 11, fontWeight: bold ? 700 : 400 }}>{value}</span>}
        {dvVal !== undefined && <span style={{ fontSize: 11, fontWeight: 700 }}>{dvVal}%</span>}
      </div>
    </div>
  );
}
