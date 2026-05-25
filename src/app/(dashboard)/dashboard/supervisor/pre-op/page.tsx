"use client";

import { useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, CheckCircle2, XCircle, MinusCircle, ChevronRight, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import type { SignaturePadHandle } from "@/components/SignaturePad";

const SignaturePad = dynamic(() => import("@/components/SignaturePad"), { ssr: false });

// ---------------------------------------------------------------------------
// Inspection sections & items
// ---------------------------------------------------------------------------
const SECTIONS = [
  {
    label: "Personnel & Hygiene",
    items: [
      "All personnel wearing proper PPE (hair nets, gloves, aprons)",
      "Hands washed and sanitized before handling food",
      "No jewelry, nail polish, or false nails observed",
      "Personnel with illness or open wounds excluded from production",
    ],
  },
  {
    label: "Facility & Grounds",
    items: [
      "Production area free from debris, pests, or standing water",
      "Drains clean and functioning properly",
      "Doors, windows, and screens in good condition",
      "Lighting adequate and all fixtures protected",
    ],
  },
  {
    label: "Equipment & Utensils",
    items: [
      "All equipment cleaned and sanitized since last use",
      "No damaged or cracked equipment in use",
      "Utensils stored properly (inverted, covered, or elevated)",
      "Cutting surfaces sanitized and in good condition",
    ],
  },
  {
    label: "Sanitation Supplies",
    items: [
      "Sanitizer solution at correct concentration (200–400 ppm)",
      "Color-coded cleaning tools in correct zones",
      "Cleaning chemicals properly labeled and stored",
      "Sanitizing logs completed for previous shift",
    ],
  },
  {
    label: "Temperature & Storage",
    items: [
      "Refrigerators at or below 41°F / 5°C",
      "Freezers at or below 0°F / -18°C",
      "Raw and ready-to-eat foods properly separated",
      "All products labeled with date and allergen information",
    ],
  },
  {
    label: "Corrective Actions",
    items: [
      "Previous shift corrective actions resolved",
      "Non-conforming products properly quarantined or disposed",
      "Corrective action log up to date",
    ],
  },
];

type Result = "PASS" | "FAIL" | "NA";

interface SectionItem {
  section: string;
  item: string;
  result: Result;
  notes: string;
}

function buildInitialItems(): SectionItem[] {
  return SECTIONS.flatMap((s) =>
    s.items.map((item) => ({ section: s.label, item, result: "PASS" as Result, notes: "" }))
  );
}

function ResultButton({
  value,
  active,
  onClick,
}: {
  value: Result;
  active: boolean;
  onClick: () => void;
}) {
  const config = {
    PASS: { icon: CheckCircle2, label: "Pass", active: "bg-emerald-600 text-white border-emerald-600", inactive: "border-gray-200 text-gray-400 hover:border-emerald-400 hover:text-emerald-600" },
    FAIL: { icon: XCircle,      label: "Fail", active: "bg-[#D64D4D] text-white border-[#D64D4D]",   inactive: "border-gray-200 text-gray-400 hover:border-red-400 hover:text-[#D64D4D]" },
    NA:   { icon: MinusCircle,  label: "N/A",  active: "bg-gray-500 text-white border-gray-500",      inactive: "border-gray-200 text-gray-400 hover:border-gray-400 hover:text-gray-600" },
  }[value];

  const Icon = config.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-1 rounded border text-xs font-mono font-medium transition-colors",
        active ? config.active : config.inactive
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </button>
  );
}

export default function PreOpFormPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const sigRef = useRef<SignaturePadHandle>(null);
  const [date, setDate]   = useState(() => new Date().toISOString().slice(0, 10));
  const [shift, setShift] = useState<"AM" | "PM">("AM");
  const [items, setItems] = useState<SectionItem[]>(buildInitialItems);
  const [correctiveAction, setCorrectiveAction] = useState("");
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (status === "loading") return null;

  const role = (session?.user as { role?: string })?.role ?? "";
  if (role !== "SUPERVISOR" && role !== "ADMIN") {
    return (
      <div className="flex items-center gap-2 text-[#D64D4D] font-mono text-sm">
        <AlertCircle className="w-4 h-4" /> Access restricted to supervisors and administrators.
      </div>
    );
  }

  function setResult(idx: number, result: Result) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, result } : item)));
  }

  function setNotes(idx: number, notes: string) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, notes } : item)));
  }

  const hasFail = items.some((i) => i.result === "FAIL");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (hasFail && !correctiveAction.trim()) {
      setError("Corrective action is required when one or more items fail.");
      return;
    }

    if (!sigRef.current || sigRef.current.isEmpty()) {
      setError("Supervisor signature is required.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/pre-op", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, shift, sections: items, correctiveAction, supervisorSignature: sigRef.current?.toDataURL() ?? "" }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Submission failed. Please try again.");
        return;
      }

      setSuccess(true);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="max-w-xl mx-auto mt-12 text-center space-y-4">
        <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold font-garamond text-gray-900">Inspection Submitted</h2>
        <p className="text-sm text-gray-500 font-mono">Your Pre-Op inspection has been recorded.</p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => { setItems(buildInitialItems()); setCorrectiveAction(""); sigRef.current?.clear(); setSuccess(false); }}
            className="btn-secondary"
          >
            New Inspection
          </button>
          <button onClick={() => router.push("/dashboard/supervisor/pre-op/records")} className="btn-primary">
            View Records <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Group items by section for rendering
  const grouped = SECTIONS.map((s) => ({
    label: s.label,
    items: items
      .map((item, idx) => ({ ...item, idx }))
      .filter((item) => item.section === s.label),
  }));

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-[#D64D4D]" />
            Pre-Operation Inspection
          </h1>
          <p className="page-subtitle">Complete all items before production begins</p>
        </div>
        <button onClick={() => router.push("/dashboard/supervisor/pre-op/records")} type="button" className="btn-secondary">
          View Records
        </button>
      </div>

      {/* Date + Shift */}
      <div className="card p-5 grid grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="date">Inspection Date</label>
          <input
            id="date"
            type="date"
            className="input"
            value={date}
            placeholder="MM/DD/YYYY"
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Shift</label>
          <div className="flex gap-2 mt-1">
            {(["AM", "PM"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setShift(s)}
                className={cn(
                  "flex-1 py-2 rounded border text-sm font-mono font-medium transition-colors",
                  shift === s
                    ? "bg-[#D64D4D] text-white border-[#D64D4D]"
                    : "bg-white text-gray-600 border-gray-300 hover:border-[#D64D4D] hover:text-[#D64D4D]"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Inspection sections */}
      {grouped.map((section) => (
        <div key={section.label} className="card overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-700 font-mono">{section.label}</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {section.items.map(({ idx, item, result, notes }) => (
              <div key={idx} className="px-5 py-3.5">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm text-gray-700 leading-snug flex-1">{item}</p>
                  <div className="flex gap-1.5 shrink-0">
                    {(["PASS", "FAIL", "NA"] as Result[]).map((r) => (
                      <ResultButton key={r} value={r} active={result === r} onClick={() => setResult(idx, r)} />
                    ))}
                  </div>
                </div>
                {result === "FAIL" && (
                  <div className="mt-2">
                    <input
                      type="text"
                      className="input text-xs"
                      placeholder="Describe the issue…"
                      value={notes}
                      onChange={(e) => setNotes(idx, e.target.value)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Corrective Action */}
      <div className="card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 font-mono">
          Corrective Action
          {hasFail && <span className="ml-2 text-[#D64D4D] text-xs">(required — one or more items failed)</span>}
        </h2>
        <textarea
          className="input min-h-[80px] resize-y"
          placeholder={hasFail ? "Describe corrective actions taken before proceeding…" : "Optional — note any items deferred or monitored"}
          value={correctiveAction}
          onChange={(e) => setCorrectiveAction(e.target.value)}
          required={hasFail}
        />
      </div>

      {/* Supervisor signature */}
      <div className="card p-5">
        <SignaturePad ref={sigRef} label="Supervisor Signature" />
        <p className="text-xs text-gray-400 font-mono mt-2">By signing, you certify the facility meets pre-operation requirements.</p>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2.5 font-mono">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3 pb-8">
        <button type="button" onClick={() => setItems(buildInitialItems())} className="btn-secondary">
          Reset
        </button>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : "Submit Inspection"}
        </button>
      </div>
    </form>
  );
}
