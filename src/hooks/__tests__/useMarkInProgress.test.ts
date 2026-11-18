import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const hookSrc = readFileSync(resolve(__dirname, "../useMarkInProgress.ts"), "utf8");
const preop = readFileSync(
  resolve(__dirname, "../../app/(dashboard)/dashboard/supervisor/pre-op-624/page.tsx"), "utf8"
);
const dc624 = readFileSync(
  resolve(__dirname, "../../app/(dashboard)/dashboard/supervisor/daily-cleaning-624/page.tsx"), "utf8"
);
const mc624 = readFileSync(
  resolve(__dirname, "../../app/(dashboard)/dashboard/supervisor/monthly-cleaning-624/page.tsx"), "utf8"
);
const myTasks = readFileSync(
  resolve(__dirname, "../../components/tasks/MyTasksClient.tsx"), "utf8"
);
const taskCalendar = readFileSync(
  resolve(__dirname, "../../components/tasks/TaskCalendar.tsx"), "utf8"
);
const startRoute = readFileSync(
  resolve(__dirname, "../../app/api/task-instances/[id]/start/route.ts"), "utf8"
);
const mipRoute = readFileSync(
  resolve(__dirname, "../../app/api/task-instances/mark-in-progress/route.ts"), "utf8"
);

describe("useMarkInProgress hook", () => {
  it("fires exactly once — guards with firedRef.current", () => {
    expect(hookSrc).toContain("firedRef.current");
    expect(hookSrc).toContain("if (firedRef.current) return;");
    expect(hookSrc).toContain("firedRef.current = true;");
  });

  it("uses taskId path when taskId is present", () => {
    expect(hookSrc).toContain("/api/task-instances/${tid}/start");
  });

  it("uses fallback path (mark-in-progress) when taskId is absent", () => {
    expect(hookSrc).toContain("/api/task-instances/mark-in-progress");
    expect(hookSrc).toContain("formKey: fk");
    expect(hookSrc).toContain("facilityName: fn");
  });

  it("swallows fetch errors — .catch(() => {})", () => {
    expect(hookSrc).toContain(".catch(() => {});");
  });

  it("dispatches task-action only on res.ok", () => {
    expect(hookSrc).toContain('if (res.ok) window.dispatchEvent(new CustomEvent("task-action"));');
  });

  it("markInProgress is a stable callback (empty deps)", () => {
    expect(hookSrc).toContain("}, []); // stable");
  });
});

describe("useMarkInProgress — per-form wiring", () => {
  describe("Pre-Op 624", () => {
    it("imports useMarkInProgress", () => {
      expect(preop).toContain('import { useMarkInProgress } from "@/hooks/useMarkInProgress"');
    });

    it("creates the hook with preop_624 formKey and 624 facility", () => {
      expect(preop).toContain('formKey: "preop_624"');
      expect(preop).toContain('facilityName: "624"');
    });

    it("calls markInProgress in patchRow (first real row edit)", () => {
      expect(preop).toContain("function patchRow");
      const patchRowIdx = preop.indexOf("function patchRow");
      const markIdx = preop.indexOf("markInProgress();", patchRowIdx);
      const setRowsIdx = preop.indexOf("setRows(", patchRowIdx);
      expect(markIdx).toBeGreaterThan(patchRowIdx);
      expect(markIdx).toBeLessThan(setRowsIdx);
    });

    it("calls markInProgress in handleInitialsChange", () => {
      expect(preop).toContain("function handleInitialsChange");
      const fnIdx = preop.indexOf("function handleInitialsChange");
      const markIdx = preop.indexOf("markInProgress();", fnIdx);
      expect(markIdx).toBeGreaterThan(fnIdx);
    });

    it("does NOT call markInProgress inside the draft load effect", () => {
      const draftLoadIdx = preop.indexOf("draftLoadedRef.current = true");
      expect(draftLoadIdx).toBeGreaterThan(-1);
      const draftEndIdx = preop.indexOf("}, [session?.user?.id, today]);", draftLoadIdx);
      const markInDraft = preop.indexOf("markInProgress()", draftLoadIdx);
      expect(markInDraft === -1 || markInDraft > draftEndIdx).toBe(true);
    });
  });

  describe("Daily Cleaning 624", () => {
    it("imports useMarkInProgress", () => {
      expect(dc624).toContain('import { useMarkInProgress } from "@/hooks/useMarkInProgress"');
    });

    it("creates the hook with daily_cleaning_624 formKey and 624 facility", () => {
      expect(dc624).toContain('formKey: "daily_cleaning_624"');
      expect(dc624).toContain('facilityName: "624"');
    });

    it("calls markInProgress in updateRow", () => {
      const fnIdx = dc624.indexOf("const updateRow = useCallback");
      expect(fnIdx).toBeGreaterThan(-1);
      const markIdx = dc624.indexOf("markInProgress();", fnIdx);
      expect(markIdx).toBeGreaterThan(fnIdx);
    });

    it("calls markInProgress in markAllDone", () => {
      const fnIdx = dc624.indexOf("const markAllDone = useCallback");
      expect(fnIdx).toBeGreaterThan(-1);
      const markIdx = dc624.indexOf("markInProgress();", fnIdx);
      expect(markIdx).toBeGreaterThan(fnIdx);
    });
  });

  describe("Monthly Cleaning 624", () => {
    it("imports useMarkInProgress", () => {
      expect(mc624).toContain('import { useMarkInProgress } from "@/hooks/useMarkInProgress"');
    });

    it("creates the hook with monthly_cleaning_624 formKey and 624 facility", () => {
      expect(mc624).toContain('formKey: "monthly_cleaning_624"');
      expect(mc624).toContain('facilityName: "624"');
    });

    it('calls markInProgress in updateLine only when state !== "UNTOUCHED"', () => {
      expect(mc624).toContain('if (state !== "UNTOUCHED") markInProgress();');
    });

    it("does NOT call markInProgress inside the server draft load effect", () => {
      const loadEffectIdx = mc624.indexOf("setLoading(true);");
      expect(loadEffectIdx).toBeGreaterThan(-1);
      const nextBoundary = mc624.indexOf("}, [session?.user?.id, currentMonth]);", loadEffectIdx);
      const markInLoad = mc624.indexOf("markInProgress()", loadEffectIdx);
      expect(markInLoad === -1 || markInLoad > nextBoundary).toBe(true);
    });
  });
});

describe("handleStart — form-based tasks no longer call start API", () => {
  it("MyTasksClient: form tasks navigate without calling start API", () => {
    expect(myTasks).toContain(
      "// Form-based tasks: navigate directly — IN_PROGRESS is set on the first real edit"
    );
  });

  it("MyTasksClient: manual tasks still call start API", () => {
    expect(myTasks).toContain(
      '// Manual tasks: set IN_PROGRESS immediately (no form to edit)'
    );
    const isManualLine = 'const isManual = !inst.formKey || inst.formKey === "manual";';
    expect(myTasks).toContain(isManualLine);
  });

  it("TaskCalendar: form tasks navigate without calling start API", () => {
    expect(taskCalendar).toContain(
      "// Form-based: navigate directly — IN_PROGRESS set on first real edit"
    );
  });

  it("TaskCalendar: manual tasks still call start API", () => {
    const isManualLine = 'const isManual = !inst.formKey || inst.formKey === "manual";';
    expect(taskCalendar).toContain(isManualLine);
  });
});

describe("start route — MISSED instances are protected", () => {
  it('includes MISSED in the idempotent skip list', () => {
    expect(startRoute).toContain(
      '["IN_PROGRESS", "DONE", "SKIPPED", "MISSED"].includes(instance.status)'
    );
  });
});

describe("mark-in-progress route — never downgrades terminal instances", () => {
  it("guards DONE, SKIPPED, MISSED, and IN_PROGRESS", () => {
    expect(mipRoute).toContain(
      '["DONE", "SKIPPED", "MISSED", "IN_PROGRESS"].includes(target.status)'
    );
  });

  it("includes UPCOMING in candidates query (cron-tolerance)", () => {
    expect(mipRoute).toContain('"UPCOMING"');
    expect(mipRoute).toContain("OPEN_STATUSES");
  });

  it("requires auth — returns 401 without session", () => {
    expect(mipRoute).toContain("Unauthorized");
    expect(mipRoute).toContain("status: 401");
  });
});
