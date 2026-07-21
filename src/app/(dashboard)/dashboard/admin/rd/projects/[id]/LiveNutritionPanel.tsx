"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { convertToBase } from "@/lib/unitConversion";
import { servingSettingsCache } from "@/lib/rd-serving-settings-cache";

// ── Types ─────────────────────────────────────────────────────────────────

export interface NutritionProfileLite {
  ingredientName: string;
  caloriesPer100g: number | null;
  fatPer100g: number | null;
  saturatedFatPer100g: number | null;
  carbsPer100g: number | null;
  fiberPer100g: number | null;
  sugarsPer100g: number | null;
  proteinPer100g: number | null;
  sodiumPer100g: number | null;
}

export interface RecipeIngredientForPanel {
  name: string;
  quantity: string | number | null;
  unit: string | null;
}

interface NutritionTotals {
  calories: number;
  fat: number;
  saturatedFat: number;
  carbs: number;
  fiber: number;
  sugars: number;
  protein: number;
  sodium: number;
  totalWeightG: number;
  profiledCount: number;
}

// ── Calculation helpers ────────────────────────────────────────────────────

function calcTotals(
  recipe: RecipeIngredientForPanel[],
  profileMap: Map<string, NutritionProfileLite | null>
): NutritionTotals | null {
  let calories = 0, fat = 0, saturatedFat = 0, carbs = 0, fiber = 0,
    sugars = 0, protein = 0, sodium = 0, totalWeightG = 0, profiledCount = 0;

  for (const ing of recipe) {
    const name = ing.name?.trim();
    if (!name) continue;

    const profile = profileMap.get(name) ?? profileMap.get(name.toLowerCase()) ?? null;
    if (!profile) continue;

    const qty =
      typeof ing.quantity === "string"
        ? parseFloat(ing.quantity)
        : ing.quantity != null
        ? Number(ing.quantity)
        : NaN;
    if (!isFinite(qty) || qty <= 0) continue;

    const qtyG = convertToBase(qty, ing.unit ?? "g");
    if (qtyG <= 0) continue;

    const s = qtyG / 100;
    calories += s * (profile.caloriesPer100g ?? 0);
    fat += s * (profile.fatPer100g ?? 0);
    saturatedFat += s * (profile.saturatedFatPer100g ?? 0);
    carbs += s * (profile.carbsPer100g ?? 0);
    fiber += s * (profile.fiberPer100g ?? 0);
    sugars += s * (profile.sugarsPer100g ?? 0);
    protein += s * (profile.proteinPer100g ?? 0);
    sodium += s * (profile.sodiumPer100g ?? 0);
    totalWeightG += qtyG;
    profiledCount++;
  }

  if (profiledCount === 0) return null;
  return { calories, fat, saturatedFat, carbs, fiber, sugars, protein, sodium, totalWeightG, profiledCount };
}

function scaleToServing(t: NutritionTotals, servingG: number): NutritionTotals {
  const f = t.totalWeightG > 0 ? servingG / t.totalWeightG : 0;
  return {
    calories: t.calories * f,
    fat: t.fat * f,
    saturatedFat: t.saturatedFat * f,
    carbs: t.carbs * f,
    fiber: t.fiber * f,
    sugars: t.sugars * f,
    protein: t.protein * f,
    sodium: t.sodium * f,
    totalWeightG: servingG,
    profiledCount: t.profiledCount,
  };
}

const NUTRIENT_KEYS = ["calories", "fat", "saturatedFat", "carbs", "fiber", "sugars", "protein", "sodium"] as const;
type NKey = typeof NUTRIENT_KEYS[number];

function fmt(v: number, decimals = 1): string {
  return v.toFixed(decimals);
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {[80, 60, 50, 70, 55, 60, 65, 55].map((w, i) => (
        <div
          key={i}
          style={{
            height: 14,
            width: `${w}%`,
            borderRadius: 6,
            backgroundColor: "#E8DDD0",
            animation: "rdPulse 1.4s ease-in-out infinite",
            animationDelay: `${i * 0.08}s`,
          }}
        />
      ))}
    </div>
  );
}

// ── Nutrient row ───────────────────────────────────────────────────────────

function NutrientRow({
  label,
  value,
  unit,
  indent = false,
  bold = false,
  flashing,
}: {
  label: string;
  value: number;
  unit: string;
  indent?: boolean;
  bold?: boolean;
  flashing: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: "3px 0",
        paddingLeft: indent ? 14 : 0,
        borderRadius: 5,
        transition: "background-color 0.1s",
        backgroundColor: flashing ? "#F59E0B20" : "transparent",
      }}
    >
      <span
        style={{
          color: indent ? "#8B7355" : "#5A4E42",
          fontSize: indent ? 12 : 13,
          fontWeight: bold ? 700 : 500,
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: "#1A1714",
          fontSize: indent ? 12 : 13,
          fontWeight: bold ? 700 : 600,
          fontFamily: "monospace",
        }}
      >
        {unit === "kcal" ? Math.round(value) : fmt(value)} {unit}
      </span>
    </div>
  );
}

// ── Full panel ─────────────────────────────────────────────────────────────

function FullPanel({
  totals,
  serving,
  servingSizeLabel,
  missingCount,
  flashing,
  showServing,
  onToggle,
}: {
  totals: NutritionTotals;
  serving: NutritionTotals | null;
  servingSizeLabel: string | null;
  missingCount: number;
  flashing: Set<NKey>;
  showServing: boolean;
  onToggle: () => void;
}) {
  const display = showServing && serving ? serving : totals;
  const isServing = showServing && !!serving;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#A89880" }}>
          {isServing ? `Per serving${servingSizeLabel ? ` (${servingSizeLabel})` : ""}` : "Recipe totals"}
        </span>
        {serving && (
          <button
            onClick={onToggle}
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#F59E0B",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "2px 6px",
              borderRadius: 6,
              textDecoration: "underline",
            }}
          >
            {isServing ? "Recipe totals" : "Per serving"}
          </button>
        )}
      </div>

      {/* Nutrients */}
      <div style={{ borderTop: "1px solid #E8DDD0", paddingTop: 8 }}>
        <NutrientRow label="Calories" value={display.calories} unit="kcal" bold flashing={flashing.has("calories")} />
        <NutrientRow label="Total Fat" value={display.fat} unit="g" bold flashing={flashing.has("fat")} />
        <NutrientRow label="Sat. Fat" value={display.saturatedFat} unit="g" indent flashing={flashing.has("saturatedFat")} />
        <NutrientRow label="Total Carbs" value={display.carbs} unit="g" bold flashing={flashing.has("carbs")} />
        <NutrientRow label="Fiber" value={display.fiber} unit="g" indent flashing={flashing.has("fiber")} />
        <NutrientRow label="Sugars" value={display.sugars} unit="g" indent flashing={flashing.has("sugars")} />
        <NutrientRow label="Protein" value={display.protein} unit="g" bold flashing={flashing.has("protein")} />
        <NutrientRow label="Sodium" value={display.sodium} unit="mg" bold flashing={flashing.has("sodium")} />
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid #E8DDD0", paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, color: "#A89880" }}>
          Recipe: {fmt(totals.totalWeightG, 0)} g total · {totals.profiledCount} ingredient{totals.profiledCount !== 1 ? "s" : ""} profiled
        </span>
        {missingCount > 0 && (
          <span style={{ fontSize: 11, color: "#D97706" }}>
            ⚠ {missingCount} ingredient{missingCount !== 1 ? "s" : ""} missing profile
          </span>
        )}
      </div>
    </div>
  );
}

// ── Pill (compact) ─────────────────────────────────────────────────────────

function Pill({
  totals,
  serving,
  servingSizeLabel,
  expanded,
  onToggle,
  missingCount,
  flashing,
}: {
  totals: NutritionTotals;
  serving: NutritionTotals | null;
  servingSizeLabel: string | null;
  expanded: boolean;
  onToggle: () => void;
  missingCount: number;
  flashing: Set<NKey>;
}) {
  const d = serving ?? totals;
  const label = serving
    ? servingSizeLabel ?? "per serving"
    : `per ${fmt(totals.totalWeightG, 0)} g`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <button
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 14px",
          backgroundColor: "#FEF3C7",
          border: "1.5px solid #F59E0B50",
          borderRadius: expanded ? "12px 12px 0 0" : 12,
          cursor: "pointer",
          textAlign: "left",
          width: "100%",
        }}
      >
        <span style={{ fontSize: 13 }}>⚡</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#92400E", fontFamily: "monospace" }}>
          {Math.round(d.calories)} cal
        </span>
        <span style={{ color: "#A89880", fontSize: 11 }}>·</span>
        <span style={{ fontSize: 12, color: "#78350F" }}>
          {fmt(d.fat)} g fat
        </span>
        <span style={{ color: "#A89880", fontSize: 11 }}>·</span>
        <span style={{ fontSize: 12, color: "#78350F" }}>
          {fmt(d.carbs)} g carbs
        </span>
        <span style={{ color: "#A89880", fontSize: 11 }}>·</span>
        <span style={{ fontSize: 12, color: "#78350F" }}>
          {fmt(d.protein)} g protein
        </span>
        <span style={{ fontSize: 10, color: "#A89880", marginLeft: "auto" }}>
          {label}
        </span>
        <span style={{ fontSize: 11, color: "#A89880", marginLeft: 4 }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div
          style={{
            border: "1.5px solid #F59E0B50",
            borderTop: "none",
            borderRadius: "0 0 12px 12px",
            padding: "12px 14px",
            backgroundColor: "#FFFBF2",
          }}
        >
          <FullPanel
            totals={totals}
            serving={serving}
            servingSizeLabel={servingSizeLabel}
            missingCount={missingCount}
            flashing={flashing}
            showServing={!!serving}
            onToggle={() => {}}
          />
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

interface LiveNutritionPanelProps {
  recipe: RecipeIngredientForPanel[];
  /** Pre-loaded profile map. If omitted, the panel fetches its own profiles. */
  profileMap?: Map<string, NutritionProfileLite | null>;
  profilesLoading?: boolean;
  /** Serving size in grams. If omitted, checked from servingSettingsCache[iterationId]. */
  servingSizeG?: number | null;
  servingSizeLabel?: string | null;
  iterationId?: string;
  /** When true: renders as a collapsible amber pill (used in RecipeTab). */
  compact?: boolean;
  missingCount?: number;
}

export default function LiveNutritionPanel({
  recipe,
  profileMap: externalProfileMap,
  profilesLoading: externalLoading,
  servingSizeG: servingSizeGProp,
  servingSizeLabel: servingSizeLabelProp,
  iterationId,
  compact = false,
  missingCount: missingCountProp,
}: LiveNutritionPanelProps) {
  const [internalProfileMap, setInternalProfileMap] = useState<Map<string, NutritionProfileLite | null>>(new Map());
  const [internalLoading, setInternalLoading] = useState(false);
  const [showServing, setShowServing] = useState(true);
  const [pillExpanded, setPillExpanded] = useState(false);
  const [flashing, setFlashing] = useState<Set<NKey>>(new Set());
  const prevTotalsRef = useRef<NutritionTotals | null>(null);

  const profileMap = externalProfileMap ?? internalProfileMap;
  const profilesLoading = externalLoading ?? internalLoading;

  // Resolve serving size: prop → cache → null
  const servingSizeG = useMemo(() => {
    if (servingSizeGProp != null) return servingSizeGProp;
    if (iterationId) {
      const cached = servingSettingsCache.get(iterationId);
      if (cached) return cached.servingSizeG;
    }
    return null;
  }, [servingSizeGProp, iterationId]);

  const servingSizeLabel = useMemo(() => {
    if (servingSizeLabelProp != null) return servingSizeLabelProp;
    if (iterationId) {
      const cached = servingSettingsCache.get(iterationId);
      if (cached?.servingSizeLabel) return cached.servingSizeLabel;
    }
    return null;
  }, [servingSizeLabelProp, iterationId]);

  // Self-load profiles when no external map is provided
  const nameKey = recipe.map((r) => r.name?.trim() ?? "").join("|");
  useEffect(() => {
    if (externalProfileMap !== undefined) return; // external map provided — skip
    const names = Array.from(new Set(nameKey.split("|").filter(Boolean)));
    const newNames = names.filter((n) => !internalProfileMap.has(n));
    if (!newNames.length) return;

    let cancelled = false;
    setInternalLoading(true);
    fetch(`/api/rd/nutrition/profiles-bulk?names=${encodeURIComponent(newNames.join(","))}`)
      .then((r) => r.json())
      .then((data: Record<string, NutritionProfileLite | null>) => {
        if (cancelled) return;
        setInternalProfileMap((prev) => {
          const next = new Map(prev);
          for (const [n, p] of Object.entries(data)) next.set(n, p);
          return next;
        });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setInternalLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameKey]);

  // Compute recipe totals
  const totals = useMemo(() => calcTotals(recipe, profileMap), [recipe, profileMap]);

  // Per-serving
  const serving = useMemo(
    () => (totals && servingSizeG ? scaleToServing(totals, servingSizeG) : null),
    [totals, servingSizeG]
  );

  // Flash changed values
  useEffect(() => {
    if (!totals) { prevTotalsRef.current = null; return; }
    const prev = prevTotalsRef.current;
    if (prev) {
      const changed = new Set<NKey>();
      NUTRIENT_KEYS.forEach((k) => {
        if (Math.abs((totals[k] ?? 0) - (prev[k] ?? 0)) > 0.001) changed.add(k);
      });
      if (changed.size > 0) {
        setFlashing(changed);
        const t = setTimeout(() => setFlashing(new Set()), 400);
        return () => clearTimeout(t);
      }
    }
    prevTotalsRef.current = totals;
  }, [totals]);

  // Missing count
  const missingCount = useMemo(() => {
    if (missingCountProp !== undefined) return missingCountProp;
    return recipe.filter((r) => {
      const n = r.name?.trim();
      return n && profileMap.has(n) && profileMap.get(n) === null;
    }).length;
  }, [recipe, profileMap, missingCountProp]);

  // ── Skeleton while loading ──
  const namedCount = recipe.filter((r) => r.name?.trim()).length;

  if (profilesLoading && !totals) {
    if (compact) return null;
    return (
      <div
        style={{
          backgroundColor: "#FAF7F2",
          border: "1px solid #E8DDD0",
          borderRadius: 12,
          padding: "14px 16px",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#A89880", display: "block", marginBottom: 12 }}>
          ⚡ Live Nutrition
        </span>
        <Skeleton />
      </div>
    );
  }

  if (!totals) {
    if (compact) return null;
    return (
      <div
        style={{
          backgroundColor: "#FAF7F2",
          border: "1px solid #E8DDD0",
          borderRadius: 12,
          padding: "14px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          alignItems: "center",
          justifyContent: "center",
          minHeight: 80,
        }}
      >
        <span style={{ fontSize: 20 }}>🧮</span>
        <span style={{ fontSize: 12, color: "#A89880", textAlign: "center" }}>
          {namedCount === 0
            ? "Add ingredients to see live nutrition"
            : "Add nutrition profiles to see calculations"}
        </span>
      </div>
    );
  }

  if (compact) {
    return (
      <Pill
        totals={totals}
        serving={serving}
        servingSizeLabel={servingSizeLabel}
        expanded={pillExpanded}
        onToggle={() => setPillExpanded((s) => !s)}
        missingCount={missingCount}
        flashing={flashing}
      />
    );
  }

  return (
    <div
      style={{
        backgroundColor: "#FAF7F2",
        border: "1px solid #E8DDD0",
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#A89880",
          display: "block",
          marginBottom: 10,
        }}
      >
        ⚡ Live Nutrition
      </span>
      <FullPanel
        totals={totals}
        serving={serving}
        servingSizeLabel={servingSizeLabel}
        missingCount={missingCount}
        flashing={flashing}
        showServing={showServing}
        onToggle={() => setShowServing((s) => !s)}
      />
    </div>
  );
}
