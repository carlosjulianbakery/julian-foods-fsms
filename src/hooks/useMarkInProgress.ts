"use client";

import { useCallback, useEffect, useRef } from "react";

interface Props {
  taskId: string | null | undefined;
  formKey: string;
  facilityName: string;
  /** Due date (YYYY-MM-DD) of the period this form is for, when the form has periods. */
  dueDate?: string | null;
}

/**
 * Returns a stable markInProgress() function that fires exactly once per form session.
 * Call it on the first real user edit (not on mount, not on draft load).
 * Fire-and-forget: a network failure never throws or blocks the caller.
 * On success, dispatches "task-action" so the dashboard refreshes.
 */
export function useMarkInProgress({ taskId, formKey, facilityName, dueDate }: Props) {
  const firedRef = useRef(false);
  const taskIdRef = useRef(taskId);
  const formKeyRef = useRef(formKey);
  const facilityNameRef = useRef(facilityName);

  useEffect(() => { taskIdRef.current = taskId; }, [taskId]);
  useEffect(() => { formKeyRef.current = formKey; }, [formKey]);
  useEffect(() => { facilityNameRef.current = facilityName; }, [facilityName]);
  const dueDateRef = useRef(dueDate);
  useEffect(() => { dueDateRef.current = dueDate; }, [dueDate]);

  const markInProgress = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    const tid = taskIdRef.current;
    const fk = formKeyRef.current;
    const fn = facilityNameRef.current;

    const url = tid
      ? `/api/task-instances/${tid}/start`
      : "/api/task-instances/mark-in-progress";

    const opts: RequestInit = tid
      ? { method: "POST" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ formKey: fk, facilityName: fn, ...(dueDateRef.current ? { dueDate: dueDateRef.current } : {}) }),
        };

    fetch(url, opts)
      .then((res) => { if (res.ok) window.dispatchEvent(new CustomEvent("task-action")); })
      .catch(() => {});
  }, []); // stable — reads current values from refs

  return markInProgress;
}
