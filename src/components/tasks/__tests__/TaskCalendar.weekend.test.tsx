import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { TaskCalendar } from "@/components/tasks/TaskCalendar";
import type { TaskInstance } from "@/components/tasks/MyTasksClient";
import {
  WEEKEND_PREF_KEY, hiddenTasksNote, readWeekendPref, realTasksOn, toggledWeekendPref, weekendVisible, writeWeekendPref, type WeekendPref,
} from "@/lib/calendar-window";

const TODAY = "2026-11-18"; // Wednesday
const WEEK = "2026-11-16"; // Mon 11/16 … Sun 11/22; Friday is 11/20
const FRI_SUN = ["2026-11-20", "2026-11-21", "2026-11-22"];

function inst(over: Partial<TaskInstance>): TaskInstance {
  return {
    id: "i", ruleTitle: "Task", facilityId: "fac-624", facilityName: "624", ownerId: "user-hugo", ownerUserId: null, ownerName: "Hugo Ayala",
    formKey: "manual", label: "", dueDate: TODAY, status: "UPCOMING", source: "MANUAL", needsAdminReview: false, reviewReason: null,
    doneByName: null, doneAt: null, completedLate: false, daysLate: null, missedReason: null, skipReason: null, skippedByName: null, skippedAt: null,
    windowStart: null, progress: null, ...over,
  };
}
// Hugo's calendar in production: two period lines that cross Friday to Sunday
const monthlyLine = inst({ id: "mc", ruleTitle: "Monthly Cleaning — 624", dueDate: "2026-11-30", windowStart: "2026-11-01", status: "DONE", doneAt: "2026-11-18T23:24:33Z" }); // chip on Wed 11/18
const openLine = inst({ id: "open", ruleTitle: "Verification", dueDate: "2026-11-30", windowStart: "2026-11-16", status: "IN_PROGRESS" });
// …and the task that forced the columns open: Verification done on Friday 11/20 (its done chip sits on the Friday)
const doneOnFriday = inst({ id: "verif", ruleTitle: "Scales Verification", dueDate: "2026-11-30", windowStart: "2026-11-16", status: "DONE", doneAt: "2026-11-20T20:03:48Z" });
const dueSaturday = inst({ id: "sat", ruleTitle: "Saturday task", dueDate: "2026-11-21" });
const weekday = inst({ id: "wd", ruleTitle: "Weekday task", dueDate: "2026-11-17" });

interface Opts { pref?: WeekendPref; view?: "week" | "month"; role?: string; viewMode?: "my" | "everyone" | "byOwner"; ownerId?: string }
function calendar(instances: TaskInstance[], o: Opts = {}): string {
  return renderToStaticMarkup(
    <TaskCalendar
      initialInstances={instances} initialWeekStart={WEEK} today={TODAY} role={o.role ?? "SUPERVISOR"} userId="user-hugo"
      viewMode={o.viewMode ?? "my"} selectedOwnerId={o.ownerId ?? ""} initialView={o.view} initialWeekendPref={o.pref}
    />,
  );
}
const count = (html: string, needle: string) => html.split(needle).length - 1;
const shows = (html: string, mmdd: string) => html.includes(`>${mmdd}<`);
const weekendShown = (html: string) => ["11/20", "11/21", "11/22"].every((d) => shows(html, d));
const weekendHidden = (html: string) => ["11/20", "11/21", "11/22"].every((d) => !shows(html, d));
const note = (html: string) => /data-hidden-weekend-tasks[^>]*>([^<]*)</.exec(html)?.[1] ?? null;
const toggle = (html: string) => /data-weekend-toggle="(shown|hidden)"[^>]*>([^<]*)</.exec(html)!.slice(1, 3);

describe("week view — what shows the Friday to Sunday columns when the user made no choice", () => {
  it("period lines alone never do: the days stay hidden although open and done lines cross them", () => {
    const html = calendar([weekday, monthlyLine, openLine]);
    expect(weekendHidden(html)).toBe(true);
    expect(shows(html, "11/19")).toBe(true); // Thursday is the last visible day
    expect(count(html, 'title="Verification"')).toBe(4); // the line is drawn on the four visible days, Mon–Thu, and nowhere else
    expect(toggle(html)).toEqual(["hidden", "+ Fri–Sun"]);
    expect(note(html)).toBeNull(); // no real task is hidden, so there is nothing to mention
  });

  it("a real chip on Saturday does", () => {
    const html = calendar([weekday, dueSaturday]);
    expect(weekendShown(html)).toBe(true);
    expect(html).toContain('<p class="truncate leading-tight">Saturday task</p>');
    expect(toggle(html)).toEqual(["shown", "Hide Fri–Sun"]);
    expect(note(html)).toBeNull();
  });

  it("so does the done chip of a period task completed on a Friday (the case reported for Hugo)", () => {
    const html = calendar([weekday, monthlyLine, doneOnFriday]);
    expect(weekendShown(html)).toBe(true);
    expect(html.slice(html.indexOf(">11/20<"), html.indexOf(">11/21<"))).toContain('<p class="truncate leading-tight">Scales Verification</p>');
  });

  it("skipped and missed tasks on those days do not", () => {
    const html = calendar([weekday, { ...dueSaturday, status: "SKIPPED" }, inst({ id: "m", ruleTitle: "Missed one", dueDate: "2026-11-22", status: "MISSED" })], { role: "ADMIN", viewMode: "everyone" });
    expect(weekendHidden(html)).toBe(true);
    expect(note(html)).toBeNull();
  });

  it("an empty week keeps them hidden", () => {
    expect(weekendHidden(calendar([]))).toBe(true);
  });
});

describe("week view — the button always wins", () => {
  it("hidden by the user: the days stay hidden even with real tasks there, and a note says how many", () => {
    const html = calendar([weekday, monthlyLine, doneOnFriday], { pref: "hide" });
    expect(weekendHidden(html)).toBe(true);
    expect(note(html)).toBe("1 task on Fri-Sun");
    expect(toggle(html)).toEqual(["hidden", "+ Fri–Sun"]);
    expect(html).not.toContain('<p class="truncate leading-tight">Scales Verification</p>'); // its day is hidden
  });

  it("the note counts real tasks only — never lines, skipped or missed tasks", () => {
    const html = calendar([
      weekday, monthlyLine, openLine, doneOnFriday, dueSaturday,
      inst({ id: "sun", ruleTitle: "Sunday task", dueDate: "2026-11-22", status: "OVERDUE" }),
      inst({ id: "sk", ruleTitle: "Skipped", dueDate: "2026-11-21", status: "SKIPPED" }),
      inst({ id: "mi", ruleTitle: "Missed", dueDate: "2026-11-20", status: "MISSED" }),
    ], { pref: "hide", role: "ADMIN", viewMode: "everyone" });
    expect(note(html)).toBe("3 tasks on Fri-Sun"); // done on Friday, due Saturday, overdue Sunday
    expect(weekendHidden(html)).toBe(true);
  });

  it("the note is a button next to the toggle (clicking either shows the days)", () => {
    const html = calendar([doneOnFriday], { pref: "hide" });
    expect(html).toMatch(/<button[^>]*data-hidden-weekend-tasks[^>]*title="Show those days"[^>]*>1 task on Fri-Sun<\/button><button[^>]*data-weekend-toggle="hidden"/);
  });

  it("shown by the user: the days are shown even when nothing falls on them, with no note", () => {
    const html = calendar([weekday, monthlyLine], { pref: "show" });
    expect(weekendShown(html)).toBe(true);
    expect(toggle(html)).toEqual(["shown", "Hide Fri–Sun"]);
    expect(note(html)).toBeNull();
    expect(count(html, 'title="Monthly Cleaning — 624"')).toBe(7); // the line now runs across all seven days
  });

  it("hidden by the user with nothing there: hidden, no note", () => {
    const html = calendar([weekday, monthlyLine, openLine], { pref: "hide" });
    expect(weekendHidden(html)).toBe(true);
    expect(note(html)).toBeNull();
  });
});

describe("month view (it hides Saturday and Sunday)", () => {
  const sat = "11/21", sun = "11/22", fri = "11/20";
  it("lines alone do not show Saturday and Sunday; Friday is always there", () => {
    const html = calendar([weekday, monthlyLine, openLine], { view: "month" });
    expect(shows(html, fri)).toBe(true);
    expect(shows(html, sat)).toBe(false);
    expect(shows(html, sun)).toBe(false);
    expect(html).not.toContain(">Sat<");
    expect(note(html)).toBeNull();
  });
  it("a real task on a Saturday shows them", () => {
    const html = calendar([weekday, dueSaturday], { view: "month" });
    expect(shows(html, sat)).toBe(true);
    expect(html).toContain(">Sun<");
    expect(toggle(html)).toEqual(["shown", "Hide Fri–Sun"]);
  });
  it("hidden by the user they stay hidden, and the note counts the real tasks on Saturdays and Sundays of the grid", () => {
    const html = calendar([weekday, dueSaturday, doneOnFriday, monthlyLine, inst({ id: "s2", ruleTitle: "Another", dueDate: "2026-11-29", status: "DONE", doneAt: "2026-11-29T20:00:00Z" })], { view: "month", pref: "hide" });
    expect(shows(html, sat)).toBe(false);
    expect(note(html)).toBe("2 tasks on Sat-Sun"); // Sat 11/21 and Sun 11/29; the Friday task is visible in this view
  });
  it("shown by the user they are shown with nothing on them", () => {
    const html = calendar([weekday], { view: "month", pref: "show" });
    expect(shows(html, sat)).toBe(true);
    expect(shows(html, sun)).toBe(true);
  });
});

describe("the admin's Owner view for another user behaves the same", () => {
  const admin: Opts = { role: "ADMIN", viewMode: "byOwner", ownerId: "user-hugo" };
  it("lines alone keep the days hidden", () => {
    expect(weekendHidden(calendar([weekday, monthlyLine, openLine], admin))).toBe(true);
  });
  it("a real task shows them; hiding wins and leaves the note; showing wins too", () => {
    expect(weekendShown(calendar([weekday, monthlyLine, doneOnFriday], admin))).toBe(true);
    const hidden = calendar([weekday, monthlyLine, doneOnFriday], { ...admin, pref: "hide" });
    expect(weekendHidden(hidden)).toBe(true);
    expect(note(hidden)).toBe("1 task on Fri-Sun");
    expect(weekendShown(calendar([weekday], { ...admin, pref: "show" }))).toBe(true);
  });
  it("the admin's everyone view and a supervisor's own view follow the same rule", () => {
    for (const o of [{ role: "ADMIN", viewMode: "everyone" as const }, { role: "ADMIN", viewMode: "my" as const }, { role: "SUPERVISOR", viewMode: "my" as const }]) {
      expect(weekendHidden(calendar([weekday, openLine], o))).toBe(true);
      expect(weekendShown(calendar([weekday, dueSaturday], o))).toBe(true);
    }
  });
});

describe("the rule and the saved choice (the functions the calendar uses)", () => {
  it("the user's choice wins over what falls on the days; with no choice only real tasks show them", () => {
    expect(weekendVisible(null, 0)).toBe(false);
    expect(weekendVisible(null, 2)).toBe(true);
    expect(weekendVisible("hide", 2)).toBe(false);
    expect(weekendVisible("show", 0)).toBe(true);
  });
  it("pressing the toggle chooses the opposite of what is on screen — so one press hides auto-shown days", () => {
    expect(toggledWeekendPref(true)).toBe("hide");
    expect(toggledWeekendPref(false)).toBe("show");
    expect(weekendVisible(toggledWeekendPref(weekendVisible(null, 3)), 3)).toBe(false); // auto-shown → press → hidden
    expect(weekendVisible(toggledWeekendPref(false), 0)).toBe(true);
  });
  it("real tasks are chips on those days: due chips and done chips, not lines, not skipped or missed", () => {
    const all = [monthlyLine, openLine, doneOnFriday, dueSaturday, weekday, { ...dueSaturday, id: "sk", status: "SKIPPED" }, { ...dueSaturday, id: "mi", status: "MISSED" }];
    expect(realTasksOn(all, FRI_SUN).map((t) => t.id)).toEqual(["verif", "sat"]);
    expect(realTasksOn([monthlyLine, openLine], FRI_SUN)).toEqual([]);
  });
  it("the note's wording and when it is shown", () => {
    expect(hiddenTasksNote(false, 1, "Fri-Sun")).toBe("1 task on Fri-Sun");
    expect(hiddenTasksNote(false, 4, "Fri-Sun")).toBe("4 tasks on Fri-Sun");
    expect(hiddenTasksNote(false, 0, "Fri-Sun")).toBeNull();
    expect(hiddenTasksNote(true, 4, "Fri-Sun")).toBeNull();
  });
  it("the choice is saved and read back, so it persists across visits", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(readWeekendPref(storage)).toBeNull(); // nothing saved yet: the calendar decides
    writeWeekendPref(storage, "hide");
    expect(store.get(WEEKEND_PREF_KEY)).toBe("hide");
    expect(readWeekendPref(storage)).toBe("hide");
    writeWeekendPref(storage, "show");
    expect(readWeekendPref(storage)).toBe("show");
    // a calendar that starts from the saved choice renders it
    expect(weekendHidden(calendar([doneOnFriday], { pref: readWeekendPref({ ...storage, getItem: () => "hide" }) }))).toBe(true);
  });
  it("a browser that refuses storage, or holds something else there, never breaks the calendar", () => {
    const broken = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("QuotaExceededError"); } };
    expect(readWeekendPref(broken)).toBeNull();
    expect(() => writeWeekendPref(broken, "hide")).not.toThrow();
    expect(readWeekendPref({ getItem: () => "banana", setItem: () => {} })).toBeNull();
    expect(readWeekendPref(null)).toBeNull();
    expect(() => writeWeekendPref(undefined, "show")).not.toThrow();
  });
});
