"use client";

import { useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, ChevronDown, ChevronUp, AlertCircle, ClipboardList,
  MessageSquare, X, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toUpperCaseInput } from "@/lib/formatters";
import { DateInput } from "@/components/DateInput";

// ─── Area / Section / Item Data ───────────────────────────────────────────────

interface AreaItem    { id: string; label: string }
interface AreaSection { label: string | null; items: AreaItem[] }
interface Area        { id: string; label: string; sections: AreaSection[] }

const AREAS: Area[] = [
  {
    id: "granola_production",
    label: "Granola Production Day",
    sections: [
      { label: "Prep Tools", items: [
        { id: "g_chisels",        label: "Chisels" },
        { id: "g_small_bowls",    label: "Small bowls" },
        { id: "g_scales",         label: "Scales" },
        { id: "g_scoops",         label: "Scoops" },
        { id: "g_buckets",        label: "Buckets" },
        { id: "g_mixing_bowls",   label: "Mixing bowls" },
        { id: "g_mixing_paddles", label: "Mixing paddles" },
        { id: "g_bucket_lids",    label: "Bucket lids" },
      ]},
      { label: "Machines", items: [
        { id: "g_mixer3", label: "Mixer 3" },
        { id: "g_mixer4", label: "Mixer 4" },
      ]},
      { label: "Work Surfaces", items: [
        { id: "g_work_tables", label: "Work tables (7)" },
      ]},
      { label: "Baking Equipment", items: [
        { id: "g_trays",        label: "Trays" },
        { id: "g_ovens_inside", label: "Ovens 1–5 — inside" },
        { id: "g_ovens_outside", label: "Ovens 1–5 — outside" },
      ]},
      { label: "Facility", items: [
        { id: "g_trash",       label: "Trash cans emptied" },
        { id: "g_syrup_nozzle", label: "Syrup tote removable nozzle" },
        { id: "g_handwash",    label: "Hand wash stations" },
        { id: "g_sanitizer",   label: "Sanitizer buckets/solution change" },
        { id: "g_floor_drains", label: "Floor drains" },
        { id: "g_floors",      label: "Floors swept and mopped" },
      ]},
    ],
  },
  {
    id: "progranola_packing",
    label: "ProGranola Packing Machine",
    sections: [
      { label: null, items: [
        { id: "pg_conveyor",   label: "Conveyor belt" },
        { id: "pg_hopper",     label: "Hopper" },
        { id: "pg_bay_feeder", label: "Bay feeder" },
      ]},
    ],
  },
  {
    id: "manual_packaging",
    label: "Manual ProGranola/Crackers Packaging",
    sections: [
      { label: "Tools", items: [
        { id: "mp_tables",     label: "Tables" },
        { id: "mp_scales",     label: "Scales" },
        { id: "mp_containers", label: "Plastic containers" },
        { id: "mp_scoops",     label: "Scoops" },
      ]},
      { label: "Sealing Equipment", items: [
        { id: "mp_actionpac",    label: "ActionPac sealer machine" },
        { id: "mp_foot_sealer",  label: "Foot sealer machine" },
      ]},
      { label: "Facility", items: [
        { id: "mp_handwash",  label: "Hand wash stations" },
        { id: "mp_sanitizer", label: "Sanitizer buckets/solution change" },
      ]},
    ],
  },
  {
    id: "bar_production",
    label: "Bar Production",
    sections: [
      { label: "Machines", items: [
        { id: "b_mixer",         label: "Mixer" },
        { id: "b_mixing_paddle", label: "Mixing paddle" },
        { id: "b_vemag",         label: "VeMag machine" },
      ]},
      { label: "Tools", items: [
        { id: "b_scissors", label: "Scissors" },
        { id: "b_chisels",  label: "Chisels" },
        { id: "b_buckets",  label: "Buckets" },
        { id: "b_scales",   label: "Scales" },
        { id: "b_bowls",    label: "Bowls" },
      ]},
      { label: "VeMag Removable Parts", items: [
        { id: "b_bar_cutter",  label: "Bar cutter" },
        { id: "b_conveyor",    label: "Conveyor" },
        { id: "b_twin_screws", label: "Twin screws" },
        { id: "b_t_spiral",    label: "T-spiral screws" },
      ]},
      { label: "Packaging", items: [
        { id: "b_pkg_table", label: "Packaging table" },
      ]},
      { label: "Facility", items: [
        { id: "b_tables",       label: "Tables" },
        { id: "b_syrup_nozzle", label: "Syrup tote nozzle" },
        { id: "b_trash",        label: "Trash cans emptied" },
        { id: "b_handwash",     label: "Hand wash stations" },
        { id: "b_sanitizer",    label: "Sanitizer buckets/solution change" },
        { id: "b_floor_drains", label: "Floor drains" },
        { id: "b_floors",       label: "Floors swept and mopped" },
      ]},
    ],
  },
  {
    id: "crackers_production",
    label: "Crackers Production Day",
    sections: [
      { label: "Machines", items: [
        { id: "c_sheeter", label: "Sheeter machine" },
        { id: "c_mixer",   label: "Mixer" },
      ]},
      { label: "Tools", items: [
        { id: "c_sheeter_parts",  label: "Sheeter parts" },
        { id: "c_trays",          label: "Trays" },
        { id: "c_baking_mats",    label: "Baking mats" },
        { id: "c_scrapers",       label: "Scrapers" },
        { id: "c_mixing_bowls",   label: "Mixing bowls" },
        { id: "c_mixing_paddle",  label: "Mixing paddle" },
        { id: "c_baking_trays",   label: "Baking trays" },
      ]},
      { label: "Baking Equipment", items: [
        { id: "c_ovens_inside",  label: "Ovens 1–5 — inside" },
        { id: "c_ovens_outside", label: "Ovens 1–5 — outside" },
      ]},
      { label: "Facility", items: [
        { id: "c_tables",        label: "Tables" },
        { id: "c_trash",         label: "Trash cans emptied" },
        { id: "c_handwash",      label: "Hand wash stations" },
        { id: "c_sanitizer",     label: "Sanitizer buckets/solution change" },
        { id: "c_floor_drains",  label: "Floor drains" },
        { id: "c_floors",        label: "Floors swept and mopped" },
      ]},
    ],
  },
];

// ─── Item State ───────────────────────────────────────────────────────────────

interface ChecklistItemState {
  id: string;
  label: string;
  areaId: string;
  sectionLabel: string | null;
  checked: boolean;
  notes: string;
}

function buildAllItems(): ChecklistItemState[] {
  return AREAS.flatMap((area) =>
    area.sections.flatMap((section) =>
      section.items.map((item) => ({
        id: item.id,
        label: item.label,
        areaId: area.id,
        sectionLabel: section.label,
        checked: false,
        notes: "",
      }))
    )
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
  "Scrape or remove food particles from all surfaces. Use an undamaged plastic or metal scraper or clean cloth.",
  "Wash all parts and equipment surfaces. Prepare cleaning solution: Uline dish soap — at least 4/10 oz soap per 1 gallon water. Use the green cleaning bucket. Wash each part and all food contact surfaces with a clean cloth.",
  "Rinse all parts and surfaces. Use clean water and the clean blue bucket. Rinse each food contact part thoroughly.",
  "Dry with a clean cloth. Use Mission Linen cloth or disposable paper towels.",
  "Sanitize all parts and surfaces. Uline Germicidal Bleach: 1 tbsp per 1 gallon water in a spray bottle. Verify minimum 200 PPM with Chlorine Test Strip. Spray all food-contact surfaces and parts.",
  "Allow to air dry completely. Place parts on a clean sanitized rack. Do not towel-dry.",
  "Reassemble the equipment once fully dry.",
];
const EQUIPMENT_ES = [
  "Apagar y desenchufar el equipo.",
  "Desarmar las partes removibles. Coloque las piezas pequeñas en un recipiente limpio.",
  "Raspar o remover residuos de comida de todas las superficies.",
  "Lavar todas las partes y superficies del equipo. Solución: jabón Uline — al menos 4/10 oz por 1 galón de agua. Use balde verde. Lave cada parte con un paño limpio.",
  "Enjuagar todas las partes y superficies. Use agua limpia y balde azul limpio.",
  "Secar con paño limpio. Use paño de Mission Linen o toallas desechables.",
  "Sanitizar todas las partes y superficies. Blanqueador Germicida Uline: 1 cucharada por 1 galón de agua en rociador. Verifique mínimo 200 PPM con tira de cloro. Rocíe todas las superficies y partes.",
  "Dejar secar al aire completamente. Coloque piezas en rejilla limpia. No secar con toalla.",
  "Reensamblar el equipo una vez seco.",
];
const FLOORS_WALLS_EN = [
  "Remove all movable equipment and obstacles from the area before beginning.",
  "Sweep or vacuum loose debris from floors. Pay close attention to corners, under equipment, and behind shelving units.",
  "Apply cleaning solution (Uline dish soap — 90% soap, 10% water) to floors and walls using a mop or scrub brush. Scrub vigorously from top to bottom for walls; work outward from center for floors.",
  "Rinse thoroughly with clean water using the clean blue bucket. Remove all soap residue from floors and lower walls.",
  "Apply sanitizing solution (Uline Germicidal Bleach — 1 tbsp per 1 gallon water). Verify minimum 200 PPM with a Chlorine Test Strip. Apply to all surfaces including coves and corners.",
  "Allow surfaces to air dry completely. Do not allow foot traffic until floors are fully dry.",
  "Return equipment to its original position only once the area is completely dry.",
];
const FLOORS_WALLS_ES = [
  "Retirar todo el equipo movible y obstáculos del área antes de comenzar.",
  "Barrer o aspirar residuos sueltos del piso. Prestar especial atención a esquinas, debajo del equipo y detrás de estantes.",
  "Aplicar solución limpiadora (jabón Uline — 90% jabón, 10% agua) en pisos y paredes usando trapeador o cepillo. Fregar vigorosamente de arriba hacia abajo en paredes; trabajar del centro hacia afuera en pisos.",
  "Enjuagar bien con agua limpia usando el balde azul. Retirar todo el residuo de jabón de pisos y paredes.",
  "Aplicar solución sanitizante (Blanqueador Germicida Uline — 1 cucharada por 1 galón de agua). Verificar mínimo 200 PPM con tira de cloro. Aplicar en todas las superficies incluyendo zócalos y esquinas.",
  "Dejar secar al aire completamente. No permitir tráfico de personas hasta que los pisos estén completamente secos.",
  "Devolver el equipo a su posición original solo cuando el área esté completamente seca.",
];

// ─── Checklist Item Row ───────────────────────────────────────────────────────

function ChecklistItemRow({
  item,
  onToggle,
  onNoteChange,
}: {
  item: { id: string; label: string; checked: boolean; notes: string };
  onToggle: (id: string) => void;
  onNoteChange: (id: string, val: string) => void;
}) {
  const [showNote, setShowNote] = useState(!!item.notes);

  return (
    <div className={cn(
      "border-b border-gray-100 last:border-0 transition-colors",
      item.checked ? "bg-emerald-50/40" : ""
    )}>
      <div className="flex items-center gap-3 px-4 py-3.5">
        {/* Checkbox */}
        <button
          type="button"
          onClick={() => onToggle(item.id)}
          className={cn(
            "w-7 h-7 rounded-md border-2 flex items-center justify-center shrink-0 transition-all",
            item.checked
              ? "bg-emerald-500 border-emerald-500"
              : "bg-white border-gray-300 hover:border-emerald-400"
          )}
        >
          {item.checked && <CheckCircle2 className="w-4 h-4 text-white" />}
        </button>

        {/* Label */}
        <span className={cn(
          "flex-1 text-sm leading-snug",
          item.checked ? "line-through text-emerald-700 font-medium" : "text-gray-700"
        )}>
          {item.label}
        </span>

        {/* Note toggle */}
        <button
          type="button"
          title={showNote ? "Hide note" : "Add note"}
          onClick={() => setShowNote((v) => !v)}
          className={cn(
            "p-1.5 rounded transition-colors shrink-0",
            item.notes
              ? "text-blue-500 bg-blue-50"
              : showNote
              ? "text-gray-600 bg-gray-100"
              : "text-gray-300 hover:text-gray-500 hover:bg-gray-100"
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
              <button
                type="button"
                onClick={() => onNoteChange(item.id, "")}
                className="absolute top-1.5 right-1.5 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Area Card ────────────────────────────────────────────────────────────────

function AreaCard({
  area,
  items,
  onToggle,
  onNoteChange,
}: {
  area: Area;
  items: ChecklistItemState[];
  onToggle: (id: string) => void;
  onNoteChange: (id: string, val: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const total   = items.length;
  const checked = items.filter((it) => it.checked).length;
  const allDone = total > 0 && checked === total;
  const pct     = total > 0 ? Math.round((checked / total) * 100) : 0;

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-4 transition-colors text-left border-b border-gray-100",
          allDone ? "bg-emerald-50 hover:bg-emerald-100" : "bg-gray-50 hover:bg-gray-100"
        )}
      >
        {allDone
          ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
          : <div className="w-5 h-5 shrink-0" />
        }

        <span className={cn(
          "flex-1 text-sm font-semibold",
          allDone ? "text-emerald-700" : "text-gray-800"
        )}>
          {area.label}
        </span>

        {/* Progress bar + count */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-20 bg-gray-200 rounded-full h-1.5 overflow-hidden hidden sm:block">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                pct === 100 ? "bg-emerald-500" : pct > 0 ? "bg-amber-400" : "bg-gray-300"
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className={cn(
            "text-xs font-mono font-semibold",
            pct === 100 ? "text-emerald-600" : pct > 0 ? "text-amber-600" : "text-gray-400"
          )}>
            {checked}/{total}
          </span>
        </div>

        {open
          ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        }
      </button>

      {/* Sections + Items */}
      {open && (
        <div>
          {area.sections.map((section, si) => {
            const sectionItems = items.filter((it) => it.sectionLabel === section.label);
            return (
              <div key={si}>
                {section.label && (
                  <div className="px-4 py-2 bg-gray-50/70 border-b border-gray-100">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {section.label}
                    </span>
                  </div>
                )}
                {sectionItems.map((item) => (
                  <ChecklistItemRow
                    key={item.id}
                    item={item}
                    onToggle={onToggle}
                    onNoteChange={onNoteChange}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Form ────────────────────────────────────────────────────────────────

const todayYMD = () => new Date().toISOString().split("T")[0];

export default function DailyCleaningPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [date, setDate]             = useState(todayYMD());
  const [selectedAreas, setSelectedAreas] = useState<Set<string>>(new Set());
  const [allItems, setAllItems]     = useState<ChecklistItemState[]>(buildAllItems);
  const [notes, setNotes]           = useState("");
  const [checkedBy, setCheckedBy]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState("");

  // Sync name from session
  if (!checkedBy && session?.user?.name) setCheckedBy(session.user.name);


  const toggleArea = useCallback((areaId: string) => {
    setSelectedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(areaId)) next.delete(areaId);
      else next.add(areaId);
      return next;
    });
  }, []);

  const toggleItem = useCallback((id: string) => {
    setAllItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, checked: !it.checked } : it))
    );
  }, []);

  const setItemNote = useCallback((id: string, val: string) => {
    setAllItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, notes: val } : it))
    );
  }, []);

  // Derived stats
  const selectedAreaList = AREAS.filter((a) => selectedAreas.has(a.id));
  const areaStats = selectedAreaList.map((area) => {
    const aItems  = allItems.filter((it) => it.areaId === area.id);
    const checked = aItems.filter((it) => it.checked).length;
    return { area, total: aItems.length, checked, allDone: aItems.length > 0 && checked === aItems.length };
  });
  const areasComplete     = areaStats.filter((s) => s.allDone).length;
  const totalSelectedAreas = selectedAreaList.length;
  const allAreasDone      = totalSelectedAreas > 0 && areasComplete === totalSelectedAreas;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!date)                  { setError("Please select a date."); return; }
    if (!checkedBy.trim())       { setError("Please enter who checked."); return; }
    if (selectedAreas.size === 0) { setError("Please select at least one production area."); return; }

    setSubmitting(true);
    try {
      const submittedItems = allItems
        .filter((it) => selectedAreas.has(it.areaId))
        .map(({ id, label, areaId, checked, notes: n }) => ({
          id,
          label,
          group: areaId,
          checked,
          notes: n,
        }));

      const res = await fetch("/api/cleaning/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          items: submittedItems,
          checkedBy: checkedBy.trim(),
          notes,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      router.push("/dashboard/supervisor/cleaning/daily/records");
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
            <ClipboardList className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="page-title leading-tight">Daily Cleaning Checklist</h1>
            <p className="page-subtitle">Julian Bakery Food Safety Management</p>
          </div>
        </div>
        <button
          onClick={() => router.push("/dashboard/supervisor/cleaning/daily/records")}
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

        {/* ── Step 1: Area Selection ── */}
        <div className="card p-5 space-y-3">
          <div>
            <p className="text-sm font-semibold text-gray-800">
              Which areas were used today? <span className="text-[#D64D4D]">*</span>
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Select all that apply — only those checklists will appear below.</p>
          </div>

          <div className="space-y-2">
            {AREAS.map((area) => {
              const selected = selectedAreas.has(area.id);
              return (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => toggleArea(area.id)}
                  className={cn(
                    "w-full text-left flex items-center gap-3.5 px-4 py-4 rounded-lg border-2 transition-all",
                    selected
                      ? "border-emerald-400 bg-emerald-50"
                      : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                  )}
                >
                  <div className={cn(
                    "w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 transition-all",
                    selected
                      ? "bg-emerald-500 border-emerald-500"
                      : "bg-white border-gray-300"
                  )}>
                    {selected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <span className={cn(
                    "text-sm font-medium leading-snug",
                    selected ? "text-emerald-800" : "text-gray-700"
                  )}>
                    {area.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Step 2: Overall Progress + Area Cards ── */}
        {totalSelectedAreas > 0 && (
          <>
            {/* Overall progress bar */}
            <div className="card p-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider">
                      Overall Progress
                    </span>
                    <span className={cn(
                      "text-xs font-mono font-bold",
                      allAreasDone
                        ? "text-emerald-600"
                        : areasComplete > 0
                        ? "text-amber-600"
                        : "text-gray-400"
                    )}>
                      {areasComplete}/{totalSelectedAreas} areas complete
                    </span>
                  </div>
                  <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-300",
                        allAreasDone
                          ? "bg-emerald-500"
                          : areasComplete > 0
                          ? "bg-amber-400"
                          : "bg-gray-300"
                      )}
                      style={{ width: `${Math.round((areasComplete / totalSelectedAreas) * 100)}%` }}
                    />
                  </div>
                </div>
                {allAreasDone && (
                  <div className="flex items-center gap-1.5 text-emerald-600 font-mono text-xs font-semibold shrink-0">
                    <CheckCircle2 className="w-4 h-4" /> All Done!
                  </div>
                )}
              </div>
            </div>

            {/* Per-area accordion cards */}
            {selectedAreaList.map((area) => (
              <AreaCard
                key={area.id}
                area={area}
                items={allItems.filter((it) => it.areaId === area.id)}
                onToggle={toggleItem}
                onNoteChange={setItemNote}
              />
            ))}
          </>
        )}

        {/* ── Informational Note ── */}
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3.5">
          <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-800 leading-relaxed">
            Food contact surface verification (ATP swab) and allergen verification (Allergen Changeover swab) are recorded separately in the Pre-Op Inspection and Allergen Changeover logs.
          </p>
        </div>

        {/* ── Instruction Cards (Reference) ── */}
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

        {/* ── Notes + Checked By ── */}
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

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-[#D64D4D] text-sm font-mono bg-red-50 border border-red-200 rounded-md px-4 py-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {/* Submit */}
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
            "Submit Daily Cleaning Checklist"
          )}
        </button>

      </form>
    </div>
  );
}
