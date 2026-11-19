import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { MyTasksClient, type TaskInstance } from "@/components/tasks/MyTasksClient";
import { canSkipTask } from "@/lib/task-actions";

const TODAY = "2026-11-19";

function inst(over: Partial<TaskInstance>): TaskInstance {
  return {
    id: "i",
    ruleTitle: "Task",
    facilityId: "fac-jb",
    facilityName: "Julian Bakery",
    ownerId: "user-ivan",
    ownerUserId: null,
    ownerName: "Ivan Torres",
    formKey: "monthly_cleaning",
    label: "",
    dueDate: TODAY,
    status: "UPCOMING",
    source: "MANUAL",
    needsAdminReview: false,
    reviewReason: null,
    doneByName: null,
    doneAt: null,
    completedLate: false,
    daysLate: null,
    missedReason: null,
    skipReason: null,
    skippedByName: null,
    skippedAt: null,
    windowStart: null,
    progress: null,
    ...over,
  };
}

const periodTask = (status = "UPCOMING") =>
  inst({ id: "monthly", ruleTitle: "Monthly Cleaning", dueDate: "2026-11-30", windowStart: "2026-11-01", status });

/** Renders the dashboard and returns only the "Open this period" section's markup. */
function periodSection(role: string, userId: string, windowInstances: TaskInstance[], instances: TaskInstance[] = []): string {
  const html = renderToStaticMarkup(
    <MyTasksClient
      instances={instances}
      skippedInstances={[]}
      calendarInstances={[]}
      calendarWeekStart="2026-11-16"
      windowInstances={windowInstances}
      role={role}
      userId={userId}
      firstName="Test"
      owners={[]}
      today={TODAY}
      facilitySyncInfo={[]}
    />,
  );
  const start = html.indexOf("Open this period");
  const end = html.indexOf("Task Schedule");
  return start === -1 ? "" : html.slice(start, end);
}

// The "⋯" trigger of the shared DotsMenu. On a period card its only entry is "Skip task".
const MENU = 'aria-label="More options"';
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe('"Open this period" card — Skip menu', () => {
  it("admin sees the Skip menu on an open-period card (Everyone view: a non-admin owner's task)", () => {
    const html = periodSection("ADMIN", "user-ivan", [periodTask()]);
    expect(html).toContain("Monthly Cleaning");
    expect(count(html, MENU)).toBe(1);
  });

  it("non-admin (the task's own owner) does not", () => {
    const html = periodSection("SUPERVISOR", "user-ivan", [periodTask()]);
    expect(html).toContain("Monthly Cleaning");
    expect(html).toContain("Start");
    expect(count(html, MENU)).toBe(0);
  });

  it("IN_PROGRESS period task still offers Skip to an admin — same as a daily task", () => {
    const html = periodSection("ADMIN", "user-ivan", [periodTask("IN_PROGRESS")]);
    expect(html).toContain("Continue");
    expect(count(html, MENU)).toBe(1);
  });

  it("DONE period task offers no Skip — same as a daily task", () => {
    expect(count(periodSection("ADMIN", "user-ivan", [periodTask("DONE")]), MENU)).toBe(0);
  });

  it("one menu per card", () => {
    const two = [periodTask(), { ...periodTask(), id: "second", ruleTitle: "Quarterly Deep Clean" }];
    expect(count(periodSection("ADMIN", "user-ivan", two), MENU)).toBe(2);
  });
});

describe("daily card and period card follow one rule", () => {
  it("the daily card shows its menu for exactly the statuses the period card does", () => {
    for (const status of ["DUE_TODAY", "IN_PROGRESS"]) {
      const daily = inst({ id: "daily", ruleTitle: "Sanitizer check", formKey: "manual", status });
      const render = (role: string) =>
        renderToStaticMarkup(
          <MyTasksClient instances={[daily]} skippedInstances={[]} calendarInstances={[]} calendarWeekStart="2026-11-16"
            windowInstances={[]} role={role} userId="user-ivan" firstName="Test" owners={[]} today={TODAY} facilitySyncInfo={[]} />,
        );
      expect(count(render("ADMIN"), MENU)).toBe(1);
      expect(count(render("SUPERVISOR"), MENU)).toBe(0);
    }
  });

  it("canSkipTask: admin only, never DONE or SKIPPED", () => {
    for (const s of ["UPCOMING", "DUE_TODAY", "OVERDUE", "IN_PROGRESS", "MISSED"]) expect(canSkipTask("ADMIN", s)).toBe(true);
    for (const s of ["DONE", "SKIPPED"]) expect(canSkipTask("ADMIN", s)).toBe(false);
    for (const s of ["UPCOMING", "IN_PROGRESS", "DONE"]) expect(canSkipTask("SUPERVISOR", s)).toBe(false);
  });
});
