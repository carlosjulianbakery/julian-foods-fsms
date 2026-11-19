import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/completedTasks", () => ({ getCompletedTaskIds: vi.fn(() => new Set<string>()), markTaskCompleted: vi.fn() }));

import { getCompletedTaskIds } from "@/lib/completedTasks";
import { MyTasksClient, type TaskInstance } from "@/components/tasks/MyTasksClient";
import { DayPanel } from "@/components/tasks/TaskCalendar";
import { sortTasks } from "@/lib/task-order";

const TODAY = "2026-11-18";
const justCompleted = getCompletedTaskIds as unknown as ReturnType<typeof vi.fn>;

function inst(id: string, ruleTitle: string, rank: number, over: Partial<TaskInstance> = {}): TaskInstance {
  return {
    id, ruleTitle, facilityId: "fac-jb", facilityName: "Julian Bakery", ownerId: "user-ivan", ownerUserId: null, ownerName: "Ivan Torres",
    formKey: "manual", label: "", dueDate: TODAY, status: "DUE_TODAY", source: "SCHEDULE", needsAdminReview: false, reviewReason: null,
    doneByName: null, doneAt: null, completedLate: false, daysLate: null, missedReason: null, skipReason: null, skippedByName: null, skippedAt: null,
    windowStart: null, progress: null,
    ruleId: `rule-${rank}`, ruleSortOrder: rank, ruleCreatedAt: "2026-11-11T19:55:00.000Z", sortKey: null, createdAt: "2026-11-13T20:28:23.786Z",
    ...over,
  };
}
const done = (i: TaskInstance): TaskInstance => ({ ...i, status: "DONE", doneAt: "2026-11-18T17:05:00.000Z", doneByName: "Ivan Torres" });

const PREOP = inst("preop", "Pre-Op Inspection", 10);
const PREMIX = inst("premix", "Batch Sheet - Julian Bakery", 20, { formKey: "batch_sheet", label: "PreMix Powder - Egg Chocolate (3 Bowls)", sortKey: 0 });
const GRANOLA = inst("granola", "Batch Sheet - Julian Bakery", 20, { formKey: "batch_sheet", label: "ProGranola - Chocolate (50 Bowls)", sortKey: 1 });
const CLEANING = inst("cleaning", "Daily Cleaning", 30);

// Messages that were briefly shown under the banner and must not come back
const REMOVED_ALL_DONE_MSG = "All tasks for today are done.";
const REMOVED_NO_TASKS_MSG = "No tasks to do today.";

interface View { role?: string; userId?: string; windowInstances?: TaskInstance[] }
/** Renders the dashboard and returns the banner + list area above the Task Schedule, and the banner alone. */
function dashboard(instances: TaskInstance[], view: View = {}) {
  const html = renderToStaticMarkup(
    <MyTasksClient instances={instances} skippedInstances={[]} calendarInstances={[]} calendarWeekStart="2026-11-16"
      windowInstances={view.windowInstances ?? []} role={view.role ?? "SUPERVISOR"} userId={view.userId ?? "user-ivan"}
      firstName="Ivan" owners={[]} today={TODAY} facilitySyncInfo={[]} />,
  );
  const above = html.slice(0, html.indexOf("Task Schedule"));
  return { above, list: above.slice(above.indexOf("</p></div>")), html };
}
const order = (html: string, texts: string[]) =>
  texts.map((t) => ({ t, at: html.indexOf(t) })).filter((x) => x.at !== -1).sort((a, b) => a.at - b.at).map((x) => x.t);

beforeEach(() => justCompleted.mockReturnValue(new Set<string>()));

describe("dashboard list above the Task Schedule — completed tasks are not listed", () => {
  it("a completed task is not rendered; open tasks still are, in the same work order", () => {
    const { above } = dashboard([done(PREOP), PREMIX, done(GRANOLA), CLEANING]);
    expect(above).not.toContain("ProGranola - Chocolate");
    expect(above).not.toContain(">Done<");
    expect(order(above, ["Pre-Op Inspection", "PreMix Powder - Egg Chocolate", "ProGranola - Chocolate", "Daily Cleaning"]))
      .toEqual(["PreMix Powder - Egg Chocolate", "Daily Cleaning"]);
  });

  it("the banner still counts completed tasks: 2 of 4 done, 2 remaining", () => {
    const { above } = dashboard([done(PREOP), PREMIX, done(GRANOLA), CLEANING]);
    expect(above).toContain("2 of 4 done, 2 remaining");
  });

  it.each([
    ["supervisor", { role: "SUPERVISOR" }],
    ["admin, My Tasks (their own tasks)", { role: "ADMIN", userId: "user-ivan" }],
  ])("same for %s", (_name, view) => {
    const { above } = dashboard([done(PREOP), CLEANING], view);
    expect(above).toContain("Daily Cleaning");
    expect(above).not.toContain(">Done<");
  });
});

describe("nothing left to do — the banner is the only message", () => {
  it("all done: the banner says so and no second message is added under it", () => {
    const { above } = dashboard([done(PREOP), done(PREMIX), done(GRANOLA), done(CLEANING)]);
    expect(above).toContain("All tasks complete.");
    expect(above).toContain("All done for today.");
    expect(above).not.toContain(REMOVED_ALL_DONE_MSG);
    expect(above).not.toContain(REMOVED_NO_TASKS_MSG);
    expect(above).not.toContain("PreMix Powder - Egg Chocolate");
  });

  it("no tasks at all today: the banner's 'No tasks today.' and nothing else", () => {
    const { above } = dashboard([]);
    expect(above).toContain("No tasks today.");
    expect(above).not.toContain(REMOVED_NO_TASKS_MSG);
    expect(above).not.toContain(REMOVED_ALL_DONE_MSG);
  });
});

describe("completing a task removes its card at once", () => {
  it("the task just completed in this browser session disappears before the server data catches up", () => {
    const before = dashboard([PREOP, CLEANING]).above;
    expect(order(before, ["Pre-Op Inspection", "Daily Cleaning"])).toEqual(["Pre-Op Inspection", "Daily Cleaning"]);

    justCompleted.mockReturnValue(new Set(["preop"])); // what the form's completion flow records
    const after = dashboard([PREOP, CLEANING]).above;
    expect(after).not.toContain("Pre-Op Inspection");
    expect(after).toContain("Daily Cleaning");
    expect(after).toContain("1 of 2 done");
  });

  it("completing the last open task leaves just the banner's all-done message", () => {
    justCompleted.mockReturnValue(new Set(["cleaning"]));
    const { above } = dashboard([done(PREOP), CLEANING]);
    expect(above).not.toContain("Daily Cleaning");
    expect(above).toContain("All done for today.");
    expect(above).not.toContain(REMOVED_ALL_DONE_MSG);
  });
});

describe("everything else in the list stays", () => {
  it("overdue from an earlier day, due today, in progress and 'Open this period' are all still shown", () => {
    const overdue = inst("y-cleaning", "Daily Cleaning", 30, { dueDate: "2026-11-17", status: "OVERDUE", label: "yesterday-cleaning" });
    const started = { ...PREMIX, status: "IN_PROGRESS" };
    const monthly = inst("monthly", "Monthly Cleaning", 90, { dueDate: "2026-11-30", status: "UPCOMING", windowStart: "2026-11-01" });
    const { above } = dashboard([overdue, done(PREOP), started, CLEANING], { windowInstances: [monthly] });

    expect(order(above, ["yesterday-cleaning", "PreMix Powder - Egg Chocolate", "Open this period", "Monthly Cleaning"]))
      .toEqual(["yesterday-cleaning", "PreMix Powder - Egg Chocolate", "Open this period", "Monthly Cleaning"]);
    expect(above).toContain("1 day overdue");
    expect(above).toContain("Continue");
    expect(above).toContain("12 days left");
  });

  it("all of today done but a period task is open: the period card stays", () => {
    const monthly = inst("monthly", "Monthly Cleaning", 90, { dueDate: "2026-11-30", status: "UPCOMING", windowStart: "2026-11-01" });
    const { above } = dashboard([done(PREOP)], { windowInstances: [monthly] });
    expect(above).toContain("All done for today.");
    expect(above).toContain("Open this period");
    expect(above).toContain("Monthly Cleaning");
  });
});

describe("calendar day panel — unchanged: completed tasks with their details, in work order", () => {
  function panel(instances: TaskInstance[], role = "SUPERVISOR") {
    return renderToStaticMarkup(
      <DayPanel date={TODAY} instances={sortTasks(instances)} today={TODAY} role={role} userId="user-ivan" onClose={() => {}} onRefresh={() => {}} />,
    );
  }

  it("shows a completed task with its Done badge, completion time and facility", () => {
    const html = panel([done(PREOP)]);
    expect(html).toContain("Pre-Op Inspection");
    expect(html).toContain(">Done<");
    expect(html).toContain("11/18/2026, 9:05 AM PT"); // 17:05 UTC
    expect(html).toContain("Julian Bakery");
  });

  it("lists completed and open tasks together in work order", () => {
    const html = panel([CLEANING, done(GRANOLA), done(PREOP), PREMIX]);
    expect(order(html, ["Pre-Op Inspection", "PreMix Powder - Egg Chocolate", "ProGranola - Chocolate", "Daily Cleaning"]))
      .toEqual(["Pre-Op Inspection", "PreMix Powder - Egg Chocolate", "ProGranola - Chocolate", "Daily Cleaning"]);
    expect(html.split(">Done<").length - 1).toBe(2);
  });

  it("a late completion keeps its Late badge", () => {
    expect(panel([{ ...done(PREOP), completedLate: true, daysLate: 1 }])).toContain("Late 1d");
  });
});
