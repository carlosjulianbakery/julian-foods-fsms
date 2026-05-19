"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getRoleColor } from "@/lib/utils";
import { useToast } from "@/components/ui/Toaster";
import { ChevronDown } from "lucide-react";

interface Props {
  userId: string;
  currentRole: string;
  isActive: boolean;
  isAdmin: boolean;
  isSelf: boolean;
  allowedRoles?: string[];
}

const ALL_ROLES = ["OPERATOR", "SUPERVISOR", "ADMIN"];

export function UserRoleEditor({
  userId,
  currentRole,
  isActive,
  isAdmin,
  isSelf,
  allowedRoles,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function update(patch: { role?: string; active?: boolean }) {
    setLoading(true);
    setOpen(false);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast("User updated.", "success");
      router.refresh();
    } catch (err: any) {
      toast(err.message ?? "Update failed.", "error");
    } finally {
      setLoading(false);
    }
  }

  if (!isAdmin || isSelf) {
    return <span className={`badge ${getRoleColor(currentRole)}`}>{currentRole}</span>;
  }

  const assignableRoles = (allowedRoles ?? ALL_ROLES).filter((r) => r !== currentRole);

  return (
    <div className="relative flex items-center gap-2 shrink-0">
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className={`badge ${getRoleColor(currentRole)} cursor-pointer flex items-center gap-1 pr-1.5`}
      >
        {currentRole} <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-lg border border-gray-200 shadow-lg py-1 min-w-40">
            <p className="px-3 py-1 text-xs font-medium text-gray-400 border-b border-gray-100 mb-1">
              Change Role
            </p>
            {assignableRoles.map((role) => (
              <button
                key={role}
                onClick={() => update({ role })}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors"
              >
                Set {role}
              </button>
            ))}
            <div className="border-t border-gray-100 mt-1 pt-1">
              <button
                onClick={() => update({ active: !isActive })}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors ${
                  isActive ? "text-red-600" : "text-brand-600"
                }`}
              >
                {isActive ? "Deactivate user" : "Activate user"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
