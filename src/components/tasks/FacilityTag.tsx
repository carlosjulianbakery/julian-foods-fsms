"use client";

export function FacilityTag({ name }: { name: string | null }) {
  return name ? (
    <span className="inline-flex items-center self-start mt-0.5 text-[9px] px-1 py-0.5 rounded bg-indigo-100 text-indigo-600 leading-none shrink-0">
      {name}
    </span>
  ) : (
    <span className="inline-flex items-center self-start mt-0.5 text-[9px] px-1 py-0.5 rounded bg-gray-100 text-gray-500 leading-none shrink-0">
      All facilities
    </span>
  );
}
