export type MaterialAttrs = {
  isOrganic: boolean;
  isAllergen: boolean;
  isGlutenFree: boolean;
  hasSpecialRisk: boolean;
  specialRiskTypes: unknown;
  coaRequired?: boolean;
  materialType?: string;
};

export type DocumentReqBase = {
  id: string;
  isRequired: boolean;
  isSystemLocked: boolean;
  triggerType: string | null;
  triggerCondition: string | null;
};

export function doesTriggerApply(req: DocumentReqBase, materials: MaterialAttrs[]): boolean {
  if (!req.triggerType || !req.triggerCondition) return true;
  if (req.triggerType === "supplier_level") return true;
  if (req.triggerType === "material_level") {
    const cond = req.triggerCondition;
    if (cond === "all_materials") return materials.length > 0;
    if (cond === "is_allergen") return materials.some((m) => m.isAllergen);
    if (cond === "is_organic") return materials.some((m) => m.isOrganic);
    if (cond === "is_gluten_free") return materials.some((m) => m.isGlutenFree);
    if (cond === "has_special_risk") return materials.some((m) => m.hasSpecialRisk);
    if (cond === "coa_required") return materials.some((m) => m.coaRequired === true);
    if (cond === "raw_ingredient") return materials.some((m) => m.materialType === "raw");
    if (cond.startsWith("special_risk:")) {
      const riskType = cond.slice("special_risk:".length);
      return materials.some((m) => {
        if (!m.hasSpecialRisk) return false;
        if (!Array.isArray(m.specialRiskTypes)) return false;
        const types = m.specialRiskTypes as string[];
        if (riskType === "Other") return types.some((t) => t.startsWith("Other:") || t === "Other");
        return types.includes(riskType);
      });
    }
  }
  return true;
}

export function getTriggerLabel(triggerType: string | null, triggerCondition: string | null): string {
  if (!triggerType || !triggerCondition) return "Custom Rule";
  if (triggerType === "supplier_level" && triggerCondition === "all_suppliers") return "All Suppliers";
  if (triggerType === "material_level") {
    if (triggerCondition === "all_materials") return "All Materials";
    if (triggerCondition === "is_allergen") return "Allergen Material";
    if (triggerCondition === "is_organic") return "Organic Material";
    if (triggerCondition === "is_gluten_free") return "Gluten Free Material";
    if (triggerCondition === "has_special_risk") return "Special Risk Material";
    if (triggerCondition === "coa_required") return "COA Required Material";
    if (triggerCondition === "raw_ingredient") return "Ingredient Material";
    if (triggerCondition.startsWith("special_risk:")) {
      return `Special Risk — ${triggerCondition.slice("special_risk:".length)}`;
    }
  }
  return "Custom Rule";
}

export function filterApplicableRequirements<T extends DocumentReqBase>(
  requirements: T[],
  materials: MaterialAttrs[]
): T[] {
  return requirements.filter((req) => doesTriggerApply(req, materials));
}
