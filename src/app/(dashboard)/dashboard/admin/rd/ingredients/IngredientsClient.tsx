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

const CATEGORY_BADGE: Record<string, string> = {
  ingredient: "bg-blue-100 text-blue-700",
  packaging: "bg-purple-100 text-purple-700",
  other: "bg-gray-100 text-gray-600",
};

const CATEGORY_LABELS: Record<string, string> = {
  ingredient: "Ingredient",
  packaging: "Packaging",
  other: "Other",
};

const EMPTY_FORM = {
  name: "",
  category: "ingredient",
  unit: "g",
  supplierSource: "",
  notes: "",
};

export function IngredientsClient({ ingredients, userId }: Props) {
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
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const filtered = ingredients.filter((i) => {
    const q = debouncedSearch.toLowerCase();
    const matchSearch =
      !q ||
      i.name.toLowerCase().includes(q) ||
      (i.supplierSource ?? "").toLowerCase().includes(q) ||
      (i.notes ?? "").toLowerCase().includes(q);
    const matchCategory = categoryFilter === "all" || i.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  function openNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowModal(true);
  }

  function openEdit(ingredient: RdIngredient) {
    setEditingId(ingredient.id);
    setForm({
      name: ingredient.name,
      category: ingredient.category,
      unit: ingredient.unit,
      supplierSource: ingredient.supplierSource ?? "",
      notes: ingredient.notes ?? "",
    });
    setError(null);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        unit: form.unit,
        supplierSource: form.supplierSource.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editingId) {
        const res = await fetch(`/api/rd/ingredients/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await res.text());
      } else {
        const res = await fetch("/api/rd/ingredients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await res.text());
      }
      closeModal();
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
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
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <div className="card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 flex-1">
            <input
              type="text"
              placeholder="Search by name, supplier, or notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20 focus:border-[#C41E3A] w-full sm:max-w-xs"
            />
            <div className="flex gap-2 flex-wrap">
              {CATEGORY_PILLS.map((pill) => (
                <button
                  key={pill.id}
                  onClick={() => setCategoryFilter(pill.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                    categoryFilter === pill.id
                      ? "bg-[#C41E3A] text-white border-[#C41E3A]"
                      : "bg-white text-gray-600 border-gray-200 hover:border-[#C41E3A]/50 hover:text-[#C41E3A]"
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>
          <button onClick={openNew} className="btn-primary whitespace-nowrap">
            + New R&D Ingredient
          </button>
        </div>

        {filtered.length === 0 ? (
          <div className="card p-12 flex flex-col items-center gap-3 border-2 border-dashed border-gray-200">
            <p className="text-sm text-gray-500 font-medium">No ingredients found</p>
            <p className="text-xs text-gray-400">
              {search || categoryFilter !== "all"
                ? "Try adjusting your search or filter."
                : "Add your first R&D ingredient to get started."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Supplier / Source</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((ingredient) => (
                  <tr key={ingredient.id} className="hover:bg-gray-50/50 group">
                    <td className="py-3 px-3 font-medium text-gray-900">{ingredient.name}</td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_BADGE[ingredient.category] ?? "bg-gray-100 text-gray-600"}`}>
                        {CATEGORY_LABELS[ingredient.category] ?? ingredient.category}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-gray-700">{ingredient.unit}</td>
                    <td className="py-3 px-3 text-gray-600">{ingredient.supplierSource ?? <span className="text-gray-300">—</span>}</td>
                    <td className="py-3 px-3 text-gray-500 max-w-[200px] truncate">{ingredient.notes ?? <span className="text-gray-300">—</span>}</td>
                    <td className="py-3 px-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEdit(ingredient)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(ingredient.id, ingredient.name)}
                          disabled={deletingId === ingredient.id}
                          className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
                        >
                          {deletingId === ingredient.id ? "..." : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">
                {editingId ? "Edit R&D Ingredient" : "New R&D Ingredient"}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Name <span className="text-[#C41E3A]">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  required
                  placeholder="e.g. Almond Flour"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20 focus:border-[#C41E3A]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Category <span className="text-[#C41E3A]">*</span>
                  </label>
                  <select
                    name="category"
                    value={form.category}
                    onChange={handleChange}
                    required
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20 focus:border-[#C41E3A]"
                  >
                    <option value="ingredient">Ingredient</option>
                    <option value="packaging">Packaging</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Standard Unit <span className="text-[#C41E3A]">*</span>
                  </label>
                  <select
                    name="unit"
                    value={form.unit}
                    onChange={handleChange}
                    required
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20 focus:border-[#C41E3A]"
                  >
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Supplier / Source</label>
                <input
                  type="text"
                  name="supplierSource"
                  value={form.supplierSource}
                  onChange={handleChange}
                  placeholder="e.g. Amazon, sample from supplier, local health store"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20 focus:border-[#C41E3A]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Additional notes about this ingredient..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20 focus:border-[#C41E3A] resize-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-[#C41E3A] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a3192f] disabled:opacity-50 transition-colors"
                >
                  {saving ? "Saving..." : editingId ? "Save Changes" : "Add Ingredient"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
