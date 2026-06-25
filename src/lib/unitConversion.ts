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

function toBase(value: number, unit: string): number {
  const n = norm(unit);
  const wf = WEIGHT_FACTORS[n];
  if (wf !== undefined) return value * wf;
  const vf = VOLUME_FACTORS[n];
  if (vf !== undefined) return value * vf;
  return value;
}

function fromBase(value: number, targetUnit: string): number {
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

  const baseValue = toBase(value, fromUnit);
  const result = fromBase(baseValue, toUnit);
  return { result, possible: true };
}
