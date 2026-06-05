export type MaterialAttrs = {
  isOrganic: boolean;
  isAllergen: boolean;
  isGlutenFree: boolean;
  hasSpecialRisk: boolean;
  specialRiskTypes: unknown;
};

export type DocumentReqBase = {
  id: string;
  isRequired: boolean;
  isSystemLocked: boolean;
  triggerType: string | null;
  triggerCondition: string | null;
};

/** Returns true if the requirement applies given the supplier's material attributes. */
export function doesTriggerApply(req: DocumentReqBase, materials: MaterialAttrs[]): boolean {
  if (!req.triggerType || !req.triggerCondition) return true;

  if (req.triggerType === "supplier_level") return true;

  if (req.triggerType === "material_level") {
    const cond = req.triggerCondition;
    if (cond === "all_materials") return materials.length > 0;
    if (cond === "is_allergen") return materials.some((m) => m.isAllergen);
    if (cond === "is_organic") return materials.some((m) => m.isOrganic);
    if (cond === "is_gluten_free") return materials.some((m) => m.isGlutenFree);
    if (cond.startsWith("special_risk:")) {
      const riskType = cond.slice("special_risk:".length);
      return materials.some((m) => {
        if (!m.hasSpecialRisk) return false;
        if (!Array.isArray(m.specialRiskTypes)) return false;
        const types = m.specialRiskTypes as string[];
        if (riskType === "Other") {
          return types.some((t) => t.startsWith("Other:") || t === "Other");
        }
        return types.includes(riskType);
      });
    }
  }

  return true;
}

/** Human-readable label for a trigger condition. */
export function getTriggerLabel(triggerType: string | null, triggerCondition: string | null): string {
  if (!triggerType || !triggerCondition) return "Custom Rule";
  if (triggerType === "supplier_level" && triggerCondition === "all_suppliers") return "All Suppliers";
  if (triggerType === "material_level") {
    if (triggerCondition === "all_materials") return "All Materials";
    if (triggerCondition === "is_allergen") return "Allergen Material";
    if (triggerCondition === "is_organic") return "Organic Material";
    if (triggerCondition === "is_gluten_free") return "Gluten Free Material";
    if (triggerCondition.startsWith("special_risk:")) {
      const riskType = triggerCondition.slice("special_risk:".length);
      return `Special Risk — ${riskType}`;
    }
  }
  return "Custom Rule";
}

/** Given all requirements and a supplier's materials, return only the applicable ones. */
export function filterApplicableRequirements<T extends DocumentReqBase>(
  requirements: T[],
  materials: MaterialAttrs[]
): T[] {
  return requirements.filter((req) => doesTriggerApply(req, materials));
}
