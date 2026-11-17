// Configuration for Monthly Cleaning — 624 form.
// Do NOT copy from or reference the Daily Cleaning 624 config.

export const INSTRUCTIONS_VER_MONTHLY = "v1.0";

export const INSTRUCTIONS_TEXT_MONTHLY =
  "Cleaning and Sanitation activities must be completed at least at the predetermined frequency. " +
  "Use one form for the whole month. " +
  "Chemicals used for Food Contact Surfaces are Uline Dish Soap S-25783 (0.2 oz per gallon of water), " +
  "and Uline Germicidal Bleach S-19457 (1 tbsp per gallon of water or 200/400 ppm). " +
  "Cristal Simple Green Industrial Cleaner and Degreaser is used in Non-Food Contact Surfaces. " +
  "Multi Surface Cleaner Pine-Sol is used inside the facility for floors.";

export interface MonthlyActivity {
  key: string;
  en: string;
  es: string;
}

export const MONTHLY_ACTIVITIES: MonthlyActivity[] = [
  { key: "trays",              en: "Trays",                                                                            es: "Charolas" },
  { key: "bread_racks",        en: "Bread Racks",                                                                      es: "Racks para pan" },
  { key: "oven_carts",         en: "Oven Carts",                                                                       es: "Carritos para Horno" },
  { key: "oven_interiors",     en: "Oven Interiors",                                                                   es: "Interior de Hornos" },
  { key: "cooling_fans",       en: "Cooling Fans (x 3)",                                                               es: "Cooling Fans (x 3)" },
  { key: "zip_tie_machines",   en: "Zip Tie Machines (x 2)",                                                           es: "Zip Tie Machines (x 2)" },
  { key: "walk_in_cooler",     en: "Walk-In Cooler: Floor, Walls, Fan Panel (inc. filter), Lights, Handle, Door, Floor Drain outside cooler", es: "Walk-In Cooler: Piso, Paredes, Panel del Ventilador (inc. filtro), Luces, Manija, Puerta, Desagüe fuera del cuarto frío" },
  { key: "production_ceiling", en: "Production Ceiling",                                                               es: "Techo en Producción" },
  { key: "utensil_racks",      en: "Utensil Racks",                                                                    es: "Estante de Utensilios Cocina" },
  { key: "ingredient_racks",   en: "Ingredient Racks (Warehouse)",                                                     es: "Rack de Ingredientes" },
  { key: "warehouse_doors",    en: "Warehouse Doors",                                                                  es: "Warehouse Doors" },
  { key: "warehouse_walls",    en: "Warehouse Walls",                                                                  es: "Warehouse Walls" },
  { key: "roll_up_door",       en: "Roll Up Door (Warehouse)",                                                         es: "Puerta Roll Up" },
  { key: "office_space",       en: "Office Space (inc. Breakroom)",                                                    es: "Oficinas (incluyendo Comedor)" },
  { key: "outside_break_area", en: "Outside Break Area (revisar que no haya basura ni cigarros en el area)",           es: "Outside Break Area (revisar que no haya basura ni cigarros en el area)" },
  { key: "extinguisher",       en: "Extinguisher",                                                                     es: "Extinguidores" },
  { key: "warehouse_ceiling",  en: "Warehouse Ceiling",                                                                es: "Warehouse Ceiling" },
  { key: "hawaiian_curtain",   en: "Hawaiian Curtain",                                                                 es: "Cortina Hawaiana" },
  { key: "freezer_floor",      en: "Freezer Floor (3021 Industry St)",                                                 es: "Piso de Congelador" },
];

export const MONTHLY_CHEM_FOOD_CONTACT = "Uline Dish Soap + Germicidal Bleach";
export const MONTHLY_CHEM_SIMPLE_GREEN  = "Simple Green";
export const MONTHLY_CHEM_PINE_SOL      = "Pine-Sol";

// items 1,2,3,9 = food contact; 4-8,10-14,17,18 = simple green; 19 = pine-sol; 15,16 = none
export const MONTHLY_CHEMICAL_MAP: Record<string, string> = {
  trays:              MONTHLY_CHEM_FOOD_CONTACT,
  bread_racks:        MONTHLY_CHEM_FOOD_CONTACT,
  oven_carts:         MONTHLY_CHEM_FOOD_CONTACT,
  oven_interiors:     MONTHLY_CHEM_SIMPLE_GREEN,
  cooling_fans:       MONTHLY_CHEM_SIMPLE_GREEN,
  zip_tie_machines:   MONTHLY_CHEM_SIMPLE_GREEN,
  walk_in_cooler:     MONTHLY_CHEM_SIMPLE_GREEN,
  production_ceiling: MONTHLY_CHEM_SIMPLE_GREEN,
  utensil_racks:      MONTHLY_CHEM_FOOD_CONTACT,
  ingredient_racks:   MONTHLY_CHEM_SIMPLE_GREEN,
  warehouse_doors:    MONTHLY_CHEM_SIMPLE_GREEN,
  warehouse_walls:    MONTHLY_CHEM_SIMPLE_GREEN,
  roll_up_door:       MONTHLY_CHEM_SIMPLE_GREEN,
  office_space:       MONTHLY_CHEM_SIMPLE_GREEN,
  // outside_break_area: no chemical
  // extinguisher: no chemical
  warehouse_ceiling:  MONTHLY_CHEM_SIMPLE_GREEN,
  hawaiian_curtain:   MONTHLY_CHEM_SIMPLE_GREEN,
  freezer_floor:      MONTHLY_CHEM_PINE_SOL,
};
