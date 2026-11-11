"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

interface Props {
  facilities: { id: string; name: string }[];
  users: { id: string; name: string }[];
  currentFacilityId: string;
  currentOwnerId: string;
  currentStatus: string;
  currentFrom: string;
  currentTo: string;
}

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "overdue", label: "Overdue" },
  { value: "UPCOMING", label: "Upcoming" },
  { value: "DUE_TODAY", label: "Due Today" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "DONE", label: "Done" },
  { value: "SKIPPED", label: "Skipped" },
  { value: "MISSED", label: "Missed" },
];

export function TaskInstanceFilters({
  facilities,
  users,
  currentFacilityId,
  currentOwnerId,
  currentStatus,
  currentFrom,
  currentTo,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`?${params.toString()}`);
    },
    [router, searchParams]
  );

  return (
    <div className="card p-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">Facility</label>
          <select
            className="text-sm border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2 bg-white dark:bg-gray-800"
            value={currentFacilityId}
            onChange={(e) => updateParam("facilityId", e.target.value)}
          >
            <option value="">All facilities</option>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">Owner</label>
          <select
            className="text-sm border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2 bg-white dark:bg-gray-800"
            value={currentOwnerId}
            onChange={(e) => updateParam("ownerId", e.target.value)}
          >
            <option value="">All owners</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">Status</label>
          <select
            className="text-sm border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2 bg-white dark:bg-gray-800"
            value={currentStatus}
            onChange={(e) => updateParam("status", e.target.value)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">From</label>
          <input
            type="date"
            className="text-sm border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2 bg-white dark:bg-gray-800"
            value={currentFrom}
            onChange={(e) => updateParam("from", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">To</label>
          <input
            type="date"
            className="text-sm border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2 bg-white dark:bg-gray-800"
            value={currentTo}
            onChange={(e) => updateParam("to", e.target.value)}
          />
        </div>
        <button
          onClick={() => router.push("?")}
          className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline self-end pb-2"
        >
          Clear filters
        </button>
      </div>
    </div>
  );
}
