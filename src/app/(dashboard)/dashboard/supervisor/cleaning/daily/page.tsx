"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, ChevronDown, ChevronUp, AlertCircle, ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DateInput } from "@/components/DateInput";

// ─── Constants ────────────────────────────────────────────────────────────────

const CHECKLIST_ITEMS = [
  { key: "allMachinesCleaned",  label: "All Machines Cleaned" },
  { key: "prepToolsCleaned",    label: "Prep Tools Cleaned" },
  { key: "floorsMoppedSwept",   label: "Floors Mopped and Swept" },
  { key: "bakingTraysCleaned",  label: "Baking Trays / Pans Cleaned and Properly Covered" },
  { key: "foodSurfacesCleaned", label: "All Food Contact Surfaces Cleaned" },
  { key: "trashEmptied",        label: "Trash Emptied" },
] as const;

type ChecklistKey = (typeof CHECKLIST_ITEMS)[number]["key"];

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

// ─── Instruction content ──────────────────────────────────────────────────────

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

// ─── Main Form ────────────────────────────────────────────────────────────────

const todayYMD = () => new Date().toISOString().split("T")[0];

export default function DailyCleaningPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [area, setArea]           = useState<"MAIN" | "BARS">("MAIN");
  const [date, setDate]           = useState(todayYMD());
  const [checks, setChecks]       = useState<Record<ChecklistKey, boolean>>({
    allMachinesCleaned: false,
    prepToolsCleaned: false,
    floorsMoppedSwept: false,
    bakingTraysCleaned: false,
    foodSurfacesCleaned: false,
    trashEmptied: false,
  });
  const [notes, setNotes]         = useState("");
  const [checkedBy, setCheckedBy] = useState(session?.user?.name ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState("");

  // Keep checkedBy in sync once session loads
  if (!checkedBy && session?.user?.name) setCheckedBy(session.user.name);

  function toggleCheck(key: ChecklistKey) {
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const allChecked = Object.values(checks).every(Boolean);
  const anyChecked = Object.values(checks).some(Boolean);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!date) { setError("Please select a date."); return; }
    if (!checkedBy.trim()) { setError("Please enter who checked."); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/cleaning/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ area, date, ...checks, checkedBy: checkedBy.trim(), notes }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
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
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-[#D64D4D] rounded-md flex items-center justify-center shrink-0">
          <ClipboardList className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="page-title leading-tight">Daily Cleaning Checklist</h1>
          <p className="page-subtitle">Julian Bakery Food Safety Management</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Card: Area + Date */}
        <div className="card p-5 space-y-5">
          {/* Area */}
          <div>
            <label className="label">Area <span className="text-[#D64D4D]">*</span></label>
            <div className="flex gap-3 mt-1">
              {(["MAIN", "BARS"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setArea(opt)}
                  className={cn(
                    "flex-1 py-3 rounded-lg border-2 text-sm font-bold font-mono tracking-widest transition-all",
                    area === opt
                      ? "bg-[#D64D4D] border-[#D64D4D] text-white shadow-sm"
                      : "bg-white border-gray-200 text-gray-500 hover:border-gray-400"
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 font-mono mt-1.5">
              Main: Granola, Crackers &amp; Powders &nbsp;·&nbsp; Bars: Protein Bars
            </p>
          </div>

          {/* Date */}
          <div>
            <label className="label">Date <span className="text-[#D64D4D]">*</span></label>
            <DateInput className="input" value={date} onChange={setDate} />
          </div>
        </div>

        {/* Checklist */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider">
              Cleaning Items
              {allChecked
                ? <span className="ml-2 text-emerald-600">· All items checked ✓</span>
                : anyChecked
                ? <span className="ml-2 text-amber-600">· Some items unchecked</span>
                : <span className="ml-2 text-gray-400">· No items checked yet</span>
              }
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {CHECKLIST_ITEMS.map(({ key, label }) => (
              <label
                key={key}
                className={cn(
                  "flex items-center gap-4 px-5 py-4 cursor-pointer select-none transition-colors",
                  checks[key] ? "bg-emerald-50/50" : "hover:bg-gray-50"
                )}
              >
                {/* Large checkbox */}
                <div
                  className={cn(
                    "w-7 h-7 rounded-md border-2 flex items-center justify-center shrink-0 transition-all",
                    checks[key]
                      ? "bg-emerald-500 border-emerald-500"
                      : "bg-white border-gray-300 hover:border-gray-400"
                  )}
                  onClick={() => toggleCheck(key)}
                >
                  {checks[key] && <CheckCircle2 className="w-4 h-4 text-white" />}
                </div>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checks[key]}
                  onChange={() => toggleCheck(key)}
                />
                <span className={cn(
                  "text-sm font-medium leading-snug",
                  checks[key] ? "text-emerald-800" : "text-gray-700"
                )}>
                  {label}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Instruction Cards */}
        <div className="space-y-3">
          <p className="text-xs font-mono font-semibold text-gray-400 uppercase tracking-wider">
            Cleaning Instructions (Reference Only)
          </p>
          <InstructionCard title="Food Contact Surfaces — Cleaning Instructions (D1.2.a)">
            <InstructionSection
              title="English"
              steps={FOOD_SURFACES_EN}
            />
            <hr className="border-amber-200 my-3" />
            <InstructionSection
              title="Español"
              steps={FOOD_SURFACES_ES}
            />
          </InstructionCard>

          <InstructionCard title="Equipment and Utensils — Cleaning Instructions (D1.2.b)">
            <InstructionSection
              title="English"
              steps={EQUIPMENT_EN}
            />
            <hr className="border-amber-200 my-3" />
            <InstructionSection
              title="Español"
              steps={EQUIPMENT_ES}
            />
          </InstructionCard>
        </div>

        {/* Notes + Checked By */}
        <div className="card p-5 space-y-4">
          <div>
            <label className="label">Notes</label>
            <textarea
              className="input resize-none h-20"
              placeholder="Any observations or issues to report..."
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
              onChange={(e) => setCheckedBy(e.target.value)}
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
            "Submit Daily Checklist"
          )}
        </button>
      </form>
    </div>
  );
}
