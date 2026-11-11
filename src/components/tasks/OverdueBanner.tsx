"use client";
import { useState, useEffect } from "react";
import { X, AlertTriangle } from "lucide-react";
import Link from "next/link";

interface Props {
  userOverdueCount: number;
  teamOverdueCount?: number; // admin only
}

export function OverdueBanner({ userOverdueCount, teamOverdueCount }: Props) {
  const [userDismissed, setUserDismissed] = useState(false);
  const [teamDismissed, setTeamDismissed] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("tasks-overdue-dismissed")) setUserDismissed(true);
      if (sessionStorage.getItem("tasks-team-overdue-dismissed")) setTeamDismissed(true);
    } catch {}
  }, []);

  function dismissUser() {
    try { sessionStorage.setItem("tasks-overdue-dismissed", "1"); } catch {}
    setUserDismissed(true);
  }

  function dismissTeam() {
    try { sessionStorage.setItem("tasks-team-overdue-dismissed", "1"); } catch {}
    setTeamDismissed(true);
  }

  return (
    <>
      {userOverdueCount > 0 && !userDismissed && (
        <div className="max-w-5xl mb-3 flex items-center gap-3 rounded-lg bg-red-600 text-white px-4 py-3 text-sm font-medium shadow-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">
            You have{" "}
            <strong>{userOverdueCount} overdue task{userOverdueCount !== 1 ? "s" : ""}</strong>.{" "}
            <Link href="#my-tasks" className="underline hover:no-underline">
              View now
            </Link>
          </span>
          <button
            onClick={dismissUser}
            aria-label="Dismiss"
            className="shrink-0 rounded p-0.5 hover:bg-red-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {(teamOverdueCount ?? 0) > 0 && !teamDismissed && (
        <div className="max-w-5xl mb-3 flex items-center gap-3 rounded-lg bg-orange-500 text-white px-4 py-3 text-sm font-medium shadow-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">
            Team:{" "}
            <strong>{teamOverdueCount} overdue task{teamOverdueCount !== 1 ? "s" : ""}</strong> across all users.{" "}
            <Link
              href="/dashboard/admin/task-instances?status=overdue"
              className="underline hover:no-underline"
            >
              View all
            </Link>
          </span>
          <button
            onClick={dismissTeam}
            aria-label="Dismiss"
            className="shrink-0 rounded p-0.5 hover:bg-orange-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
}
