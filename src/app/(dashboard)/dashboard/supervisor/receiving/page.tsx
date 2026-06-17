"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FolderOpen, CheckCircle2, XCircle, AlertCircle, Thermometer, FileText,
  ChevronDown, ChevronUp, Upload, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────────

const UNITS_FOR_RECEIVING = ["lb", "oz", "kg", "g", "gal", "L", "ml", "fl oz", "units", "each", "case", "pallet"] as const;

const OTHER_MATERIAL_ID = "__other__";
const UNREGISTERED_CATEGORY_OPTIONS = ["Ingredient", "Packaging", "Other / Supplies"] as const;

interface Supplier { id: string; name: string; status: string }
interface Material {
  id: string; name: string; unit: string | null;
  category: string;
  isAllergen: boolean; isOrganic: boolean; isGlutenFree: boolean;
  isTemperatureSensitive: boolean; coaRequired: boolean;
  suppliers: { supplier: Supplier }[];
}

type CheckValue = "pass" | "fail" | null;

interface ConditionCheck {
  packaging_integrity: CheckValue;
  seal_intact: CheckValue;
  label_matches_po: CheckValue;
  expiration_acceptable: CheckValue;
  contamination_evidence: CheckValue;
  temperature_sensitive: boolean;
  temperature_at_receiving: string;
  temperature_pass: CheckValue;
  temperature_corrective_action: string;
  condition_notes: string;
}

interface QuarantineInfo {
  quarantineReason: string;
  actionTaken: "quarantine_on_site" | "return_to_supplier";
  quarantineLocation: string;
  adminNotified: boolean;
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function nowTime(): string {
  const d = new Date();
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function CheckToggle({
  label, value, onChange,
}: { label: string; value: CheckValue; onChange: (v: CheckValue) => void }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-700">{label}</span>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => onChange(value === "pass" ? null : "pass")}
          className={cn(
            "px-3 py-1 rounded text-xs font-semibold transition-colors",
            value === "pass"
              ? "bg-emerald-500 text-white"
              : "bg-gray-100 text-gray-500 hover:bg-emerald-50 hover:text-emerald-700"
          )}
        >Pass</button>
        <button
          type="button"
          onClick={() => onChange(value === "fail" ? null : "fail")}
          className={cn(
            "px-3 py-1 rounded text-xs font-semibold transition-colors",
            value === "fail"
              ? "bg-red-500 text-white"
              : "bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-700"
          )}
        >Fail</button>
      </div>
    </div>
  );
}

function Toggle({
  checked, onChange, label, color = "bg-blue-500",
}: { checked: boolean; onChange: (v: boolean) => void; label: string; color?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
        checked ? color : "bg-gray-200"
      )}
    >
      <span className={cn(
        "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
        checked ? "translate-x-4" : "translate-x-0"
      )} />
      <span className="sr-only">{label}</span>
    </button>
  );
}

// ─── Main Form ──────────────────────────────────────────────────────────────────

export default function ReceivingPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [materials, setMaterials] = useState<Material[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Section 1
  const [date, setDate] = useState(today());
  const [time, setTime] = useState(nowTime());
  const [poNumber, setPoNumber] = useState("");

  // Section 2
  const [materialSearch, setMaterialSearch] = useState("");
  const [matSearchOpen, setMatSearchOpen] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [isOtherMaterial, setIsOtherMaterial] = useState(false);
  const [otherMaterialDesc, setOtherMaterialDesc] = useState("");
  const [otherMaterialCategory, setOtherMaterialCategory] = useState("");
  const [supplierMode, setSupplierMode] = useState<"linked" | "other">("linked");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [freeTextSupplier, setFreeTextSupplier] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [expirationDate, setExpirationDate] = useState("");

  // Section 3
  const [condition, setCondition] = useState<ConditionCheck>({
    packaging_integrity: null,
    seal_intact: null,
    label_matches_po: null,
    expiration_acceptable: null,
    contamination_evidence: null,
    temperature_sensitive: false,
    temperature_at_receiving: "",
    temperature_pass: null,
    temperature_corrective_action: "",
    condition_notes: "",
  });

  // Section 4 — COA
  const [coaReceived, setCoaReceived] = useState<boolean | null>(null);
  const [coaFile, setCoaFile] = useState<File | null>(null);
  const [coaNoReason, setCoaNoReason] = useState("");

  // Section 5 — Decision
  const [decision, setDecision] = useState<"accepted" | "accepted_with_conditions" | "rejected" | null>(null);
  const [quarantine, setQuarantine] = useState<QuarantineInfo>({
    quarantineReason: "",
    actionTaken: "quarantine_on_site",
    quarantineLocation: "",
    adminNotified: false,
  });

  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/supplier-management/materials?isActive=true")
      .then((r) => r.json())
      .then((d) => setMaterials(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  // When material changes, update temperature sensitive & reset unit
  useEffect(() => {
    if (selectedMaterial) {
      setCondition((c) => ({ ...c, temperature_sensitive: selectedMaterial.isTemperatureSensitive }));
      setUnit(selectedMaterial.unit ?? "");
    }
  }, [selectedMaterial]);

  const searchLower = materialSearch.trim().toLowerCase();
  const filteredMaterials = searchLower
    ? materials.filter((m) => m.name.toLowerCase().includes(searchLower))
    : materials;

  // Group materials by category for the dropdown
  const grouped = {
    INGREDIENT: filteredMaterials.filter((m) => m.category === "INGREDIENT"),
    PACKAGING:  filteredMaterials.filter((m) => m.category === "PACKAGING"),
    OTHER:      filteredMaterials.filter((m) => m.category !== "INGREDIENT" && m.category !== "PACKAGING"),
  };

  function selectMaterial(m: Material) {
    setSelectedMaterial(m);
    setIsOtherMaterial(false);
    setMaterialSearch(m.name);
    setMatSearchOpen(false);
    setSelectedSupplierId("");
    setFreeTextSupplier("");
    setSupplierMode("linked");
  }

  function selectOtherMaterial() {
    setSelectedMaterial(null);
    setIsOtherMaterial(true);
    setMaterialSearch("Other / Not in list...");
    setMatSearchOpen(false);
    setSelectedSupplierId("");
    setFreeTextSupplier("");
    setSupplierMode("other");
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!date) e.date = "Date is required";
    if (!time) e.time = "Time is required";
    if (!selectedMaterial && !isOtherMaterial) e.material = "Material is required";
    if (isOtherMaterial && !otherMaterialDesc.trim()) e.otherMaterialDesc = "Item description is required";
    if (isOtherMaterial && !otherMaterialCategory) e.otherMaterialCategory = "Category is required";
    if (!isOtherMaterial) {
      if (!supplierMode || (supplierMode === "linked" && !selectedSupplierId) ||
          (supplierMode === "other" && !freeTextSupplier.trim())) {
        e.supplier = "Supplier is required";
      }
    }
    if (isOtherMaterial && !freeTextSupplier.trim()) e.supplier = "Supplier name is required";
    if (!lotNumber.trim()) e.lotNumber = "Lot number is required";
    if (!quantity || isNaN(parseFloat(quantity))) e.quantity = "Valid quantity is required";
    if (!unit) e.unit = "Unit is required";
    if (!decision) e.decision = "Select a receiving decision";
    if ((decision === "accepted_with_conditions" || decision === "rejected") && !quarantine.quarantineReason.trim()) {
      e.quarantineReason = "Quarantine reason is required";
    }
    if (decision === "accepted_with_conditions" && quarantine.actionTaken === "quarantine_on_site" && !quarantine.quarantineLocation.trim()) {
      e.quarantineLocation = "Quarantine location is required";
    }
    if (selectedMaterial?.coaRequired && coaReceived === null) {
      e.coa = "Indicate whether COA was received";
    }
    if (selectedMaterial?.coaRequired && coaReceived === false && !coaNoReason.trim()) {
      e.coaNoReason = "Provide a reason COA was not received";
    }
    if (condition.temperature_sensitive && condition.temperature_pass === "fail" && !condition.temperature_corrective_action.trim()) {
      e.tempCorrective = "Corrective action is required for temperature failure";
    }
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSubmitting(true);
    try {
      const supplierId = (!isOtherMaterial && supplierMode === "linked") ? selectedSupplierId : undefined;
      const supplierNameOverride = (isOtherMaterial || supplierMode === "other") ? freeTextSupplier.trim() : undefined;

      const payload = {
        date,
        timeReceived: time,
        purchaseOrderNumber: poNumber.trim() || undefined,
        materialId: isOtherMaterial ? undefined : selectedMaterial!.id,
        isUnregisteredMaterial: isOtherMaterial || undefined,
        unregisteredMaterialName: isOtherMaterial ? otherMaterialDesc.trim() : undefined,
        materialCategoryFreetext: isOtherMaterial ? otherMaterialCategory : undefined,
        supplierId,
        supplierNameOverride,
        lotNumber: lotNumber.trim().toUpperCase(),
        quantityReceived: parseFloat(quantity),
        unit,
        expirationDate: expirationDate || undefined,
        conditionCheck: {
          ...condition,
          coa_no_reason: coaNoReason,
        },
        coaRequired: isOtherMaterial ? false : selectedMaterial!.coaRequired,
        coaReceived: (!isOtherMaterial && selectedMaterial!.coaRequired) ? coaReceived : undefined,
        decision: decision!,
        notes: notes.trim() || undefined,
        quarantine: (decision === "accepted_with_conditions" || decision === "rejected")
          ? {
              quarantineReason: quarantine.quarantineReason,
              actionTaken: quarantine.actionTaken,
              quarantineLocation: quarantine.quarantineLocation || undefined,
              adminNotified: quarantine.adminNotified,
            }
          : undefined,
      };

      let res: Response;
      if (coaFile) {
        const fd = new FormData();
        fd.append("data", JSON.stringify(payload));
        fd.append("coa", coaFile);
        res = await fetch("/api/receiving", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/receiving", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "Failed to submit receiving record.");
        return;
      }

      const data = await res.json();
      const rcvNum = data.record?.recordNumber ?? "";
      const qrNum  = data.quarantineRecord?.recordNumber ?? "";

      let msg = "";
      if (decision === "accepted") {
        msg = isOtherMaterial
          ? `Receiving record ${rcvNum} submitted. Note: no inventory lot created (unregistered material).`
          : `Receiving record ${rcvNum} submitted. Lot ${lotNumber.toUpperCase()} added to inventory.`;
      } else if (decision === "accepted_with_conditions") {
        msg = `Receiving record submitted. Quarantine Record ${qrNum} generated.`;
      } else {
        msg = `Receiving record submitted. Lot rejected. Quarantine Record ${qrNum} generated.`;
      }

      setToast(msg);
      setTimeout(() => { router.push("/dashboard/supervisor/receiving/records"); }, 2500);
    } catch { alert("An unexpected error occurred."); }
    finally { setSubmitting(false); }
  }

  const inp = "w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500";

  return (
    <div className="max-w-2xl space-y-6 pb-12">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-5 py-3 rounded-md shadow-lg text-sm font-medium max-w-sm">
          {toast}
        </div>
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Receiving</h1>
          <p className="text-sm text-gray-500 mt-0.5">Record incoming material deliveries</p>
        </div>
        <Link href="/dashboard/supervisor/receiving/records" className="btn-secondary flex items-center gap-2">
          <FolderOpen className="w-4 h-4" />
          View Records
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* ── SECTION 1 — Delivery Information ─────────────────────────────────── */}
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 text-base">Section 1 — Delivery Information</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date <span className="text-red-500">*</span></label>
              <input type="date" className={cn(inp, errors.date ? "border-red-400" : "")}
                value={date} onChange={(e) => setDate(e.target.value)} />
              {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time Received <span className="text-red-500">*</span></label>
              <input type="text" className={cn(inp, errors.time ? "border-red-400" : "")}
                value={time} onChange={(e) => setTime(e.target.value)} placeholder="e.g. 9:30 AM" />
              {errors.time && <p className="text-xs text-red-500 mt-1">{errors.time}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Order # <span className="text-gray-400 font-normal">(optional)</span></label>
            <input type="text" className={inp} value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="PO-12345" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Received By</label>
            <input type="text" className={cn(inp, "bg-gray-50 text-gray-500")}
              value={session?.user?.name ?? ""} readOnly />
          </div>
        </div>

        {/* ── SECTION 2 — Item Received ──────────────────────────────────────────── */}
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 text-base">Section 2 — Item Received</h2>

          {/* Material */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Material <span className="text-red-500">*</span></label>
            <input
              type="text"
              className={cn(inp, errors.material ? "border-red-400" : "")}
              value={materialSearch}
              onChange={(e) => {
                const v = e.target.value;
                setMaterialSearch(v);
                setMatSearchOpen(true);
                if (!v) { setSelectedMaterial(null); setIsOtherMaterial(false); }
              }}
              onFocus={() => setMatSearchOpen(true)}
              placeholder="Search material…"
              autoComplete="off"
            />
            {matSearchOpen && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-y-auto">
                {(["INGREDIENT", "PACKAGING", "OTHER"] as const).map((cat) => {
                  const items = grouped[cat];
                  if (!items.length) return null;
                  const catLabel = cat === "INGREDIENT" ? "Ingredients" : cat === "PACKAGING" ? "Packaging" : "Other";
                  return (
                    <div key={cat}>
                      <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100 sticky top-0">
                        {catLabel}
                      </div>
                      {items.map((m) => (
                        <button key={m.id} type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 border-b border-gray-50"
                          onClick={() => selectMaterial(m)}>
                          <span className="font-medium flex-1">{m.name}</span>
                          {m.isAllergen && <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded shrink-0">⚠ ALLERGEN</span>}
                          {m.isOrganic && <span className="text-[10px] bg-green-100 text-green-700 px-1 rounded shrink-0">🌿 ORGANIC</span>}
                          {m.isTemperatureSensitive && <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded shrink-0">🌡 TEMP</span>}
                          {m.coaRequired && <span className="text-[10px] bg-purple-100 text-purple-700 px-1 rounded shrink-0">COA</span>}
                        </button>
                      ))}
                    </div>
                  );
                })}
                {/* Other / Not in list */}
                <div>
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100 border-t border-gray-200">
                    Not in list
                  </div>
                  <button type="button"
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-amber-50 flex items-center gap-2"
                    onClick={() => selectOtherMaterial()}>
                    <span className="font-medium text-amber-700">Other / Not in list…</span>
                    <span className="text-[10px] text-gray-400 ml-auto">no inventory created</span>
                  </button>
                </div>
                {filteredMaterials.length === 0 && !searchLower && (
                  <div className="px-3 py-3 text-xs text-gray-400 text-center">No materials loaded</div>
                )}
                {filteredMaterials.length === 0 && searchLower && (
                  <div className="px-3 py-3 text-xs text-gray-400 text-center">No matches — use "Other / Not in list…" below</div>
                )}
              </div>
            )}
            {errors.material && <p className="text-xs text-red-500 mt-1">{errors.material}</p>}
          </div>

          {/* Unregistered material fields */}
          {isOtherMaterial && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-700">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>⚠ This item is not in the Materials registry. The receiving record will be saved but no inventory lot will be created and no supplier cross-reference will be performed. Ask admin to add this material to keep full traceability.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Item Description <span className="text-red-500">*</span></label>
                <input type="text" className={cn(inp, errors.otherMaterialDesc ? "border-red-400" : "")}
                  value={otherMaterialDesc} onChange={(e) => setOtherMaterialDesc(e.target.value)}
                  placeholder="Describe what you are receiving…" />
                <p className="text-xs text-gray-400 mt-1">Use this for unexpected deliveries or items not yet in the system. Contact admin to add this material to the registry.</p>
                {errors.otherMaterialDesc && <p className="text-xs text-red-500 mt-1">{errors.otherMaterialDesc}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category <span className="text-red-500">*</span></label>
                <select className={cn(inp, errors.otherMaterialCategory ? "border-red-400" : "")}
                  value={otherMaterialCategory} onChange={(e) => setOtherMaterialCategory(e.target.value)}>
                  <option value="">Select category…</option>
                  {UNREGISTERED_CATEGORY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                {errors.otherMaterialCategory && <p className="text-xs text-red-500 mt-1">{errors.otherMaterialCategory}</p>}
              </div>
            </div>
          )}

          {/* Supplier — for registered material */}
          {selectedMaterial && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplier <span className="text-red-500">*</span></label>
              <div className="space-y-2">
                {selectedMaterial.suppliers.map(({ supplier: s }) => (
                  <label key={s.id} className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="supplier"
                      checked={supplierMode === "linked" && selectedSupplierId === s.id}
                      onChange={() => { setSupplierMode("linked"); setSelectedSupplierId(s.id); }}
                      className="w-4 h-4 accent-brand-600"
                    />
                    <span className="text-sm">{s.name}</span>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-semibold",
                      s.status === "APPROVED"
                        ? "bg-emerald-100 text-emerald-700"
                        : s.status === "EXPIRING_SOON"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-red-100 text-red-700"
                    )}>{s.status}</span>
                  </label>
                ))}
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="supplier"
                    checked={supplierMode === "other"}
                    onChange={() => { setSupplierMode("other"); setSelectedSupplierId(""); }}
                    className="w-4 h-4 accent-brand-600"
                  />
                  <span className="text-sm text-gray-500">Other supplier…</span>
                </label>
                {supplierMode === "other" && (
                  <input type="text" className={cn(inp, "ml-6")}
                    value={freeTextSupplier} onChange={(e) => setFreeTextSupplier(e.target.value)}
                    placeholder="Supplier name" />
                )}
              </div>
              {errors.supplier && <p className="text-xs text-red-500 mt-1">{errors.supplier}</p>}
            </div>
          )}

          {/* Supplier — for unregistered material */}
          {isOtherMaterial && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplier <span className="text-red-500">*</span></label>
              <input type="text" className={cn(inp, errors.supplier ? "border-red-400" : "")}
                value={freeTextSupplier} onChange={(e) => setFreeTextSupplier(e.target.value)}
                placeholder="Supplier name" />
              {errors.supplier && <p className="text-xs text-red-500 mt-1">{errors.supplier}</p>}
            </div>
          )}

          {/* Lot */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lot Number <span className="text-red-500">*</span></label>
            <input type="text" className={cn(inp, errors.lotNumber ? "border-red-400" : "")}
              value={lotNumber} onChange={(e) => setLotNumber(e.target.value.toUpperCase())}
              placeholder="LOT-12345" />
            {errors.lotNumber && <p className="text-xs text-red-500 mt-1">{errors.lotNumber}</p>}
          </div>

          {/* Qty + Unit */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity Received <span className="text-red-500">*</span></label>
              <input type="number" min="0" step="any" className={cn(inp, errors.quantity ? "border-red-400" : "")}
                value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
              {errors.quantity && <p className="text-xs text-red-500 mt-1">{errors.quantity}</p>}
            </div>
            <div className="w-32">
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit <span className="text-red-500">*</span></label>
              <select className={cn(inp, errors.unit ? "border-red-400" : "")} value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="">Select</option>
                {UNITS_FOR_RECEIVING.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              {errors.unit && <p className="text-xs text-red-500 mt-1">{errors.unit}</p>}
            </div>
          </div>

          {/* Expiration */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expiration Date <span className="text-gray-400 font-normal">(optional)</span></label>
            <input type="date" className={inp} value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} />
          </div>
        </div>

        {/* ── SECTION 3 — Condition Check ────────────────────────────────────────── */}
        <div className="card p-6 space-y-2">
          <h2 className="font-semibold text-gray-900 text-base mb-3">Section 3 — Condition Check</h2>
          <CheckToggle label="Packaging Integrity" value={condition.packaging_integrity}
            onChange={(v) => setCondition((c) => ({ ...c, packaging_integrity: v }))} />
          <CheckToggle label="Seal Intact" value={condition.seal_intact}
            onChange={(v) => setCondition((c) => ({ ...c, seal_intact: v }))} />
          <CheckToggle label="Label Matches PO" value={condition.label_matches_po}
            onChange={(v) => setCondition((c) => ({ ...c, label_matches_po: v }))} />
          {expirationDate && (
            <CheckToggle label="Expiration Date Acceptable" value={condition.expiration_acceptable}
              onChange={(v) => setCondition((c) => ({ ...c, expiration_acceptable: v }))} />
          )}
          <CheckToggle label="No Contamination or Pest Evidence" value={condition.contamination_evidence}
            onChange={(v) => setCondition((c) => ({ ...c, contamination_evidence: v }))} />

          {/* Temperature */}
          {condition.temperature_sensitive && (
            <div className="mt-3 pt-3 border-t border-blue-100 space-y-3">
              <div className="flex items-center gap-2 text-sm text-blue-700 font-medium">
                <Thermometer className="w-4 h-4" />
                Temperature Check Required
              </div>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Temperature at Receiving (°F)</label>
                  <input type="number" step="0.1" className={inp}
                    value={condition.temperature_at_receiving}
                    onChange={(e) => setCondition((c) => ({ ...c, temperature_at_receiving: e.target.value }))}
                    placeholder="e.g. 38.5" />
                </div>
                <div>
                  <CheckToggle label="" value={condition.temperature_pass}
                    onChange={(v) => setCondition((c) => ({ ...c, temperature_pass: v }))} />
                </div>
              </div>
              {condition.temperature_pass === "fail" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Corrective Action <span className="text-red-500">*</span></label>
                  <textarea className={cn(inp, "min-h-[60px]", errors.tempCorrective ? "border-red-400" : "")}
                    value={condition.temperature_corrective_action}
                    onChange={(e) => setCondition((c) => ({ ...c, temperature_corrective_action: e.target.value }))}
                    placeholder="Describe corrective action taken…" />
                  {errors.tempCorrective && <p className="text-xs text-red-500 mt-1">{errors.tempCorrective}</p>}
                </div>
              )}
            </div>
          )}

          <div className="pt-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Condition Notes <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea className={cn(inp, "min-h-[70px]")}
              value={condition.condition_notes}
              onChange={(e) => setCondition((c) => ({ ...c, condition_notes: e.target.value }))}
              placeholder="Any observations about the delivery condition…" />
          </div>
        </div>

        {/* ── SECTION 4 — COA ────────────────────────────────────────────────────── */}
        {selectedMaterial?.coaRequired && (
          <div className="card p-6 space-y-4">
            <h2 className="font-semibold text-gray-900 text-base">Section 4 — Certificate of Analysis</h2>
            <div>
              <p className="text-sm text-gray-700 mb-3">Was a COA received with this delivery?</p>
              <div className="flex gap-3">
                <button type="button"
                  onClick={() => setCoaReceived(true)}
                  className={cn("px-4 py-2 rounded text-sm font-medium border transition-colors",
                    coaReceived === true ? "bg-emerald-500 text-white border-emerald-500" : "border-gray-300 text-gray-600 hover:bg-gray-50"
                  )}>
                  Yes
                </button>
                <button type="button"
                  onClick={() => setCoaReceived(false)}
                  className={cn("px-4 py-2 rounded text-sm font-medium border transition-colors",
                    coaReceived === false ? "bg-red-500 text-white border-red-500" : "border-gray-300 text-gray-600 hover:bg-gray-50"
                  )}>
                  No
                </button>
              </div>
              {errors.coa && <p className="text-xs text-red-500 mt-1">{errors.coa}</p>}
            </div>

            {coaReceived === true && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Upload COA (PDF, max 10MB)</label>
                {coaFile ? (
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-md">
                    <FileText className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm text-emerald-700 flex-1 truncate">{coaFile.name}</span>
                    <button type="button" onClick={() => setCoaFile(null)}>
                      <X className="w-4 h-4 text-emerald-600 hover:text-red-500" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center gap-2 p-6 border-2 border-dashed border-gray-300 rounded-md cursor-pointer hover:border-brand-400 transition-colors">
                    <Upload className="w-6 h-6 text-gray-400" />
                    <span className="text-sm text-gray-500">Click to upload COA PDF</span>
                    <input type="file" accept="application/pdf" className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f && f.size <= 10 * 1024 * 1024) setCoaFile(f);
                        else if (f) alert("File too large (max 10MB)");
                      }} />
                  </label>
                )}
              </div>
            )}

            {coaReceived === false && (
              <div className="space-y-3">
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>⚠ COA not received. This material requires a COA with each delivery. Document the reason below.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason COA Not Received <span className="text-red-500">*</span></label>
                  <textarea className={cn(inp, "min-h-[70px]", errors.coaNoReason ? "border-red-400" : "")}
                    value={coaNoReason}
                    onChange={(e) => setCoaNoReason(e.target.value)}
                    placeholder="e.g. Supplier will send COA by email within 48 hours…" />
                  {errors.coaNoReason && <p className="text-xs text-red-500 mt-1">{errors.coaNoReason}</p>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SECTION 5 — Receiving Decision ─────────────────────────────────────── */}
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 text-base">Section 5 — Receiving Decision</h2>
          {errors.decision && <p className="text-xs text-red-500">{errors.decision}</p>}

          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setDecision("accepted")}
              className={cn(
                "flex flex-col items-center gap-2 py-4 px-3 rounded-lg border-2 transition-colors font-medium text-sm",
                decision === "accepted"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-gray-200 text-gray-500 hover:border-emerald-300"
              )}
            >
              <CheckCircle2 className="w-6 h-6" />
              ACCEPT
            </button>

            <button
              type="button"
              onClick={() => setDecision("accepted_with_conditions")}
              className={cn(
                "flex flex-col items-center gap-2 py-4 px-3 rounded-lg border-2 transition-colors font-medium text-sm",
                decision === "accepted_with_conditions"
                  ? "border-amber-500 bg-amber-50 text-amber-700"
                  : "border-gray-200 text-gray-500 hover:border-amber-300"
              )}
            >
              <AlertCircle className="w-6 h-6" />
              <span className="text-center leading-tight">ACCEPT WITH<br/>CONDITIONS</span>
            </button>

            <button
              type="button"
              onClick={() => setDecision("rejected")}
              className={cn(
                "flex flex-col items-center gap-2 py-4 px-3 rounded-lg border-2 transition-colors font-medium text-sm",
                decision === "rejected"
                  ? "border-red-500 bg-red-50 text-red-700"
                  : "border-gray-200 text-gray-500 hover:border-red-300"
              )}
            >
              <XCircle className="w-6 h-6" />
              REJECT
            </button>
          </div>

          {/* Quarantine fields */}
          {(decision === "accepted_with_conditions" || decision === "rejected") && (
            <div className="space-y-4 pt-3 border-t border-gray-200">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quarantine Reason <span className="text-red-500">*</span></label>
                <textarea
                  className={cn(inp, "min-h-[80px]", errors.quarantineReason ? "border-red-400" : "")}
                  value={quarantine.quarantineReason}
                  onChange={(e) => setQuarantine((q) => ({ ...q, quarantineReason: e.target.value }))}
                  placeholder="Describe the issue…" />
                {errors.quarantineReason && <p className="text-xs text-red-500 mt-1">{errors.quarantineReason}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Action Taken <span className="text-red-500">*</span></label>
                <select className={inp} value={quarantine.actionTaken}
                  onChange={(e) => setQuarantine((q) => ({ ...q, actionTaken: e.target.value as "quarantine_on_site" | "return_to_supplier" }))}>
                  <option value="quarantine_on_site">Quarantine on-site</option>
                  <option value="return_to_supplier">Return to supplier</option>
                </select>
              </div>

              {quarantine.actionTaken === "quarantine_on_site" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quarantine Location <span className="text-red-500">*</span></label>
                  <input type="text" className={cn(inp, errors.quarantineLocation ? "border-red-400" : "")}
                    value={quarantine.quarantineLocation}
                    onChange={(e) => setQuarantine((q) => ({ ...q, quarantineLocation: e.target.value }))}
                    placeholder="e.g. Quarantine shelf, Section B, Cold Room" />
                  {errors.quarantineLocation && <p className="text-xs text-red-500 mt-1">{errors.quarantineLocation}</p>}
                </div>
              )}

              <div className="flex items-center gap-3">
                <Toggle
                  checked={quarantine.adminNotified}
                  onChange={(v) => setQuarantine((q) => ({ ...q, adminNotified: v }))}
                  label="Admin notified"
                  color="bg-brand-600"
                />
                <span className="text-sm font-medium text-gray-700">Admin Notified?</span>
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="card p-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
          <textarea className={cn(inp, "min-h-[70px]")} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any additional notes…" />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full btn-primary py-3 text-base font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {submitting
            ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Submitting…</>
            : "Submit Receiving Record"}
        </button>
      </form>
    </div>
  );
}
