import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { DayPanel, PeriodLineLegend, TaskCalendar } from "@/components/tasks/TaskCalendar";
import type { TaskInstance } from "@/components/tasks/MyTasksClient";
import { donePeriodTasksForDay } from "@/lib/calendar-window";
import { getTaskPresentation } from "@/lib/task-presentation";

const TODAY = "2026-11-25"; // Wednesday
const WEEK = "2026-11-23"; // Monday; the week view shows Mon–Thu unless a chip falls on Fri–Sun

function inst(over: Partial<TaskInstance>): TaskInstance {
  return {
    id: "i", ruleTitle: "Task", facilityId: "fac-624", facilityName: "624", ownerId: "user-hugo", ownerUserId: null, ownerName: "Hugo Ayala",
    formKey: "manual", label: "", dueDate: TODAY, status: "UPCOMING", source: "MANUAL", needsAdminReview: false, reviewReason: null,
    doneByName: null, doneAt: null, completedLate: false, daysLate: null, missedReason: null, skipReason: null, skippedByName: null, skippedAt: null,
    windowStart: null, progress: null, ...over,
  };
}
/** Weekly period task: window Mon 11/23 → due Thu 11/26, done Tue 11/24 at 10:00 AM Pacific. */
const weeklyDone = (over: Partial<TaskInstance> = {}) =>
  inst({ id: "weekly", ruleTitle: "Facilities Checklist", dueDate: "2026-11-26", windowStart: "2026-11-23", status: "DONE", doneAt: "2026-11-24T18:00:00Z", doneByName: "Hugo Ayala", ...over });
/** Monthly period task: window 11/01 → due 11/30, done 11/18 at 3:24 PM Pacific. */
const monthlyDone = (over: Partial<TaskInstance> = {}) =>
  inst({ id: "monthly", ruleTitle: "Monthly Cleaning", dueDate: "2026-11-30", windowStart: "2026-11-01", status: "DONE", doneAt: "2026-11-18T23:24:33Z", doneByName: "Hugo Ayala", ...over });

const GREEN = getTaskPresentation("DONE", "2026-11-26", TODAY).lineColor;
const BLUE = getTaskPresentation("IN_PROGRESS", "2026-11-26", TODAY).lineColor;
const GRAY = getTaskPresentation("UPCOMING", "2026-11-26", TODAY).lineColor;

function calendar(instances: TaskInstance[], over: { week?: string; view?: "week" | "month"; today?: string } = {}): string {
  const html = renderToStaticMarkup(
    <TaskCalendar initialInstances={instances} initialWeekStart={over.week ?? WEEK} today={over.today ?? TODAY} role="ADMIN" userId="admin-1" viewMode="everyone" selectedOwnerId="" initialView={over.view} />,
  );
  return html;
}
/** The grid only, without the legend (which has its own colour swatches). */
const grid = (html: string) => html.slice(0, html.indexOf("data-period-legend"));
const count = (html: string, needle: string) => html.split(needle).length - 1;
/** Markup of one day cell: from its date label to the next cell's. */
function cell(html: string, mmdd: string, next?: string) {
  const start = html.indexOf(`>${mmdd}<`);
  const end = next ? html.indexOf(`>${next}<`, start) : -1;
  return html.slice(start, end === -1 ? undefined : end);
}
const chip = (title: string) => `<p class="truncate leading-tight">${title}</p>`;
const line = (title: string) => `title="${title}"`;

describe("week view — a done weekly period task", () => {
  const html = grid(calendar([weeklyDone()]));

  it("draws a faint green line on every day of the window, start through due date", () => {
    expect(count(html, line("Facilities Checklist"))).toBe(4); // Mon, Tue, Wed and Thu (the due date)
    for (const [d, next] of [["11/23", "11/24"], ["11/24", "11/25"], ["11/25", "11/26"], ["11/26", undefined]] as const)
      expect(cell(html, d, next), d).toContain(line("Facilities Checklist"));
    expect(count(html, GREEN)).toBe(4);
    expect(GREEN).toBe("bg-green-400"); // from getTaskPresentation, not hardcoded in the calendar
    expect(html).not.toContain(GRAY + " ");
    expect(html).not.toContain(BLUE);
  });

  it("at the same faintness as the open lines", () => {
    const open = grid(calendar([weeklyDone({ status: "UPCOMING", doneAt: null })]));
    expect(html).toContain(`h-1 rounded-full opacity-50 ${GREEN}`);
    expect(open).toContain(`h-1 rounded-full opacity-50 ${GRAY}`);
  });

  it("labels the line once, on the first day", () => {
    // Long titles are shortened in the week view's label ("Facilities Checklist" → "Facilities Check…")
    expect(count(html, ">Facilities Check…</span>")).toBe(1);
    expect(cell(html, "11/23", "11/24")).toContain(">Facilities Check…</span>");
    expect(count(html, 'class="text-[8px] text-gray-400 truncate max-w-[70%] leading-none"')).toBe(1);
  });

  it("shows ONE green done chip, on the day it was completed, and none on the due date", () => {
    expect(count(html, chip("Facilities Checklist"))).toBe(1);
    const tuesday = cell(html, "11/24", "11/25");
    expect(tuesday).toContain(chip("Facilities Checklist"));
    expect(tuesday).toContain("bg-green-100"); // the done chip colours
    expect(cell(html, "11/26")).not.toContain(chip("Facilities Checklist"));
    expect(cell(html, "11/23", "11/24")).not.toContain(chip("Facilities Checklist"));
  });

  it("completed at 11:30 PM Pacific: the chip is on that Pacific day, not on the next (UTC) day", () => {
    const night = grid(calendar([weeklyDone({ doneAt: "2026-11-25T07:30:00Z" })])); // Tue 11/24, 11:30 PM Pacific
    expect(cell(night, "11/24", "11/25")).toContain(chip("Facilities Checklist"));
    expect(cell(night, "11/25", "11/26")).not.toContain(chip("Facilities Checklist"));
    expect(count(night, chip("Facilities Checklist"))).toBe(1);
  });
});

describe("week view — other weeks and other completion days", () => {
  it("a week that contains neither the window start nor the completion day still shows the green line, labelled on its first day, with no chip", () => {
    const html = grid(calendar([monthlyDone({ doneAt: "2026-11-10T20:00:00Z" })], { week: "2026-11-16", today: "2026-11-19" }));
    expect(count(html, line("Monthly Cleaning"))).toBe(4); // Mon–Thu
    expect(count(html, GREEN)).toBe(4);
    expect(count(html, ">Monthly Cleaning</span>")).toBe(1);
    expect(cell(html, "11/16", "11/17")).toContain(">Monthly Cleaning</span>");
    expect(html).not.toContain(chip("Monthly Cleaning"));
  });

  it("completed late, after the due date: the chip is on the completion day, outside the window, and the line covers only the window", () => {
    const late = weeklyDone({ doneAt: "2026-11-28T20:00:00Z", completedLate: true, daysLate: 2 }); // Saturday
    const html = grid(calendar([late]));
    expect(html).toContain(">11/28<"); // the weekend columns appear because a chip is there
    const saturday = cell(html, "11/28", "11/29");
    expect(saturday).toContain(chip("Facilities Checklist"));
    expect(saturday).toContain("Late");
    expect(saturday).not.toContain(line("Facilities Checklist")); // no line on the completion day
    expect(count(html, line("Facilities Checklist"))).toBe(4); // Mon–Thu only
    expect(cell(html, "11/27", "11/28")).not.toContain(line("Facilities Checklist"));
    expect(cell(html, "11/26", "11/27")).not.toContain(chip("Facilities Checklist")); // nothing extra on the due date
    expect(count(html, chip("Facilities Checklist"))).toBe(1);
  });

  it("completed late in a LATER week: that week shows only the chip, no line at all", () => {
    const lastWeeks = weeklyDone({ dueDate: "2026-11-19", windowStart: "2026-11-16", doneAt: "2026-11-24T18:00:00Z", completedLate: true, daysLate: 5 });
    const html = grid(calendar([lastWeeks]));
    expect(count(html, chip("Facilities Checklist"))).toBe(1);
    expect(cell(html, "11/24", "11/25")).toContain(chip("Facilities Checklist"));
    expect(html).not.toContain(line("Facilities Checklist"));
    expect(html).not.toContain(GREEN);
  });

  it("completed before the window opened: the chip is on that earlier day; the window's week has the line and no chip", () => {
    const early = weeklyDone({ dueDate: "2026-12-03", windowStart: "2026-11-30", doneAt: "2026-11-25T18:00:00Z" });
    const thisWeek = grid(calendar([early]));
    expect(cell(thisWeek, "11/25", "11/26")).toContain(chip("Facilities Checklist"));
    expect(thisWeek).not.toContain(line("Facilities Checklist"));
    const windowWeek = grid(calendar([early], { week: "2026-11-30", today: "2026-12-01" }));
    expect(count(windowWeek, line("Facilities Checklist"))).toBe(4);
    expect(windowWeek).not.toContain(chip("Facilities Checklist"));
  });
});

describe("which tasks draw a line, and in which colour", () => {
  it("skipped and missed period tasks draw no line; a task without a window draws none", () => {
    for (const status of ["SKIPPED", "MISSED"]) expect(grid(calendar([weeklyDone({ status, doneAt: null })])), status).not.toContain(line("Facilities Checklist"));
    const daily = inst({ id: "d", ruleTitle: "Sanitizer check", dueDate: "2026-11-24", status: "DONE", doneAt: "2026-11-24T18:00:00Z" });
    const html = grid(calendar([daily]));
    expect(html).not.toContain(line("Sanitizer check"));
    expect(html).not.toContain("rounded-full opacity-50");
    expect(cell(html, "11/24", "11/25")).toContain(chip("Sanitizer check")); // a daily done task is unchanged: chip on its due date
  });

  it("open states keep their colours: gray not started, blue in progress — and stop the day before the due date, where the chip is", () => {
    const notStarted = grid(calendar([weeklyDone({ status: "UPCOMING", doneAt: null })]));
    expect(count(notStarted, GRAY + " ") + count(notStarted, GRAY + '"')).toBe(3); // Mon, Tue, Wed
    expect(notStarted).not.toContain(GREEN);
    expect(cell(notStarted, "11/26")).toContain(chip("Facilities Checklist")); // chip on the due date, as before
    const inProgress = grid(calendar([weeklyDone({ status: "IN_PROGRESS", doneAt: null })]));
    expect(count(inProgress, BLUE)).toBe(3);
    expect(inProgress).not.toContain(GREEN);
  });

  it("gray, blue and green lines side by side keep their own colours", () => {
    const html = grid(calendar([
      inst({ id: "a", ruleTitle: "Not started", dueDate: "2026-11-30", windowStart: "2026-11-16" }),
      inst({ id: "b", ruleTitle: "Under way", dueDate: "2026-11-30", windowStart: "2026-11-16", status: "IN_PROGRESS" }),
      weeklyDone(),
    ]));
    expect(count(html, GRAY + " ") + count(html, GRAY + '"')).toBe(4);
    expect(count(html, BLUE)).toBe(4);
    expect(count(html, GREEN)).toBe(4);
  });
});

describe("crowded weeks", () => {
  // A weekly, a twice-monthly and a monthly line at once, in the three states
  const crowded = [
    weeklyDone(),
    inst({ id: "verif", ruleTitle: "Scales & Thermometer Verification", dueDate: "2026-11-30", windowStart: "2026-11-16", status: "DONE", doneAt: "2026-11-20T20:03:48Z" }),
    inst({ id: "mc", ruleTitle: "Monthly Cleaning", dueDate: "2026-11-30", windowStart: "2026-11-01", status: "IN_PROGRESS" }),
  ];

  it("lines stack one per row, each label in its own row and truncated, so texts never overlap", () => {
    const monday = cell(grid(calendar(crowded)), "11/23", "11/24");
    const rows = monday.match(/<div title="[^"]+" class="flex items-center gap-0\.5 overflow-hidden">/g) ?? [];
    expect(rows).toHaveLength(3); // three lines, three rows
    expect(count(monday, 'class="text-[8px] text-gray-400 truncate max-w-[70%] leading-none"')).toBe(3);
    expect(monday).toContain('<div class="mt-1.5 space-y-0.5">'); // stacked vertically
    for (const label of [">Facilities Check…</span>", ">Scales &amp; Thermom…</span>", ">Monthly Cleaning</span>"]) expect(monday, label).toContain(label);
    // on the other days the lines are bare bars, one per row, no text
    const tuesday = cell(grid(calendar(crowded)), "11/24", "11/25");
    expect(count(tuesday, "h-1 rounded-full opacity-50")).toBe(3);
    expect(tuesday).not.toContain("</span><div class=\"h-1");
  });

  it("the existing limit of three lines per day with +n still applies, counting done lines like the others", () => {
    const five = ["A", "B", "C", "D", "E"].map((n, k) =>
      inst({ id: n, ruleTitle: `Window ${n}`, dueDate: "2026-11-30", windowStart: "2026-11-01", ...(k % 2 === 0 ? { status: "DONE", doneAt: "2026-11-10T20:00:00Z" } : {}) }));
    const html = grid(calendar(five));
    expect(count(html, line("Window A"))).toBe(4);
    expect(count(html, line("Window C"))).toBe(4);
    expect(html).not.toContain(line("Window D"));
    expect(count(html, ">+2</span>")).toBe(4);
  });

  it("lines are not items: a day's chips are all shown and unchanged, however many lines pass through it", () => {
    const chips = ["One", "Two", "Three", "Four"].map((n) => inst({ id: n, ruleTitle: `Chip ${n}`, dueDate: "2026-11-24" }));
    const without = cell(grid(calendar(chips)), "11/24", "11/25");
    const withLines = cell(grid(calendar([...chips, ...crowded])), "11/24", "11/25");
    for (const n of ["One", "Two", "Three", "Four"]) {
      expect(count(without, chip(`Chip ${n}`))).toBe(1);
      expect(count(withLines, chip(`Chip ${n}`))).toBe(1);
    }
    expect(count(withLines, "h-1 rounded-full opacity-50")).toBe(3);
    expect(withLines).not.toContain(">+"); // three lines: nothing hidden, and the chips did not use up the limit
    // the done weekly task adds its one chip on this day (its completion day) — a real item, like any done task
    expect(count(withLines, chip("Facilities Checklist"))).toBe(1);
  });
});

describe("month view", () => {
  const html = grid(calendar([monthlyDone(), weeklyDone()], { view: "month" }));

  it("the green line runs over every visible day of the window, at the month view's faintness", () => {
    // November 2026 weekdays inside 11/01–11/30: 21 (the 1st is a Sunday, weekends are hidden)
    expect(count(html, line("Monthly Cleaning"))).toBe(21);
    expect(count(html, line("Facilities Checklist"))).toBe(4); // 11/23–11/26
    expect(count(html, `h-0.5 rounded-full opacity-40 ${GREEN}`)).toBe(25);
    expect(cell(html, "11/30", "12/01")).toContain(line("Monthly Cleaning")); // through the due date
    expect(cell(html, "12/01", "12/02")).not.toContain(line("Monthly Cleaning"));
    expect(cell(html, "10/30", "11/02")).not.toContain(line("Monthly Cleaning"));
  });

  it("each line is labelled once, on its first visible day of the month grid", () => {
    expect(count(html, ">Monthly Cleaning</span>")).toBe(1);
    expect(cell(html, "11/02", "11/03")).toContain(">Monthly Cleaning</span>"); // 11/01 is a hidden Sunday
    expect(count(html, ">Facilities Checklist</span>")).toBe(1);
    expect(cell(html, "11/23", "11/24")).toContain(">Facilities Checklist</span>");
  });

  it("the done task counts as an item only on its completion day, not on its due date", () => {
    const dot = getTaskPresentation("DONE", "2026-11-30", TODAY).dotColor;
    expect(cell(html, "11/18", "11/19")).toContain(dot); // monthly, done 11/18
    expect(cell(html, "11/24", "11/25")).toContain(dot); // weekly, done 11/24
    expect(cell(html, "11/30", "12/01")).not.toContain("w-2 h-2 rounded-full");
    expect(cell(html, "11/26", "11/27")).not.toContain("w-2 h-2 rounded-full");
    expect(count(html, "w-2 h-2 rounded-full")).toBe(2);
  });

  it("open lines keep gray and blue; skipped and missed draw nothing", () => {
    const open = grid(calendar([
      monthlyDone({ id: "o1", ruleTitle: "Open one", status: "UPCOMING", doneAt: null }),
      monthlyDone({ id: "o2", ruleTitle: "Open two", status: "IN_PROGRESS", doneAt: null }),
      monthlyDone({ id: "o3", ruleTitle: "Skipped one", status: "SKIPPED", doneAt: null }),
      monthlyDone({ id: "o4", ruleTitle: "Missed one", status: "MISSED", doneAt: null }),
    ], { view: "month" }));
    expect(count(open, "h-0.5 rounded-full opacity-40 bg-gray-400")).toBe(20); // up to the day before the due date
    expect(count(open, `h-0.5 rounded-full opacity-40 ${BLUE}`)).toBe(20);
    expect(open).not.toContain(GREEN);
    expect(open).not.toContain(line("Skipped one"));
    expect(open).not.toContain(line("Missed one"));
  });
});

describe("day panel (real component)", () => {
  const panel = (date: string, all: TaskInstance[], chipsToday: TaskInstance[] = []) =>
    renderToStaticMarkup(
      <DayPanel date={date} instances={chipsToday} today={TODAY} role="ADMIN" userId="admin-1" donePeriodTasks={donePeriodTasksForDay(all, date)} onClose={() => {}} onRefresh={() => {}} />,
    );
  const task = weeklyDone();

  it("lists the done period task on EVERY day of its window, labelled with the day it was done and the usual details", () => {
    for (const day of ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"]) {
      const html = panel(day, [task]);
      expect(html, day).toContain("Period tasks done");
      expect(html, day).toContain('data-done-period-task="weekly"');
      expect(html, day).toContain("Facilities Checklist");
      expect(html, day).toContain("Period task, done 11/24/2026");
      expect(html, day).toContain("Completed by Hugo Ayala · 11/24/2026, 10:00 AM PT · Due 11/26/2026");
      expect(html, day).toContain(">On time</span>");
    }
  });

  it("not on days outside the window", () => {
    for (const day of ["2026-11-22", "2026-11-27"]) expect(panel(day, [task]), day).not.toContain("Period tasks done");
  });

  it("a late one says how late, and its done date is the Pacific day", () => {
    const late = weeklyDone({ doneAt: "2026-11-29T07:30:00Z", completedLate: true, daysLate: 2 }); // Sat 11/28, 11:30 PM Pacific
    const html = panel("2026-11-25", [late]);
    expect(html).toContain("Period task, done 11/28/2026");
    expect(html).toContain("11/28/2026, 11:30 PM PT");
    expect(html).toContain(">Late 2d</span>");
    expect(html).not.toContain(">On time</span>");
    expect(panel("2026-11-28", [late])).not.toContain("Period tasks done"); // the completion day is outside the window: chip only
  });

  it("on the completion day the task also appears as its usual done card", () => {
    const html = panel("2026-11-24", [task], [task]);
    expect(html).toContain("Period tasks done");
    expect(html).toContain("11/24/2026, 10:00 AM PT");
    expect(html.indexOf("Facilities Checklist")).toBeLessThan(html.indexOf("Period tasks done")); // the card first, then the period list
    expect(html).not.toContain("No tasks on this day.");
  });

  it("open period tasks and tasks without a window are not listed there", () => {
    const html = panel("2026-11-24", [weeklyDone({ status: "IN_PROGRESS", doneAt: null }), inst({ id: "d", status: "DONE", dueDate: "2026-11-24", doneAt: "2026-11-24T18:00:00Z" })]);
    expect(html).not.toContain("Period tasks done");
  });
});

describe("legend", () => {
  const text = (html: string) => html.replace(/<[^>]+>/g, "");
  it("is shown under the calendar, in week and month view", () => {
    for (const view of ["week", "month"] as const) {
      const html = calendar([weeklyDone()], { view });
      expect(text(html.slice(html.indexOf("data-period-legend")))).toContain("Faint line = period task (gray: not started, blue: in progress, green: done)");
      expect(count(html, "data-period-legend")).toBe(1);
    }
    expect(calendar([])).toContain("data-period-legend"); // also with no period tasks at all
  });
  it("its swatches use the same colours as the lines", () => {
    const html = renderToStaticMarkup(<PeriodLineLegend today={TODAY} />);
    expect(html.indexOf(GRAY)).toBeGreaterThan(-1);
    expect(html.indexOf(GRAY)).toBeLessThan(html.indexOf(BLUE));
    expect(html.indexOf(BLUE)).toBeLessThan(html.indexOf(GREEN));
    expect(count(html, "opacity-50")).toBe(3);
  });
});
