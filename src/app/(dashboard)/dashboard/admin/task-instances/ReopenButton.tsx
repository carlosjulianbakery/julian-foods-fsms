"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReopenButton({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!["MISSED", "SKIPPED"].includes(status)) return null;

  async function handleReopen() {
    if (!confirm("Reopen this task?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/task-instances/${id}/reopen`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? "Failed to reopen");
        return;
      }
      router.refresh();
    } catch {
      alert("Network error — could not reopen task");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleReopen}
      disabled={busy}
      className="text-xs font-mono text-blue-600 hover:text-blue-800 disabled:opacity-50 transition-colors"
    >
      {busy ? "…" : "Reopen"}
    </button>
  );
}
