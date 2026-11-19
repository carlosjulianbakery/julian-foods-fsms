import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { MyTasksClient, type TaskInstance } from "@/components/tasks/MyTasksClient";
import { TaskCalendar, groupByRule } from "@/components/tasks/TaskCalendar";
import { RuleOrderList } from "@/components/tasks/RuleOrderList";
import { sortTasks } from "@/lib/task-order";

const TODAY = "2026-11-18";
const WEEK = "2026-11-16";

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

// The real 2026-11-18 shape for Julian Bakery, in the order the old query returned it:
// Pre-Op, Cleaning, then granola BEFORE premix. Titles are made unique so their positions can be read off the HTML.
const AS_CREATED: TaskInstance[] = [
  inst("preop", "Pre-Op Inspection", 10),
  inst("cleaning", "Daily Cleaning", 30),
  inst("granola", "Batch Sheet GRANOLA", 20, { ruleId: "rule-batch", formKey: "batch_sheet", label: "ProGranola - Chocolate (50 Bowls)", sortKey: 1 }),
  inst("premix", "Batch Sheet PREMIX", 20, { ruleId: "rule-batch", formKey: "batch_sheet", label: "PreMix Powder - Egg Chocolate (3 Bowls)", sortKey: 0 }),
];
const WORK_ORDER = ["Pre-Op Inspection", "PreMix Powder - Egg Chocolate", "ProGranola - Chocolate", "Daily Cleaning"];

/** The order in which the given texts first appear in the markup. */
function appearance(html: string, texts: string[]): string[] {
  return texts
    .map((text) => ({ text, at: html.indexOf(text) }))
    .filter((x) => x.at !== -1)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.text);
}

function dashboard(instances: TaskInstance[], role = "SUPERVISOR"): string {
  const html = renderToStaticMarkup(
    <MyTasksClient instances={instances} skippedInstances={[]} calendarInstances={[]} calendarWeekStart={WEEK} windowInstances={[]}
      role={role} userId="user-ivan" firstName="Ivan" owners={[]} today={TODAY} facilitySyncInfo={[]} />,
  );
  return html.slice(0, html.indexOf("Task Schedule")); // the cards, without the calendar below them
}
function calendarWeek(instances: TaskInstance[]): string {
  return renderToStaticMarkup(
    <TaskCalendar initialInstances={instances} initialWeekStart={WEEK} today={TODAY} role="SUPERVISOR" userId="user-ivan" viewMode="everyone" selectedOwnerId="" />,
  );
}

describe("the dashboard list and the calendar show the same work order", () => {
  it("dashboard cards: Pre-Op, premix, granola, Cleaning — whatever order the rows arrive in", () => {
    expect(appearance(dashboard(AS_CREATED), WORK_ORDER)).toEqual(WORK_ORDER);
    expect(appearance(dashboard([...AS_CREATED].reverse()), WORK_ORDER)).toEqual(WORK_ORDER);
  });

  it("calendar week cell: the same order", () => {
    // Calendar chips abbreviate the once-a-day tasks to "Pre-Op" and "Cleaning"
    const chips = [">Pre-Op<", "PreMix Powder - Egg Chocolate", "ProGranola - Chocolate", ">Cleaning<"];
    expect(appearance(calendarWeek(AS_CREATED), chips)).toEqual(chips);
    expect(appearance(calendarWeek([...AS_CREATED].reverse()), chips)).toEqual(chips);
  });

  it("a task that has been started keeps its place on the dashboard and shows Continue", () => {
    const started = AS_CREATED.map((i) => (i.id === "preop" ? { ...i, status: "IN_PROGRESS" } : i));
    const html = dashboard(started);
    expect(appearance(html, WORK_ORDER)).toEqual(WORK_ORDER);
    expect(html.indexOf("Continue")).toBeLessThan(html.indexOf("PreMix Powder - Egg Chocolate"));
  });

  it("earlier days stay on top as a block, each day in work order", () => {
    const yesterday = [
      inst("y-cleaning", "Daily Cleaning", 30, { dueDate: "2026-11-17", status: "OVERDUE", label: "yesterday-cleaning" }),
      inst("y-preop", "Pre-Op Inspection", 10, { dueDate: "2026-11-17", status: "OVERDUE", label: "yesterday-preop" }),
    ];
    const html = dashboard([...AS_CREATED, ...yesterday]);
    expect(appearance(html, ["yesterday-preop", "yesterday-cleaning", "PreMix Powder - Egg Chocolate"]))
      .toEqual(["yesterday-preop", "yesterday-cleaning", "PreMix Powder - Egg Chocolate"]);
  });

  it("done strips stay below the open cards, in work order", () => {
    const withDone = AS_CREATED.map((i) => (i.id === "granola" || i.id === "preop" ? { ...i, status: "DONE", doneAt: "2026-11-18T17:00:00.000Z" } : i));
    const html = dashboard(withDone);
    // open cards first (premix, cleaning), then done strips (Pre-Op before granola)
    expect(appearance(html, ["PreMix Powder - Egg Chocolate", "Daily Cleaning", "Pre-Op Inspection", "ProGranola - Chocolate"]))
      .toEqual(["PreMix Powder - Egg Chocolate", "Daily Cleaning", "Pre-Op Inspection", "ProGranola - Chocolate"]);
  });
});

describe("day panel groups", () => {
  it("groupByRule keeps the work order and puts all batch sheets in one group", () => {
    const groups = groupByRule(sortTasks(AS_CREATED));
    expect(groups.map((g) => [g.title.replace(/ (GRANOLA|PREMIX)$/, ""), g.tasks.map((t) => t.id)])).toEqual([
      ["Pre-Op Inspection", ["preop"]],
      ["Batch Sheet", ["premix", "granola"]],
      ["Daily Cleaning", ["cleaning"]],
    ]);
  });

  const groups = [
    { ruleId: "r1", title: "Pre-Op Inspection", count: 1, content: <p>card-preop</p> },
    { ruleId: "r2", title: "Batch Sheet - Julian Bakery", count: 2, content: <><p>card-premix</p><p>card-granola</p></> },
    { ruleId: "r3", title: "Daily Cleaning", count: 1, content: <p>card-cleaning</p> },
  ];
  const count = (html: string, needle: string) => html.split(needle).length - 1;

  it("admin: one drag handle and one up/down pair per rule group — none per batch sheet", () => {
    const html = renderToStaticMarkup(<RuleOrderList groups={groups} canReorder onReorder={() => {}} />);
    expect(count(html, 'aria-label="Drag to reorder')).toBe(3);
    expect(count(html, 'aria-label="Move ')).toBe(6);
    expect(html).toContain("touch-action:none"); // the handle works with touch on iPad
    expect(html).toContain("Batch Sheet - Julian Bakery");
    expect(html).toContain("(2)");
    expect(appearance(html, ["card-preop", "card-premix", "card-granola", "card-cleaning"])).toEqual(["card-preop", "card-premix", "card-granola", "card-cleaning"]);
    // first group cannot go up, last cannot go down
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Move Pre-Op Inspection up"/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Move Daily Cleaning down"/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="Move Batch Sheet - Julian Bakery (up|down)"/);
  });

  it("supervisor: same cards in the same order, no handle and no arrows", () => {
    const html = renderToStaticMarkup(<RuleOrderList groups={groups} canReorder={false} onReorder={() => {}} />);
    expect(html).not.toContain("Drag to reorder");
    expect(html).not.toContain('aria-label="Move ');
    expect(appearance(html, ["card-preop", "card-premix", "card-granola", "card-cleaning"])).toEqual(["card-preop", "card-premix", "card-granola", "card-cleaning"]);
  });
});
