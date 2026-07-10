"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, XCircle, AlertTriangle, Package, Minus,
  Plus, Trash2, Lightbulb, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type ConfigStatus = "unmatched" | "bundle" | "single_matched" | "ignored";

interface BundleConfigRow {
  id: string;
  componentProductId: string;
  componentName: string;
  componentUpc: string | null;
  fsmsPresentationId: string;
  fsmsProductId: string;
  fsmsPresentationName: string | null;
  fsmsProductName: string | null;
  quantityPerBundle: number;
}

interface SSProductRow {
  id: string;
  shipstationProductId: string;
  name: string;
  sku: string | null;
  upc: string | null;
  isBundle: boolean;
  configStatus: ConfigStatus;
  ignoredReason: string | null;
  fsmsPresentationId: string | null;
  fsmsProductId: string | null;
  fsmsPresentationName: string | null;
  fsmsProductName: string | null;
  shipmentsLast90Days: number;
  bundleConfigs: BundleConfigRow[];
}

interface Summary {
  total: number;
  unmatched: number;
  singleMatched: number;
  bundle: number;
  ignored: number;
}

interface ComponentOption {
  id: string;
  name: string;
  upc: string | null;
  fsmsPresentationId: string | null;
  fsmsProductId: string | null;
  presentationName: string | null;
  productName: string | null;
  displayLabel: string;
}

interface FsmsPresentation {
  fsmsPresentationId: string;
  fsmsProductId: string;
  presentationName: string;
  productName: string;
  upc: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ConfigStatus }) {
  if (status === "single_matched") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" />Single ✓</span>;
  if (status === "bundle") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" />Bundle ✓</span>;
  if (status === "ignored") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full"><Minus className="w-3 h-3" />Ignored</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full"><AlertTriangle className="w-3 h-3" />Unmatched</span>;
}

function ShipmentsBadge({ count }: { count: number }) {
  const color = count > 50 ? "bg-red-50 text-red-700" : count >= 10 ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-500";
  return <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded-full ${color}`}>{count} shipments</span>;
}

function detectMultiPack(name: string): { qty: number; baseName: string } | null {
  const lower = name.toLowerCase();
  const patterns = [
    { regex: /\b(\d+)[\s-]?pack\b/i, idx: 1 },
    { regex: /\b(\d+)[\s-]?ct\b/i, idx: 1 },
    { regex: /\b(\d+)[\s-]?count\b/i, idx: 1 },
    { regex: /\bpack of (\d+)\b/i, idx: 1 },
  ];
  for (const { regex } of patterns) {
    const m = lower.match(regex);
    if (m) {
      const qty = parseInt(m[1], 10);
      if (qty >= 2 && qty <= 24) {
        const baseName = name.replace(new RegExp(regex.source, "i"), "").replace(/\s+/g, " ").trim();
        return { qty, baseName };
      }
    }
  }
  return null;
}

// ─── Bundle Component Row ─────────────────────────────────────────────────────

interface ComponentRowState {
  componentProductId: string;
  fsmsPresentationId: string;
  fsmsProductId: string;
  quantityPerBundle: number;
}

function BundleComponentRow({
  row,
  idx,
  options,
  onChange,
  onRemove,
  canRemove,
}: {
  row: ComponentRowState;
  idx: number;
  options: ComponentOption[];
  onChange: (updated: ComponentRowState) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === row.componentProductId);
  const filtered = options.filter((o) =>
    !search || o.displayLabel.toLowerCase().includes(search.toLowerCase()) || (o.upc ?? "").includes(search)
  );

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-md border border-gray-200">
      <div className="flex-1 relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between text-sm border border-gray-300 rounded-md px-3 py-2 bg-white hover:border-gray-400 transition-colors"
        >
          <span className={selected ? "text-gray-900" : "text-gray-400"}>
            {selected ? selected.displayLabel : "Select component product…"}
          </span>
          {open ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
        </button>
        {open && (
          <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-y-auto">
            <div className="p-2 border-b border-gray-100">
              <input
                type="text"
                placeholder="Search by name or UPC…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
                autoFocus
              />
            </div>
            {filtered.length === 0 ? (
              <div className="p-3 text-xs text-gray-400 text-center">
                No matched products found.{" "}
                <Link href="/dashboard/admin/planning/shipstation-bundles" className="underline">Configure singles first.</Link>
              </div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onChange({
                      ...row,
                      componentProductId: opt.id,
                      fsmsPresentationId: opt.fsmsPresentationId ?? "",
                      fsmsProductId: opt.fsmsProductId ?? "",
                    });
                    setOpen(false);
                    setSearch("");
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors",
                    opt.id === row.componentProductId && "bg-emerald-50 text-emerald-700"
                  )}
                >
                  <p className="font-medium">{opt.presentationName ?? opt.name}</p>
                  {opt.productName && <p className="text-xs text-gray-400">{opt.productName}</p>}
                  {opt.upc && <p className="text-xs font-mono text-gray-400">UPC: {opt.upc}</p>}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-xs text-gray-500 whitespace-nowrap">× per unit:</span>
        <input
          type="number"
          min={1}
          max={99}
          value={row.quantityPerBundle}
          onChange={(e) => onChange({ ...row, quantityPerBundle: Math.max(1, parseInt(e.target.value, 10) || 1) })}
          className="w-16 text-sm text-center border border-gray-300 rounded-md px-2 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      {canRemove && (
        <button type="button" onClick={onRemove} className="text-gray-400 hover:text-red-500 transition-colors p-2 shrink-0">
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({
  product,
  componentOptions,
  allPresentations,
  onSaved,
}: {
  product: SSProductRow;
  componentOptions: ComponentOption[];
  allPresentations: FsmsPresentation[];
  onSaved: (id: string, newStatus: ConfigStatus) => void;
}) {
  type Mode = "bundle" | "single" | "ignored";

  const initMode = (): Mode => {
    if (product.configStatus === "bundle") return "bundle";
    if (product.configStatus === "single_matched") return "single";
    if (product.configStatus === "ignored") return "ignored";
    // Smart suggestion
    const mp = detectMultiPack(product.name);
    return mp ? "bundle" : "single";
  };

  const [mode, setMode] = useState<Mode>(initMode);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Bundle state
  const initComponents = (): ComponentRowState[] => {
    if (product.bundleConfigs.length > 0) {
      return product.bundleConfigs.map((bc) => ({
        componentProductId: bc.componentProductId,
        fsmsPresentationId: bc.fsmsPresentationId,
        fsmsProductId: bc.fsmsProductId,
        quantityPerBundle: bc.quantityPerBundle,
      }));
    }
    const mp = detectMultiPack(product.name);
    return [{ componentProductId: "", fsmsPresentationId: "", fsmsProductId: "", quantityPerBundle: mp?.qty ?? 1 }];
  };
  const [components, setComponents] = useState<ComponentRowState[]>(initComponents);

  // Single state
  const [upc, setUpc] = useState(product.upc ?? "");
  const [upcMatch, setUpcMatch] = useState<FsmsPresentation | null>(
    product.fsmsPresentationId
      ? (allPresentations.find((p) => p.fsmsPresentationId === product.fsmsPresentationId) ?? null)
      : null
  );

  // Ignored state
  const [ignoredReason, setIgnoredReason] = useState(product.ignoredReason ?? "");

  // Smart suggestion
  const multiPack = detectMultiPack(product.name);
  const suggestion = multiPack
    ? componentOptions.find((o) =>
        o.displayLabel.toLowerCase().includes(
          multiPack.baseName.toLowerCase().split(" ").filter((w) => w.length > 3)[0] ?? ""
        )
      )
    : null;
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  // UPC lookup
  useEffect(() => {
    if (!upc || upc.length < 8) { setUpcMatch(null); return; }
    const match = allPresentations.find((p) => p.upc === upc.trim());
    setUpcMatch(match ?? null);
  }, [upc, allPresentations]);

  // Component helpers
  function addComponent() {
    setComponents((prev) => [...prev, { componentProductId: "", fsmsPresentationId: "", fsmsProductId: "", quantityPerBundle: 1 }]);
  }
  function updateComponent(idx: number, val: ComponentRowState) {
    setComponents((prev) => prev.map((c, i) => i === idx ? val : c));
  }
  function removeComponent(idx: number) {
    setComponents((prev) => prev.filter((_, i) => i !== idx));
  }

  function applySuggestion() {
    if (!suggestion || !multiPack) return;
    setComponents([{
      componentProductId: suggestion.id,
      fsmsPresentationId: suggestion.fsmsPresentationId ?? "",
      fsmsProductId: suggestion.fsmsProductId ?? "",
      quantityPerBundle: multiPack.qty,
    }]);
    setSuggestionDismissed(true);
  }

  // Validation
  const isBundleValid = mode === "bundle" && components.length > 0 &&
    components.every((c) => c.componentProductId && c.fsmsPresentationId && c.quantityPerBundle > 0);
  const isSingleValid = mode === "single" && !!upcMatch;
  const isIgnoredValid = mode === "ignored";
  const canSave = isBundleValid || isSingleValid || isIgnoredValid;

  async function save() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const body =
        mode === "bundle"
          ? { configType: "bundle", components }
          : mode === "single"
          ? { configType: "single", upc: upc.trim(), fsmsPresentationId: upcMatch!.fsmsPresentationId, fsmsProductId: upcMatch!.fsmsProductId }
          : { configType: "ignored", ignoredReason: ignoredReason || null };

      const res = await fetch(`/api/integrations/shipstation/bundle-config/${product.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setSaveMsg({ ok: false, text: d.error ?? "Save failed" });
        return;
      }
      setSaveMsg({ ok: true, text: "Saved!" });
      const newStatus: ConfigStatus = mode === "bundle" ? "bundle" : mode === "single" ? "single_matched" : "ignored";
      onSaved(product.id, newStatus);
    } finally {
      setSaving(false);
    }
  }

  const Radio = ({ value, label }: { value: Mode; label: string }) => (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="radio"
        name={`mode-${product.id}`}
        value={value}
        checked={mode === value}
        onChange={() => setMode(value)}
        className="accent-[#D64D4D] w-4 h-4"
      />
      <span className="text-sm font-medium text-gray-800">{label}</span>
    </label>
  );

  return (
    <div className="card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 leading-snug">{product.name}</p>
          {product.sku && <p className="text-xs font-mono text-gray-400 mt-0.5">SKU: {product.sku}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ShipmentsBadge count={product.shipmentsLast90Days} />
          <StatusBadge status={product.configStatus} />
        </div>
      </div>

      {/* Smart suggestion */}
      {multiPack && suggestion && !suggestionDismissed && mode === "bundle" && (
        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
          <Lightbulb className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 text-xs text-amber-800">
            <span className="font-semibold">Looks like a {multiPack.qty}-pack.</span>{" "}
            Did you mean: <span className="font-semibold">{suggestion.presentationName ?? suggestion.name}</span> × {multiPack.qty}?
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={applySuggestion} className="text-xs font-semibold text-amber-700 underline hover:no-underline">Use this</button>
            <button onClick={() => setSuggestionDismissed(true)} className="text-xs text-amber-600 hover:text-amber-800">Dismiss</button>
          </div>
        </div>
      )}

      {/* Mode selector */}
      <div className="flex gap-5 flex-wrap">
        <Radio value="bundle" label="Bundle product" />
        <Radio value="single" label="Single product — add UPC" />
        <Radio value="ignored" label="Ignore — don't track" />
      </div>

      {/* Bundle builder */}
      {mode === "bundle" && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider font-mono">Bundle Components</p>
          {components.map((comp, idx) => (
            <BundleComponentRow
              key={idx}
              idx={idx}
              row={comp}
              options={componentOptions}
              onChange={(val) => updateComponent(idx, val)}
              onRemove={() => removeComponent(idx)}
              canRemove={components.length > 1}
            />
          ))}
          <button type="button" onClick={addComponent} className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium transition-colors">
            <Plus className="w-4 h-4" />Add another component
          </button>

          {/* Preview */}
          {isBundleValid && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-800 space-y-1">
              <p className="font-semibold">When 1 unit of this bundle ships, FSMS will deduct:</p>
              {components.map((c, i) => {
                const opt = componentOptions.find((o) => o.id === c.componentProductId);
                return <p key={i}>• {c.quantityPerBundle} × {opt?.presentationName ?? opt?.name ?? "?"}</p>;
              })}
            </div>
          )}
        </div>
      )}

      {/* Single / UPC input */}
      {mode === "single" && (
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider font-mono">UPC</label>
          <input
            type="text"
            value={upc}
            onChange={(e) => setUpc(e.target.value)}
            placeholder="Enter UPC…"
            className="text-sm border border-gray-300 rounded-md px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono"
          />
          {upc.length >= 8 && (
            upcMatch ? (
              <p className="text-xs text-emerald-700 flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                Matches: <span className="font-semibold">{upcMatch.productName} — {upcMatch.presentationName}</span>
              </p>
            ) : (
              <p className="text-xs text-amber-700 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                No FSMS product found with this UPC.{" "}
                <Link href="/supplier-management/products" className="underline font-semibold">Add the UPC to the Products registry first.</Link>
              </p>
            )
          )}
        </div>
      )}

      {/* Ignore reason */}
      {mode === "ignored" && (
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider font-mono">Reason (optional)</label>
          <input
            type="text"
            value={ignoredReason}
            onChange={(e) => setIgnoredReason(e.target.value)}
            placeholder="e.g. discontinued, not a Julian Bakery product, test product…"
            className="text-sm border border-gray-300 rounded-md px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
      )}

      {/* Save button + feedback */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={save}
          disabled={!canSave || saving}
          className="btn-primary text-sm px-4 py-2 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saveMsg && (
          <p className={cn("text-sm font-medium", saveMsg.ok ? "text-emerald-600" : "text-red-600")}>
            {saveMsg.text}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Bulk Ignore ──────────────────────────────────────────────────────────────

function BulkIgnoreBar({
  count,
  onConfirm,
}: { count: number; onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-md">
      <span className="text-sm text-gray-600">{count} unmatched product{count !== 1 ? "s" : ""} remaining.</span>
      {!confirming ? (
        <button onClick={() => setConfirming(true)} className="text-sm font-medium text-gray-500 hover:text-red-600 underline transition-colors ml-auto">
          Ignore all remaining →
        </button>
      ) : (
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-amber-700 font-medium">Mark all {count} as ignored?</span>
          <button onClick={() => { onConfirm(); setConfirming(false); }} className="btn-secondary text-xs px-3 py-1.5 text-red-600 border-red-200 hover:bg-red-50">Confirm</button>
          <button onClick={() => setConfirming(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type FilterTab = "unmatched" | "configured" | "ignored" | "all";
type SortOption = "shipments" | "name" | "sku";

export default function ShipstationBundlesPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [products, setProducts] = useState<SSProductRow[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, unmatched: 0, singleMatched: 0, bundle: 0, ignored: 0 });
  const [loading, setLoading] = useState(true);
  const [componentOptions, setComponentOptions] = useState<ComponentOption[]>([]);
  const [allPresentations, setAllPresentations] = useState<FsmsPresentation[]>([]);
  const [tab, setTab] = useState<FilterTab>("unmatched");
  const [sort, setSort] = useState<SortOption>("shipments");
  const [bulkIgnoring, setBulkIgnoring] = useState(false);

  useEffect(() => {
    if (authStatus === "unauthenticated") { router.push("/"); return; }
    if (authStatus === "authenticated" && (session?.user as { role?: string })?.role !== "ADMIN") {
      router.push("/dashboard"); return;
    }
  }, [authStatus, session, router]);

  const load = useCallback(async () => {
    setLoading(true);
    const [listRes, presRes] = await Promise.all([
      fetch("/api/integrations/shipstation/bundle-config"),
      fetch("/api/integrations/shipstation/bundle-config/matched-presentations"),
    ]);
    if (listRes.ok) {
      const d = await listRes.json() as { products: SSProductRow[]; summary: Summary };
      setProducts(d.products);
      setSummary(d.summary);
    }
    if (presRes.ok) {
      const d = await presRes.json() as { components: ComponentOption[]; allPresentations: FsmsPresentation[] };
      setComponentOptions(d.components);
      setAllPresentations(d.allPresentations);
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (authStatus === "authenticated") load(); }, [authStatus, load]);

  function handleSaved(id: string, newStatus: ConfigStatus) {
    setProducts((prev) => prev.map((p) => p.id === id ? { ...p, configStatus: newStatus } : p));
    setSummary((prev) => {
      const old = products.find((p) => p.id === id)?.configStatus ?? "unmatched";
      const next = { ...prev };
      if (old === "unmatched") next.unmatched = Math.max(0, next.unmatched - 1);
      else if (old === "bundle") next.bundle = Math.max(0, next.bundle - 1);
      else if (old === "single_matched") next.singleMatched = Math.max(0, next.singleMatched - 1);
      else if (old === "ignored") next.ignored = Math.max(0, next.ignored - 1);
      if (newStatus === "bundle") next.bundle++;
      else if (newStatus === "single_matched") next.singleMatched++;
      else if (newStatus === "ignored") next.ignored++;
      return next;
    });
    // Refresh component options after a single_matched save
    if (newStatus === "single_matched") {
      fetch("/api/integrations/shipstation/bundle-config/matched-presentations")
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d) { setComponentOptions(d.components); setAllPresentations(d.allPresentations); } })
        .catch(() => {});
    }
  }

  async function bulkIgnoreAll() {
    setBulkIgnoring(true);
    const unmatched = products.filter((p) => p.configStatus === "unmatched");
    for (const p of unmatched) {
      await fetch(`/api/integrations/shipstation/bundle-config/${p.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configType: "ignored", ignoredReason: "Bulk ignored" }),
      });
      handleSaved(p.id, "ignored");
    }
    setBulkIgnoring(false);
  }

  // Filter + sort
  const filtered = products.filter((p) => {
    if (tab === "unmatched") return p.configStatus === "unmatched";
    if (tab === "configured") return p.configStatus === "bundle" || p.configStatus === "single_matched";
    if (tab === "ignored") return p.configStatus === "ignored";
    return true;
  }).sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "sku") return (a.sku ?? "").localeCompare(b.sku ?? "");
    return b.shipmentsLast90Days - a.shipmentsLast90Days;
  });

  const configured = summary.singleMatched + summary.bundle + summary.ignored;
  const pct = summary.total > 0 ? Math.round((configured / summary.total) * 100) : 0;

  const TABS: { id: FilterTab; label: string; count: number }[] = [
    { id: "unmatched", label: "⚠ Unmatched", count: summary.unmatched },
    { id: "configured", label: "✓ Configured", count: summary.singleMatched + summary.bundle },
    { id: "ignored", label: "— Ignored", count: summary.ignored },
    { id: "all", label: "All", count: summary.total },
  ];

  if (authStatus === "loading") return null;

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title">Bundle Configuration</h1>
        <p className="page-subtitle">Configure how ShipStation products map to your FSMS inventory for finished goods tracking</p>
      </div>

      {/* Progress */}
      <div className="card p-4 space-y-2">
        {pct === 100 ? (
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="w-5 h-5" />
            <p className="font-semibold">All {summary.total} ShipStation products configured! Finished Goods inventory is fully accurate.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-700 font-medium">{configured} of {summary.total} products configured ({pct}%)</span>
              <span className="text-xs text-gray-400 font-mono">{summary.unmatched} remaining</span>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </>
        )}
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "Total Products", value: summary.total, color: "" },
          { label: "✓ Singles", value: summary.singleMatched, color: "text-emerald-600" },
          { label: "✓ Bundles", value: summary.bundle, color: "text-emerald-600" },
          { label: "⚠ Unmatched", value: summary.unmatched, color: "text-amber-600" },
          { label: "— Ignored", value: summary.ignored, color: "text-gray-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-3">
            <p className="text-[10px] font-mono font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${color || "text-gray-900"}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs + sort */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex border-b border-gray-200">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t.id ? "border-[#D64D4D] text-[#D64D4D]" : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="shipments">Most shipped</option>
          <option value="name">Name A→Z</option>
          <option value="sku">SKU A→Z</option>
        </select>
      </div>

      {/* Bulk ignore */}
      {tab === "unmatched" && !bulkIgnoring && (
        <BulkIgnoreBar count={summary.unmatched} onConfirm={bulkIgnoreAll} />
      )}
      {bulkIgnoring && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-700 font-medium">
          Ignoring all unmatched products…
        </div>
      )}

      {/* Product list */}
      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading products…</div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center space-y-2">
          <Package className="w-8 h-8 text-gray-300 mx-auto" />
          <p className="text-sm text-gray-500">
            {tab === "unmatched" ? "No unmatched products — all configured!" :
             tab === "configured" ? "No configured products yet." :
             tab === "ignored" ? "No ignored products." :
             "No products found."}
          </p>
          {tab === "unmatched" && summary.total > 0 && (
            <p className="text-xs text-gray-400">Switch to "All" tab to see all products.</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              componentOptions={componentOptions}
              allPresentations={allPresentations}
              onSaved={handleSaved}
            />
          ))}
        </div>
      )}
    </div>
  );
}
