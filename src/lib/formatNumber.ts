/**
 * Format a number for display: max 2 decimal places, no trailing zeros,
 * thousands separator. Internal calculations always use raw full-precision
 * numbers — this function is for DISPLAY only.
 *
 * Examples:
 *   formatQty(123.456) → "123.46"
 *   formatQty(123.1)   → "123.1"
 *   formatQty(123)     → "123"
 *   formatQty(1234.5)  → "1,234.5"
 *   formatQty(0.5)     → "0.5"
 *   formatQty(null)    → "—"
 */
export function formatQty(
  value: number | null | undefined,
  fallback = "—"
): string {
  if (value === null || value === undefined || isNaN(value)) return fallback;
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Format a quantity with its unit.
 *   formatQtyUnit(45.5, "lb")  → "45.5 lb"
 *   formatQtyUnit(123, "g")    → "123 g"
 *   formatQtyUnit(null, "lb")  → "— lb"
 */
export function formatQtyUnit(
  value: number | null | undefined,
  unit: string | null | undefined,
  fallback = "—"
): string {
  const formatted = formatQty(value, fallback);
  if (!unit) return formatted;
  return `${formatted} ${unit}`;
}

/**
 * Format a surplus or shortfall with + or − sign.
 *   formatDelta(15.5, "lb")  → "+15.5 lb"
 *   formatDelta(-833, "lb")  → "-833 lb"
 *   formatDelta(0, "lb")     → "0 lb"
 */
export function formatDelta(
  value: number | null | undefined,
  unit: string | null | undefined,
  fallback = "—"
): string {
  if (value === null || value === undefined || isNaN(value)) return fallback;
  const formatted = formatQtyUnit(Math.abs(value), unit);
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

/**
 * Format a whole-number count with thousands separator.
 *   formatCount(1234) → "1,234"
 *   formatCount(7)    → "7"
 */
export function formatCount(
  value: number | null | undefined,
  fallback = "—"
): string {
  if (value === null || value === undefined || isNaN(value)) return fallback;
  return Math.round(value).toLocaleString("en-US");
}
