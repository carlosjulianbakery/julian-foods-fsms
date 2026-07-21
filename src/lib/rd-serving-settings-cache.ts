export interface ServingSettingsEntry {
  servingSizeG: number;
  servingSizeLabel: string;
  servingsPerContainer: number;
  calculatedAddedSugars: number;
}

// Module-level — persists across component mounts within a browser session.
// Written by NutritionCalculatorTab after a successful PATCH;
// read by LiveNutritionPanel to get the current serving size for live calculations.
export const servingSettingsCache = new Map<string, ServingSettingsEntry>();
