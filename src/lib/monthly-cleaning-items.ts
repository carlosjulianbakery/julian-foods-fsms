export type CleaningArea = "production" | "shipping" | "office";

export interface CleaningItem {
  area: CleaningArea;
  itemName: string;
  checked: boolean;
  checkedBy: string | null;
  checkedDate: string | null; // MM/DD/YYYY
  notes: string | null;
}

export interface AreaProgress {
  total: number;
  checked: number;
}

export interface DraftProgress {
  production: AreaProgress;
  shipping: AreaProgress;
  office: AreaProgress;
  overall: AreaProgress;
}

const PRODUCTION_ITEMS = [
  "Production Ceiling",
  "Production Area Walls",
  "Non-Pickable Area Floor",
  "Trays",
  "Oven Carts",
  "Oven Interiors",
  "Cooling Fans",
  "Utensil Racks",
  "Material's Rack A",
  "Material's Rack B",
  "Material's Rack C",
  "Material's Rack D",
  "Organic Material's Rack Q",
  "Organic Material's Rack P",
  "Organic Material's Rack X",
  "Walk-In Cooler",
  "Extinguishers",
  "Powder Room",
  "Break Room",
];

const SHIPPING_ITEMS = [
  "Maintenance Area Floors",
  "Shipping Floors",
  "Walk-In Freezer",
  "Roll Up Doors",
  "Distribution Ceiling",
  "Distribution Walls",
  "Distribution Racks",
  "Exterior Perimeters",
];

const OFFICE_ITEMS = ["Desks", "Floors", "Gym"];

export function initializeCleaningItems(): CleaningItem[] {
  return [
    ...PRODUCTION_ITEMS.map((n) => ({
      area: "production" as CleaningArea,
      itemName: n,
      checked: false,
      checkedBy: null,
      checkedDate: null,
      notes: null,
    })),
    ...SHIPPING_ITEMS.map((n) => ({
      area: "shipping" as CleaningArea,
      itemName: n,
      checked: false,
      checkedBy: null,
      checkedDate: null,
      notes: null,
    })),
    ...OFFICE_ITEMS.map((n) => ({
      area: "office" as CleaningArea,
      itemName: n,
      checked: false,
      checkedBy: null,
      checkedDate: null,
      notes: null,
    })),
  ];
}

export function computeProgress(items: unknown): DraftProgress {
  const arr = Array.isArray(items) ? (items as CleaningItem[]) : [];
  const byArea = (area: CleaningArea) => arr.filter((i) => i.area === area);
  const prog = (area: CleaningArea): AreaProgress => {
    const a = byArea(area);
    return { total: a.length, checked: a.filter((i) => i.checked).length };
  };
  const all = { total: arr.length, checked: arr.filter((i) => i.checked).length };
  return {
    production: prog("production"),
    shipping: prog("shipping"),
    office: prog("office"),
    overall: all,
  };
}

export function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function nextMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}
