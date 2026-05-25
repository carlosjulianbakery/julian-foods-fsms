"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toaster";

export function DeleteRecordButton({ recordId }: { recordId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      const res = await fetch(`/api/records/${recordId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast("Record archived.", "success");
      router.push("/records");
    } catch {
      toast("Failed to delete record.", "error");
      setLoading(false);
      setOpen(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary text-red-600 border-red-200 hover:bg-red-50">
        <Trash2 className="w-4 h-4" /> Archive
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={handleDelete}
        title="Archive Record"
        message="This record will be archived and hidden from the main view. This action can be reversed by an admin."
        confirmLabel="Archive"
        loading={loading}
      />
    </>
  );
}
