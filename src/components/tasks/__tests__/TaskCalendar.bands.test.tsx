import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { TaskCalendar } from "@/components/tasks/TaskCalendar";
import type { TaskInstance } from "@/components/tasks/MyTasksClient";

const TODAY = "2026-11-19";
const WEEK = "2026-11-16"; // Mon — the visible week is 11/16–11/19 (Mon–Thu by default)

function inst(over: Partial<TaskInstance>): TaskInstance {
  return {
    id: "i",
    ruleTitle: "Task",
    facilityId: "fac-jb",
    facilityName: "Julian Bakery",
    ownerId: "user-ivan",
    ownerUserId: null,
    ownerName: "Ivan Torres",
    formKey: "manual",
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

// Window 11/01 → due 11/30: the rendered week holds neither date
const monthly = (over: Partial<TaskInstance> = {}) =>
  inst({ id: "monthly", ruleTitle: "Monthly Cleaning", dueDate: "2026-11-30", windowStart: "2026-11-01", ...over });

function renderWeek(instances: TaskInstance[]): string {
  return renderToStaticMarkup(
    <TaskCalendar initialInstances={instances} initialWeekStart={WEEK} today={TODAY} role="ADMIN" userId="admin-1" viewMode="everyone" selectedOwnerId="" />,
  );
}
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("TaskCalendar week view — band in a week containing neither window start nor due date", () => {
  it("draws the band on every visible day, labels it on the first one, and adds no chip", () => {
    const html = renderWeek([monthly()]);

    expect(count(html, 'title="Monthly Cleaning"')).toBe(4); // Mon, Tue, Wed, Thu
    expect(count(html, ">Monthly Cleaning</span>")).toBe(1); // label only on Monday
    expect(html.indexOf(">Monthly Cleaning</span>")).toBeLessThan(html.indexOf(">11/17<"));
    expect(html.indexOf(">Monthly Cleaning</span>")).toBeGreaterThan(html.indexOf(">11/16<"));
    expect(html).not.toContain('<p class="truncate leading-tight">Monthly Cleaning</p>'); // the chip belongs to 11/30
    expect(count(html, "bg-gray-300")).toBe(4);
    expect(html).not.toContain("bg-blue-400");
  });

  it("is blue when the task is in progress", () => {
    const html = renderWeek([monthly({ status: "IN_PROGRESS" })]);
    expect(count(html, "bg-blue-400")).toBe(4);
    expect(html).not.toContain("bg-gray-300");
  });

  it.each(["DONE", "SKIPPED", "MISSED"])("draws nothing once the task is %s", (status) => {
    expect(renderWeek([monthly({ status })])).not.toContain('title="Monthly Cleaning"');
  });

  it("a task without a window draws no band, and the day's chips are unchanged by a band", () => {
    const daily = inst({ id: "daily", ruleTitle: "Sanitizer check", dueDate: "2026-11-18" });
    const without = renderWeek([daily]);
    const withBand = renderWeek([daily, monthly()]);

    const chip = '<p class="truncate leading-tight">Sanitizer check</p>';
    expect(count(without, chip)).toBe(1);
    expect(count(withBand, chip)).toBe(1);
    expect(without).not.toContain("rounded-full opacity-50");
    expect(count(withBand, 'title="Sanitizer check"')).toBe(0);
  });

  it("stacks at most three bands per day and shows +n for the rest", () => {
    const five = ["A", "B", "C", "D", "E"].map((n) => monthly({ id: n, ruleTitle: `Window ${n}` }));
    const html = renderWeek(five);

    expect(count(html, 'title="Window A"')).toBe(4);
    expect(count(html, 'title="Window C"')).toBe(4);
    expect(html).not.toContain('title="Window D"');
    expect(count(html, ">+2</span>")).toBe(4);
  });
});
