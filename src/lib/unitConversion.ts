export type UnitFamily = "weight" | "volume" | "count";

// Conversion factors to grams (weight base) and millilitres (volume base)
const WEIGHT_FACTORS: Record<string, number> = {
  g: 1,
  kg: 1000,
  lb: 453.592,
  lbs: 453.592,
  oz: 28.3495,
};

const VOLUME_FACTORS: Record<string, number> = {
  ml: 1,
  l: 1000,
  "fl oz": 29.5735,
  gal: 3785.41,
  tsp: 4.92892,
  tbsp: 14.7868,
  cup: 236.588,
};

function norm(unit: string): string {
  return unit.trim().toLowerCase();
}

export function getUnitFamily(unit: string): UnitFamily {
  const n = norm(unit);
  if (WEIGHT_FACTORS[n] !== undefined) return "weight";
  if (VOLUME_FACTORS[n] !== undefined) return "volume";
  return "count";
}

/** Convert value to the family base unit (g for weight, ml for volume, unchanged for count). */
export function convertToBase(value: number, unit: string): number {
  const n = norm(unit);
  const wf = WEIGHT_FACTORS[n];
  if (wf !== undefined) return value * wf;
  const vf = VOLUME_FACTORS[n];
  if (vf !== undefined) return value * vf;
  return value;
}

/** Convert from family base unit back to target unit. */
export function convertFromBase(value: number, targetUnit: string): number {
  const n = norm(targetUnit);
  const wf = WEIGHT_FACTORS[n];
  if (wf !== undefined) return value / wf;
  const vf = VOLUME_FACTORS[n];
  if (vf !== undefined) return value / vf;
  return value;
}

export interface ConvertResult {
  result: number;
  possible: boolean;
  reason?: string;
}

export function convertUnit(
  value: number,
  fromUnit: string,
  toUnit: string
): ConvertResult {
  if (norm(fromUnit) === norm(toUnit)) {
    return { result: value, possible: true };
  }

  const fromFamily = getUnitFamily(fromUnit);
  const toFamily = getUnitFamily(toUnit);

  if (fromFamily !== toFamily) {
    return {
      result: 0,
      possible: false,
      reason: `Unit family mismatch: cannot convert ${fromUnit} to ${toUnit}`,
    };
  }

  if (fromFamily === "count") {
    return {
      result: 0,
      possible: false,
      reason: `Different count units: ${fromUnit} vs ${toUnit}`,
    };
  }

  const baseValue = convertToBase(value, fromUnit);
  const result = convertFromBase(baseValue, toUnit);
  return { result, possible: true };
}

export interface AggregateResult {
  total: number;
  possible: boolean;
  mismatches: string[];
}

/**
 * Converts each contribution to standardUnit and sums them.
 * Contributions whose unit family doesn't match are collected in mismatches[].
 */
export function aggregateInStandardUnit(
  contributions: Array<{ quantity: number; unit: string }>,
  standardUnit: string
): AggregateResult {
  let total = 0;
  const mismatches: string[] = [];

  for (const c of contributions) {
    const conv = convertUnit(c.quantity, c.unit, standardUnit);
    if (conv.possible) {
      total += conv.result;
    } else {
      mismatches.push(c.unit);
    }
  }

  return { total, possible: mismatches.length === 0, mismatches };
}
