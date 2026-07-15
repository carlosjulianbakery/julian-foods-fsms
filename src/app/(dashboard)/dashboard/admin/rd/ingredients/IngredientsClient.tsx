"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface RdIngredient {
  id: string;
  name: string;
  category: string;
  unit: string;
  supplierSource: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  ingredients: RdIngredient[];
  userId: string;
}

const CATEGORY_PILLS = [
  { id: "all", label: "All" },
  { id: "ingredient", label: "Ingredient" },
  { id: "packaging", label: "Packaging" },
  { id: "other", label: "Other" },
];

const UNIT_OPTIONS = ["g", "kg", "lb", "oz", "ml", "L", "tsp", "tbsp", "cup", "each"];

const CATEGORY_DOT: Record<string, string> = {
  ingredient: "#60A5FA",
  packaging:  "#A78BFA",
  other:      "#8B8B8B",
};

const CATEGORY_LABEL: Record<string, string> = {
  ingredient: "Ingredient",
  packaging:  "Packaging",
  other:      "Other",
};

const EMPTY_FORM = { name: "", category: "ingredient", unit: "g", supplierSource: "", notes: "" };

const S = {
  card: {
    backgroundColor: "#252118",
    border: "1px solid #3D3427",
    borderRadius: 14,
    padding: "18px 20px",
    position: "relative",
    transition: "border-color 0.2s, box-shadow 0.2s",
  } as React.CSSProperties,
  input: {
    width: "100%",
    backgroundColor: "#1A1714",
    border: "1px solid #3D3427",
    borderRadius: 10,
    padding: "8px 12px",
    fontSize: 14,
    color: "#F5F0E8",
    outline: "none",
  } as React.CSSProperties,
  label: {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    color: "#A89880",
    marginBottom: 6,
  } as React.CSSProperties,
};

const focusHandlers = {
  onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = "#F59E0B";
    e.currentTarget.style.boxShadow = "0 0 0 2px rgba(245,158,11,0.15)";
  },
  onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = "#3D3427";
    e.currentTarget.style.boxShadow = "none";
  },
};

export function IngredientsClient({ ingredients }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const filtered = ingredients.filter((i) => {
    const q = debouncedSearch.toLowerCase();
    return (
      (!q || i.name.toLowerCase().includes(q) || (i.supplierSource ?? "").toLowerCase().includes(q) || (i.notes ?? "").toLowerCase().includes(q)) &&
      (categoryFilter === "all" || i.category === categoryFilter)
    );
  });

  function openNew() { setEditingId(null); setForm(EMPTY_FORM); setError(null); setShowModal(true); }
  function openEdit(i: RdIngredient) {
    setEditingId(i.id);
    setForm({ name: i.name, category: i.category, unit: i.unit, supplierSource: i.supplierSource ?? "", notes: i.notes ?? "" });
    setError(null);
    setShowModal(true);
  }
  function closeModal() { setShowModal(false); setEditingId(null); setForm(EMPTY_FORM); setError(null); }
  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Name is required."); return; }
    setSaving(true); setError(null);
    try {
      const payload = { name: form.name.trim(), category: form.category, unit: form.unit, supplierSource: form.supplierSource.trim() || null, notes: form.notes.trim() || null };
      const res = editingId
        ? await fetch(`/api/rd/ingredients/${editingId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/rd/ingredients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(await res.text());
      closeModal();
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/rd/ingredients/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Delete failed.");
    } finally { setDeletingId(null); }
  }

  return (
    <>
      {/* Header controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-6">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          {/* Search */}
          <input
            type="text"
            placeholder="Search ingredients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...S.input, maxWidth: 280 }}
            {...focusHandlers}
          />
          {/* Category pills */}
          <div className="flex gap-2 flex-wrap">
            {CATEGORY_PILLS.map((pill) => {
              const active = categoryFilter === pill.id;
              return (
                <button
                  key={pill.id}
                  onClick={() => setCategoryFilter(pill.id)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
                  style={{
                    border: `1px solid ${active ? "#F59E0B" : "#3D3427"}`,
                    color: active ? "#F59E0B" : "#A89880",
                    backgroundColor: active ? "#F59E0B15" : "transparent",
                  }}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>
        </div>
        <button
          onClick={openNew}
          className="px-4 py-2 rounded-xl text-sm font-semibold transition-colors shrink-0"
          style={{ backgroundColor: "#F59E0B", color: "#1A1714" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#FCD34D"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F59E0B"; }}
        >
          + New R&D Ingredient
        </button>
      </div>

      {/* Card grid */}
      {filtered.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-2xl"
          style={{ borderColor: "#3D3427", color: "#6B5F50" }}
        >
          <p className="text-sm font-medium">No ingredients found</p>
          <p className="text-xs mt-1">
            {search || categoryFilter !== "all" ? "Try adjusting your filters." : "Add your first R&D ingredient."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((ing) => {
            const dot = CATEGORY_DOT[ing.category] ?? "#8B8B8B";
            return (
              <div
                key={ing.id}
                style={S.card}
                className="group"
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "#F59E0B40";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 24px rgba(245,158,11,0.08)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "#3D3427";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                }}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
                    style={{ backgroundColor: dot }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm truncate" style={{ color: "#F5F0E8" }}>
                        {ing.name}
                      </p>
                      <span
                        className="shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${dot}20`, color: dot }}
                      >
                        {CATEGORY_LABEL[ing.category] ?? ing.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="text-xs font-mono px-2 py-0.5 rounded-md"
                        style={{ backgroundColor: "#2E2820", color: "#F59E0B" }}
                      >
                        {ing.unit}
                      </span>
                      {ing.supplierSource && (
                        <span className="text-xs truncate" style={{ color: "#A89880" }}>
                          {ing.supplierSource}
                        </span>
                      )}
                    </div>
                    {ing.notes && (
                      <p className="text-xs mt-2 line-clamp-2" style={{ color: "#6B5F50" }}>
                        {ing.notes}
                      </p>
                    )}
                    {/* Actions — visible on hover */}
                    <div className="flex gap-3 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEdit(ing)}
                        className="text-xs font-medium"
                        style={{ color: "#60A5FA" }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(ing.id, ing.name)}
                        disabled={deletingId === ing.id}
                        className="text-xs font-medium disabled:opacity-50"
                        style={{ color: "#F87171" }}
                      >
                        {deletingId === ing.id ? "…" : "Delete"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
          <div style={{ backgroundColor: "#252118", border: "1px solid #3D3427", borderRadius: 20, width: "100%", maxWidth: 480 }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #3D3427" }}>
              <h2 className="text-base font-semibold" style={{ color: "#F5F0E8" }}>
                {editingId ? "Edit R&D Ingredient" : "New R&D Ingredient"}
              </h2>
              <button onClick={closeModal} className="text-xl leading-none" style={{ color: "#6B5F50" }}>×</button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {error && (
                <div className="rounded-xl px-3 py-2 text-sm" style={{ backgroundColor: "#F8717115", border: "1px solid #F87171", color: "#F87171" }}>
                  {error}
                </div>
              )}
              <div>
                <label style={S.label}>Name <span style={{ color: "#F87171" }}>*</span></label>
                <input type="text" name="name" value={form.name} onChange={handleChange} required placeholder="e.g. Almond Flour" style={S.input} {...focusHandlers} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label style={S.label}>Category <span style={{ color: "#F87171" }}>*</span></label>
                  <select name="category" value={form.category} onChange={handleChange} required style={S.input} {...focusHandlers}>
                    <option value="ingredient">Ingredient</option>
                    <option value="packaging">Packaging</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label style={S.label}>Standard Unit <span style={{ color: "#F87171" }}>*</span></label>
                  <select name="unit" value={form.unit} onChange={handleChange} required style={S.input} {...focusHandlers}>
                    {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={S.label}>Supplier / Source</label>
                <input type="text" name="supplierSource" value={form.supplierSource} onChange={handleChange} placeholder="e.g. Amazon, local supplier" style={S.input} {...focusHandlers} />
              </div>
              <div>
                <label style={S.label}>Notes</label>
                <textarea name="notes" value={form.notes} onChange={handleChange} rows={3} placeholder="Additional notes…" style={{ ...S.input, resize: "vertical" }} {...focusHandlers} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-xl text-sm font-medium"
                  style={{ border: "1px solid #3D3427", color: "#A89880", backgroundColor: "transparent" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors"
                  style={{ backgroundColor: "#F59E0B", color: "#1A1714" }}
                  onMouseEnter={(e) => { if (!saving) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#FCD34D"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F59E0B"; }}
                >
                  {saving ? "Saving…" : editingId ? "Save Changes" : "Add Ingredient"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
