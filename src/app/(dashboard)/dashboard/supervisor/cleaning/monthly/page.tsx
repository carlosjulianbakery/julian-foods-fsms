"use client";

import { useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, ChevronDown, ChevronUp, AlertCircle, CalendarCheck,
  MessageSquare, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toUpperCaseInput } from "@/lib/formatters";
import { DateInput } from "@/components/DateInput";

// ─── Checklist Data ───────────────────────────────────────────────────────────

const MONTHLY_GROUPS = [
  {
    id: "storage_infra",
    label: "Storage & Infrastructure",
    items: [
      { id: "si_dry_storage",      label: "Dry Ingredient Storage Shelving — Wiped Down & Organized" },
      { id: "si_cold_storage",     label: "Refrigerator / Cold Storage Interior — Deep Cleaned" },
      { id: "si_freezer",          label: "Freezer Interior & Door Seals — Cleaned & Inspected" },
      { id: "si_packaging_area",   label: "Packaging Materials Storage Area — Swept & Organized" },
      { id: "si_chemical_cabinet", label: "Chemical / Cleaning Supplies Cabinet — Checked & Restocked" },
      { id: "si_loading_dock",     label: "Loading / Receiving Area — Swept & Sanitized" },
      { id: "si_ceiling_vents",    label: "Ceiling Vents & Air Return Covers — Dusted or Replaced" },
      { id: "si_light_fixtures",   label: "Light Fixtures & Covers — Cleaned" },
      { id: "si_wall_panels",      label: "Wall Panels & Corners — Scrubbed" },
      { id: "si_door_frames",      label: "Door Frames & Entry Points — Wiped Down" },
      { id: "si_overhead_pipes",   label: "Overhead Pipes & Conduits (exterior) — Dusted" },
      { id: "si_pest_check",       label: "Pest Entry Points Inspection — Gaps & Seals Checked" },
    ],
  },
  {
    id: "deep_clean",
    label: "Deep Clean — Equipment",
    items: [
      { id: "dc_oven_deep",    label: "Oven(s) — Full Deep Clean (interior walls, racks, drip pans)" },
      { id: "dc_mixer_deep",   label: "Mixer(s) — Deep Clean (gears, base, motor housing)" },
      { id: "dc_granola_deep", label: "Granola Packaging Machine — Full Disassembly Clean" },
    ],
  },
  {
    id: "facility_surfaces",
    label: "Facility Surfaces",
    items: [
      { id: "fs_floors_grout", label: "Floor Grout Lines Scrubbed" },
      { id: "fs_walls_full",   label: "Walls — Full Height Wash & Sanitize" },
      { id: "fs_drains_deep",  label: "Floor Drains — Deep Clean & Deodorize" },
      { id: "fs_work_tables",  label: "Work Tables — Underside & Legs Cleaned" },
    ],
  },
  {
    id: "monthly_checks",
    label: "Monthly Checks",
    items: [
      { id: "mc_sanitizer_verify",  label: "Sanitizer Concentration Log Reviewed & Verified" },
      { id: "mc_pest_log",          label: "Pest Control Log Reviewed & Signed" },
      { id: "mc_equipment_inspect", label: "Equipment Condition Inspection Complete" },
    ],
  },
] as const;

type GroupId = (typeof MONTHLY_GROUPS)[number]["id"];
type ItemId  = string;

interface ChecklistItemState {
  id:      ItemId;
  label:   string;
  group:   GroupId;
  checked: boolean;
  notes:   string;
}

function buildInitialItems(): ChecklistItemState[] {
  return MONTHLY_GROUPS.flatMap((g) =>
    g.items.map((item) => ({
      id:      item.id,
      label:   item.label,
      group:   g.id as GroupId,
      checked: false,
      notes:   "",
    }))
  );
}

// ─── Instruction Card ─────────────────────────────────────────────────────────

function InstructionCard({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-amber-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 hover:bg-amber-100 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-amber-900 font-mono">{title}</span>
        {open
          ? <ChevronUp className="w-4 h-4 text-amber-600 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-amber-600 shrink-0" />
        }
      </button>
      {open && (
        <div className="bg-amber-50/50 px-5 py-4 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}

function InstructionSection({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold text-amber-800 font-mono uppercase tracking-wider mb-2">{title}</p>
      <ol className="space-y-2">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3 text-sm text-amber-900">
            <span className="shrink-0 w-5 h-5 rounded-full bg-amber-200 text-amber-800 text-xs font-bold flex items-center justify-center mt-0.5 font-mono">
              {i + 1}
            </span>
            <span className="leading-relaxed">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─── Instruction Content ──────────────────────────────────────────────────────

const FOOD_SURFACES_EN = [
  "Scrape or remove food particles from the surface. Use an undamaged plastic or metal scraper or a clean cloth.",
  "Wash the surface. Prepare cleaning solution: Uline dish soap — 90% soap, 10% water. Use the green cleaning bucket. Wash with a clean cloth.",
  "Rinse the surface. Use clean water and the clean blue bucket. Rinse thoroughly with a clean cloth.",
  "Dry the surface. Use disposable paper towels or a clean cloth.",
  "Sanitize the surface. Prepare sanitizing solution: Uline Germicidal Bleach — 1 tablespoon bleach per 1 gallon water. Use red bucket. Verify concentration with a Chlorine Test Strip: minimum 200 PPM. Remake if not compliant. Transfer to spray bottle and spray all food-contact areas.",
  "Allow the surface to air dry.",
];
const FOOD_SURFACES_ES = [
  "Raspar o remover partículas de comida de la superficie. Utilice una espátula de plástico o metal sin daños o un paño limpio.",
  "Lavar la superficie. Prepare solución: jabón Uline — 90% jabón, 10% agua. Use el balde verde. Lave con un paño limpio.",
  "Enjuagar la superficie. Use agua limpia y el balde azul limpio. Enjuague bien con un paño limpio.",
  "Secar la superficie. Use toallas de papel desechables o un paño limpio.",
  "Sanitizar la superficie. Prepare solución: Blanqueador Germicida Uline — 15 gr por 1 galón de agua. Use balde rojo. Verifique concentración con tira de prueba de cloro: mínimo 200 PPM. Si no cumple, prepare nueva solución. Transfiera a rociador y rocíe todas las áreas de contacto con alimentos.",
  "Deje secar al aire.",
];
const EQUIPMENT_EN = [
  "Turn off and unplug equipment.",
  "Disassemble removable parts. Place small parts in a clean container for washing.",
  "Scrape or remove food particles from all surfaces.",
  "Wash all parts and equipment surfaces. Prepare cleaning solution: Uline dish soap — at least 4/10 oz soap per 1 gallon water. Use the green cleaning bucket.",
  "Rinse all parts and surfaces. Use clean water and the clean blue bucket.",
  "Dry with a clean cloth. Use Mission Linen cloth or disposable paper towels.",
  "Sanitize all parts and surfaces. Uline Germicidal Bleach: 1 tbsp per 1 gallon water in a spray bottle. Verify minimum 200 PPM.",
  "Allow to air dry completely. Place parts on a clean sanitized rack. Do not towel-dry.",
  "Reassemble the equipment once fully dry.",
];
const EQUIPMENT_ES = [
  "Apagar y desenchufar el equipo.",
  "Desarmar las partes removibles. Coloque las piezas pequeñas en un recipiente limpio.",
  "Raspar o remover residuos de comida de todas las superficies.",
  "Lavar todas las partes y superficies. Solución: jabón Uline — al menos 4/10 oz por 1 galón. Use balde verde.",
  "Enjuagar todas las partes. Use agua limpia y balde azul limpio.",
  "Secar con paño limpio. Use paño de Mission Linen o toallas desechables.",
  "Sanitizar. Blanqueador Uline: 1 cucharada por 1 galón en rociador. Verifique mínimo 200 PPM.",
  "Dejar secar al aire. Coloque piezas en rejilla limpia. No secar con toalla.",
  "Reensamblar el equipo una vez seco.",
];
const FLOORS_WALLS_EN = [
  "Remove all movable equipment and obstacles from the area before beginning.",
  "Sweep or vacuum loose debris from floors. Pay close attention to corners, under equipment, and behind shelving units.",
  "Apply cleaning solution (Uline dish soap — 90% soap, 10% water) to floors and walls. Scrub vigorously from top to bottom for walls; work outward from center for floors.",
  "Rinse thoroughly with clean water using the clean blue bucket. Remove all soap residue.",
  "Apply sanitizing solution (Uline Germicidal Bleach — 1 tbsp per 1 gallon water). Verify minimum 200 PPM. Apply to all surfaces including coves and corners.",
  "Allow surfaces to air dry completely. Do not allow foot traffic until floors are fully dry.",
  "Return equipment to its original position only once the area is completely dry.",
];
const FLOORS_WALLS_ES = [
  "Retirar todo el equipo movible y obstáculos del área antes de comenzar.",
  "Barrer o aspirar residuos sueltos del piso. Prestar especial atención a esquinas, debajo del equipo y detrás de estantes.",
  "Aplicar solución limpiadora en pisos y paredes. Fregar vigorosamente de arriba hacia abajo en paredes; trabajar del centro hacia afuera en pisos.",
  "Enjuagar bien con agua limpia usando el balde azul. Retirar todo el residuo de jabón.",
  "Aplicar solución sanitizante. Verificar mínimo 200 PPM. Aplicar en todas las superficies incluyendo zócalos y esquinas.",
  "Dejar secar al aire completamente. No permitir tráfico de personas hasta que los pisos estén completamente secos.",
  "Devolver el equipo a su posición original solo cuando el área esté completamente seca.",
];

// ─── Group Progress Bar ───────────────────────────────────────────────────────

function GroupProgress({ items }: { items: ChecklistItemState[] }) {
  const total   = items.length;
  const checked = items.filter((it) => it.checked).length;
  if (total === 0) return null;
  const pct = Math.round((checked / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 rounded-full h-1.5 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            pct === 100 ? "bg-emerald-500" : pct > 0 ? "bg-amber-400" : "bg-gray-300"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn(
        "text-xs font-mono font-semibold shrink-0",
        pct === 100 ? "text-emerald-600" : pct > 0 ? "text-amber-600" : "text-gray-400"
      )}>
        {checked}/{total}
      </span>
    </div>
  );
}

// ─── Checklist Item Row ───────────────────────────────────────────────────────

function ChecklistItemRow({
  item, onToggle, onNoteChange,
}: { item: ChecklistItemState; onToggle: (id: ItemId) => void; onNoteChange: (id: ItemId, val: string) => void }) {
  const [showNote, setShowNote] = useState(!!item.notes);
  return (
    <div className={cn("border-b border-gray-100 last:border-0 transition-colors", item.checked ? "bg-emerald-50/40" : "")}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => onToggle(item.id)}
          className={cn(
            "w-7 h-7 rounded-md border-2 flex items-center justify-center shrink-0 transition-all",
            item.checked ? "bg-emerald-500 border-emerald-500" : "bg-white border-gray-300 hover:border-emerald-400"
          )}
        >
          {item.checked && <CheckCircle2 className="w-4 h-4 text-white" />}
        </button>
        <span className={cn("flex-1 text-sm leading-snug", item.checked ? "text-emerald-800 font-medium" : "text-gray-700")}>
          {item.label}
        </span>
        <button
          type="button"
          title={showNote ? "Hide note" : "Add note"}
          onClick={() => setShowNote((v) => !v)}
          className={cn(
            "p-1.5 rounded transition-colors shrink-0",
            item.notes ? "text-blue-500 bg-blue-50" : showNote ? "text-gray-600 bg-gray-100" : "text-gray-300 hover:text-gray-500 hover:bg-gray-100"
          )}
        >
          <MessageSquare className="w-3.5 h-3.5" />
        </button>
      </div>
      {showNote && (
        <div className="px-4 pb-3 flex items-start gap-3">
          <div className="w-7 shrink-0" />
          <div className="flex-1 relative">
            <textarea
              rows={2}
              className="input resize-none text-xs py-1.5 pr-6"
              placeholder="Note for this item…"
              value={item.notes}
              onChange={(e) => onNoteChange(item.id, e.target.value)}
            />
            {item.notes && (
              <button type="button" onClick={() => onNoteChange(item.id, "")} className="absolute top-1.5 right-1.5 text-gray-400 hover:text-gray-600">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Group Card ───────────────────────────────────────────────────────────────

function GroupCard({
  group, items, onToggle, onNoteChange,
}: {
  group: (typeof MONTHLY_GROUPS)[number];
  items: ChecklistItemState[];
  onToggle: (id: ItemId) => void;
  onNoteChange: (id: ItemId, val: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const allDone = items.every((it) => it.checked);

  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left border-b border-gray-100"
      >
        <span className={cn("flex-1 text-sm font-semibold font-mono", allDone ? "text-emerald-700" : "text-gray-700")}>
          {group.label}
        </span>
        <div className="flex-1 max-w-[160px]">
          <GroupProgress items={items} />
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
      </button>
      {open && (
        <div>
          {items.map((item) => (
            <ChecklistItemRow key={item.id} item={item} onToggle={onToggle} onNoteChange={onNoteChange} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Form ────────────────────────────────────────────────────────────────

const todayYMD = () => new Date().toISOString().split("T")[0];

export default function MonthlyCleaningPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [date, setDate]           = useState(todayYMD());
  const [items, setItems]         = useState<ChecklistItemState[]>(buildInitialItems);
  const [notes, setNotes]         = useState("");
  const [checkedBy, setCheckedBy] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState("");

  if (!checkedBy && session?.user?.name) setCheckedBy(session.user.name);

  const toggleItem = useCallback((id: ItemId) => {
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, checked: !it.checked } : it));
  }, []);

  const setItemNote = useCallback((id: ItemId, val: string) => {
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, notes: val } : it));
  }, []);

  const totalItems   = items.length;
  const checkedCount = items.filter((it) => it.checked).length;
  const allChecked   = checkedCount === totalItems;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!date) { setError("Please select a date."); return; }
    if (!checkedBy.trim()) { setError("Please enter who checked."); return; }

    setSubmitting(true);
    try {
      const payload = {
        date,
        items: items.map(({ id, label, group, checked, notes: n }) => ({ id, label, group, checked, notes: n })),
        checkedBy: checkedBy.trim(),
        notes,
      };
      const res = await fetch("/api/cleaning/monthly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      router.push("/dashboard/supervisor/cleaning/monthly/records");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#D64D4D] rounded-md flex items-center justify-center shrink-0">
            <CalendarCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="page-title leading-tight">Monthly Cleaning Checklist</h1>
            <p className="page-subtitle">Julian Bakery Food Safety Management</p>
          </div>
        </div>
        <button
          onClick={() => router.push("/dashboard/supervisor/cleaning/monthly/records")}
          type="button"
          className="btn-secondary"
        >
          View Records
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Date */}
        <div className="card p-5">
          <label className="label">Date <span className="text-[#D64D4D]">*</span></label>
          <DateInput className="input" value={date} onChange={setDate} />
        </div>

        {/* Progress summary */}
        <div className="card p-4 flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider">Overall Progress</span>
              <span className={cn(
                "text-xs font-mono font-bold",
                allChecked ? "text-emerald-600" : checkedCount > 0 ? "text-amber-600" : "text-gray-400"
              )}>
                {checkedCount}/{totalItems} items
              </span>
            </div>
            <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  allChecked ? "bg-emerald-500" : checkedCount > 0 ? "bg-amber-400" : "bg-gray-300"
                )}
                style={{ width: `${Math.round((checkedCount / totalItems) * 100)}%` }}
              />
            </div>
          </div>
          {allChecked && (
            <div className="flex items-center gap-1.5 text-emerald-600 font-mono text-xs font-semibold shrink-0">
              <CheckCircle2 className="w-4 h-4" /> All Done!
            </div>
          )}
        </div>

        {/* Group cards */}
        {MONTHLY_GROUPS.map((group) => {
          const groupItems = items.filter((it) => it.group === group.id);
          return (
            <GroupCard key={group.id} group={group} items={groupItems} onToggle={toggleItem} onNoteChange={setItemNote} />
          );
        })}

        {/* Instruction Cards */}
        <div className="space-y-3">
          <p className="text-xs font-mono font-semibold text-gray-400 uppercase tracking-wider">
            Cleaning Instructions (Reference Only)
          </p>
          <InstructionCard title="Food Contact Surfaces — Cleaning Instructions (D1.2.a)">
            <InstructionSection title="English" steps={FOOD_SURFACES_EN} />
            <hr className="border-amber-200 my-3" />
            <InstructionSection title="Español" steps={FOOD_SURFACES_ES} />
          </InstructionCard>
          <InstructionCard title="Equipment and Utensils — Cleaning Instructions (D1.2.b)">
            <InstructionSection title="English" steps={EQUIPMENT_EN} />
            <hr className="border-amber-200 my-3" />
            <InstructionSection title="Español" steps={EQUIPMENT_ES} />
          </InstructionCard>
          <InstructionCard title="Floors, Walls & Structures — Cleaning Instructions (D1.2.c)">
            <InstructionSection title="English" steps={FLOORS_WALLS_EN} />
            <hr className="border-amber-200 my-3" />
            <InstructionSection title="Español" steps={FLOORS_WALLS_ES} />
          </InstructionCard>
        </div>

        {/* Notes + Checked By */}
        <div className="card p-5 space-y-4">
          <div>
            <label className="label">Notes</label>
            <textarea
              className="input resize-none h-20"
              placeholder="Any observations or issues to report…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Checked By <span className="text-[#D64D4D]">*</span></label>
            <input
              type="text"
              className="input"
              placeholder="Full name"
              value={checkedBy}
              onChange={(e) => setCheckedBy(toUpperCaseInput(e.target.value))}
            />
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-[#D64D4D] text-sm font-mono bg-red-50 border border-red-200 rounded-md px-4 py-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full btn-primary py-3 text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Submitting…
            </>
          ) : (
            "Submit Monthly Cleaning Checklist"
          )}
        </button>
      </form>
    </div>
  );
}
