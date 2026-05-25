"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getStatusColor } from "@/lib/utils";
import { useToast } from "@/components/ui/Toaster";
import { ChevronDown } from "lucide-react";

const TRANSITIONS: Record<string, string[]> = {
  PENDING: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "PENDING", "CANCELLED"],
  COMPLETED: [],
  OVERDUE: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  CANCELLED: [],
};

interface Props {
  taskId: string;
  currentStatus: string;
  canEdit: boolean;
}

export function TaskStatusUpdater({ taskId, currentStatus, canEdit }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const transitions = TRANSITIONS[currentStatus] ?? [];

  async function updateStatus(status: string) {
    setLoading(true);
    setOpen(false);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      toast(`Task marked as ${status.toLowerCase().replace("_", " ")}.`, "success");
      router.refresh();
    } catch {
      toast("Failed to update status.", "error");
    } finally {
      setLoading(false);
    }
  }

  if (!canEdit || transitions.length === 0) {
    return <span className={`badge ${getStatusColor(currentStatus)}`}>{currentStatus.replace("_", " ")}</span>;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className={`badge ${getStatusColor(currentStatus)} cursor-pointer flex items-center gap-1 pr-1.5`}
      >
        {currentStatus.replace("_", " ")}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-lg border border-gray-200 shadow-lg py-1 min-w-36">
            {transitions.map((s) => (
              <button
                key={s}
                onClick={() => updateStatus(s)}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors"
              >
                → {s.replace("_", " ")}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
