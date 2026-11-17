// Configuration for Daily Cleaning — 624 form.
// All text constants live here so a wording change is a one-line edit.

export const INSTRUCTIONS_VER = "v1.0";

export const INSTRUCTIONS_TEXT =
  "Cleaning and Sanitation activities must be completed at least at the predetermined frequency. " +
  "If an allergen change occurs on the same day, it must be registered in the Allergen Changeover Form. " +
  "Chemicals used for Food Contact Surfaces are Uline Dish Soap S-25783 (4/10 oz per gallon of water), " +
  "and Uline Germicidal Bleach S-19457 (1 tbsp per gallon of water or 200/400 ppm). " +
  "Cristal Simple Green Industrial Cleaner and Degreaser is used in Non-Food Contact Surfaces. " +
  "Multi Surface Cleaner Pine-Sol is used inside the facility for floors.";

export interface Activity {
  key: string;
  en: string;
  es: string;
}

// 19 activities in paper form order.
// Note: "Contenedores de Ingredientes" is the corrected spelling;
// the paper form has the typo "Contendores de Ingredientes".
export const ACTIVITIES: Activity[] = [
  { key: "mixing_bowls",          en: "Mixing Bowls",               es: "Ollas para mezclar" },
  { key: "utensils",              en: "Utensils",                   es: "Utensilios" },
  { key: "mixer_07",              en: "Mixer 07",                   es: "Mezcladora" },
  { key: "mixer_08",              en: "Mixer 08",                   es: "Mezcladora" },
  { key: "ovens_exterior",        en: "Ovens (Exterior)",           es: "Ovens (Exterior)" },
  { key: "vmag_bowl_lift",        en: "Vmag (+ Bowl Lift)",         es: "Vmag (+ Bowl Lift)" },
  { key: "mono_depositor",        en: "Mono Depositor",             es: "Mono Depositor" },
  { key: "unifiller_depositor",   en: "Unifiller Depositor",        es: "Unifiller Depositor" },
  { key: "flowrapper",            en: "Flowrapper",                 es: "Flowrapper" },
  { key: "bread_slicer",          en: "Bread Slicer",               es: "Bread Slicer" },
  { key: "bun_slicer",            en: "Bun Slicer",                 es: "Bun Slicer" },
  { key: "food_processor",        en: "Food Processor",             es: "Food Processor" },
  { key: "scale",                 en: "Scale",                      es: "Basculas" },
  { key: "ingredient_containers", en: "Ingredient Containers",      es: "Contenedores de Ingredientes" },
  { key: "floor",                 en: "Floor",                      es: "Floor" },
  { key: "drains",                en: "Drains",                     es: "Drains" },
  { key: "walls",                 en: "Walls",                      es: "Walls" },
  { key: "walk_in_doors",         en: "Walk in doors and handles",  es: "Walk in doors and handles" },
  { key: "production_doors",      en: "Production Doors",           es: "Production Doors" },
];

export const CHEM_FOOD_CONTACT = "Uline Dish Soap + Germicidal Bleach";
export const CHEM_SIMPLE_GREEN = "Simple Green";
export const CHEM_PINE_SOL     = "Pine-Sol";

export const CHEMICAL_MAP: Record<string, string> = {
  mixing_bowls:          CHEM_FOOD_CONTACT,
  utensils:              CHEM_FOOD_CONTACT,
  mixer_07:              CHEM_FOOD_CONTACT,
  mixer_08:              CHEM_FOOD_CONTACT,
  ovens_exterior:        CHEM_SIMPLE_GREEN,
  vmag_bowl_lift:        CHEM_FOOD_CONTACT,
  mono_depositor:        CHEM_FOOD_CONTACT,
  unifiller_depositor:   CHEM_FOOD_CONTACT,
  flowrapper:            CHEM_FOOD_CONTACT,
  bread_slicer:          CHEM_FOOD_CONTACT,
  bun_slicer:            CHEM_FOOD_CONTACT,
  food_processor:        CHEM_FOOD_CONTACT,
  scale:                 CHEM_FOOD_CONTACT,
  ingredient_containers: CHEM_FOOD_CONTACT,
  floor:                 CHEM_PINE_SOL,
  drains:                CHEM_SIMPLE_GREEN,
  walls:                 CHEM_SIMPLE_GREEN,
  walk_in_doors:         CHEM_SIMPLE_GREEN,
  production_doors:      CHEM_SIMPLE_GREEN,
};
