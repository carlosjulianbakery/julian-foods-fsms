import { describe, it, expect } from "vitest";
import {
  chipDayOf, doneDayOf, donePeriodTasksForDay, doneTaskBelongsInRange, doneWindowCandidatesWhere, isDonePeriodTask, lineCoversDay, lineLabelDay, linesForDay,
  type CalendarTask,
} from "@/lib/calendar-window";
import { getTaskPresentation } from "@/lib/task-presentation";

const t = (over: Partial<CalendarTask> & { id?: string } = {}): CalendarTask & { id: string } => ({ id: "t", status: "UPCOMING", dueDate: "2026-11-26", windowStart: "2026-11-23", doneAt: null, ...over });
const DONE = t({ status: "DONE", doneAt: "2026-11-24T18:00:00Z" }); // Tuesday 10:00 AM Pacific
const WEEK = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"];

describe("the day a task was completed, in Pacific time", () => {
  it("is the Pacific calendar day of doneAt", () => {
    expect(doneDayOf(DONE)).toBe("2026-11-24");
    expect(doneDayOf(t({ status: "DONE", doneAt: "2026-11-20T20:03:48.560Z" }))).toBe("2026-11-20");
  });
  it("11:30 PM Pacific is still that day, although UTC is already the next day", () => {
    expect(doneDayOf(t({ status: "DONE", doneAt: "2026-11-25T07:30:00Z" }))).toBe("2026-11-24"); // winter, UTC-8
    expect(doneDayOf(t({ status: "DONE", doneAt: "2026-07-15T06:30:00Z" }))).toBe("2026-07-14"); // summer, UTC-7
    expect(doneDayOf(t({ status: "DONE", doneAt: "2027-01-01T07:59:00Z" }))).toBe("2026-12-31"); // across the year
    expect(doneDayOf(t({ status: "DONE", doneAt: "2026-11-25T08:00:00Z" }))).toBe("2026-11-25"); // midnight Pacific
  });
  it("is null for a task that is not done or has no completion time", () => {
    expect(doneDayOf(t({ doneAt: "2026-11-24T18:00:00Z" }))).toBeNull();
    expect(doneDayOf(t({ status: "DONE" }))).toBeNull();
    expect(doneDayOf(t({ status: "DONE", doneAt: "not a date" }))).toBeNull();
  });
});

describe("where the chip goes", () => {
  it("a done period task is shown once, on the day it was completed — not on its due date", () => {
    expect(chipDayOf(DONE)).toBe("2026-11-24");
    expect(WEEK.filter((d) => chipDayOf(DONE) === d)).toEqual(["2026-11-24"]);
  });
  it("completed late or before the window opened, the chip is still on the completion day", () => {
    expect(chipDayOf(t({ status: "DONE", doneAt: "2026-11-28T20:00:00Z" }))).toBe("2026-11-28"); // two days after the due date
    expect(chipDayOf(t({ status: "DONE", doneAt: "2026-11-20T20:00:00Z" }))).toBe("2026-11-20"); // before the window start
  });
  it("everything else stays on its due date: open period tasks, done tasks without a window, skipped and missed", () => {
    expect(chipDayOf(t())).toBe("2026-11-26");
    expect(chipDayOf(t({ status: "IN_PROGRESS" }))).toBe("2026-11-26");
    expect(chipDayOf(t({ status: "DONE", windowStart: null, doneAt: "2026-11-27T20:00:00Z" }))).toBe("2026-11-26");
    expect(chipDayOf(t({ status: "SKIPPED" }))).toBe("2026-11-26");
    expect(chipDayOf(t({ status: "MISSED" }))).toBe("2026-11-26");
    expect(chipDayOf(t({ status: "DONE", doneAt: null }))).toBe("2026-11-26"); // no completion time recorded
  });
});

describe("where the line goes", () => {
  const days = (task: CalendarTask) => WEEK.filter((d) => lineCoversDay(task, d));
  it("done: the whole window, window start through the due date", () => {
    expect(days(DONE)).toEqual(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"]);
  });
  it("done late or done early: the line still covers only the window", () => {
    expect(days(t({ status: "DONE", doneAt: "2026-11-28T20:00:00Z" }))).toEqual(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"]);
    expect(days(t({ status: "DONE", doneAt: "2026-11-20T20:00:00Z" }))).toEqual(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"]);
    expect(lineCoversDay(t({ status: "DONE", doneAt: "2026-11-28T20:00:00Z" }), "2026-11-28")).toBe(false);
  });
  it("open: window start up to the day before the due date, as before (the chip is on the due date)", () => {
    expect(days(t())).toEqual(["2026-11-23", "2026-11-24", "2026-11-25"]);
    expect(days(t({ status: "IN_PROGRESS" }))).toEqual(["2026-11-23", "2026-11-24", "2026-11-25"]);
    expect(days(t({ status: "OVERDUE" }))).toEqual(["2026-11-23", "2026-11-24", "2026-11-25"]);
  });
  it("skipped, missed and tasks without a window draw no line", () => {
    expect(days(t({ status: "SKIPPED" }))).toEqual([]);
    expect(days(t({ status: "MISSED" }))).toEqual([]);
    expect(days(t({ windowStart: null }))).toEqual([]);
    expect(days(t({ status: "DONE", windowStart: null, doneAt: "2026-11-24T18:00:00Z" }))).toEqual([]);
  });
  it("the label goes on the first VISIBLE day the line passes through", () => {
    expect(lineLabelDay(DONE, WEEK)).toBe("2026-11-23");
    const monthly = t({ status: "DONE", windowStart: "2026-11-01", dueDate: "2026-11-30", doneAt: "2026-11-10T20:00:00Z" });
    expect(lineLabelDay(monthly, ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19"])).toBe("2026-11-16"); // window started weeks ago
    expect(lineLabelDay(t({ windowStart: "2026-11-25", dueDate: "2026-12-02" }), WEEK)).toBe("2026-11-25"); // starts mid-week
    expect(lineLabelDay(t({ windowStart: "2026-11-29", dueDate: "2026-12-06" }), WEEK.slice(0, 4))).toBeNull(); // starts on a hidden day
    expect(lineLabelDay(t({ status: "SKIPPED" }), WEEK)).toBeNull();
  });
  it("lines keep the order of the list, so a line stays in the same row from day to day", () => {
    const list = [t({ id: "a" }), t({ id: "b", status: "DONE", doneAt: "2026-11-24T18:00:00Z" }), t({ id: "c", status: "SKIPPED" }), t({ id: "d", status: "IN_PROGRESS" })];
    expect(linesForDay(list, "2026-11-24").map((x) => x.id)).toEqual(["a", "b", "d"]);
    expect(linesForDay(list, "2026-11-26").map((x) => x.id)).toEqual(["b"]); // only the done one reaches the due date
  });
});

describe("line colours come from the shared presentation helper", () => {
  it("green done, blue in progress, gray for every other state", () => {
    const line = (status: string) => getTaskPresentation(status, "2026-11-26", "2026-11-24").lineColor;
    expect(line("DONE")).toBe("bg-green-400");
    expect(line("IN_PROGRESS")).toBe("bg-blue-400");
    for (const s of ["UPCOMING", "DUE_TODAY", "OVERDUE", "MISSED", "SKIPPED"]) expect(line(s)).toBe("bg-gray-300");
    expect(getTaskPresentation("UPCOMING", "2026-11-20", "2026-11-24").lineColor).toBe("bg-gray-300"); // past due, shown as overdue
  });
});

describe("day panel: done period tasks", () => {
  it("are listed on every day of the window, start through due date — except the completion day — and on no other day", () => {
    const list = [DONE, t({ id: "open" }), t({ id: "skipped", status: "SKIPPED" }), t({ id: "daily-done", status: "DONE", windowStart: null, doneAt: "2026-11-24T18:00:00Z" })];
    for (const d of ["2026-11-23", "2026-11-25", "2026-11-26"]) expect(donePeriodTasksForDay(list, d).map((x) => x.id), d).toEqual(["t"]);
    expect(donePeriodTasksForDay(list, "2026-11-24")).toEqual([]); // completed that day: its normal done card is enough
    expect(donePeriodTasksForDay([t({ status: "DONE", doneAt: "2026-11-25T07:30:00Z" })], "2026-11-24")).toEqual([]); // 11:30 PM Pacific is still the 24th
    expect(donePeriodTasksForDay([t({ status: "DONE", doneAt: "2026-11-25T07:30:00Z" })], "2026-11-25")).toHaveLength(1);
    expect(donePeriodTasksForDay([t({ status: "DONE", doneAt: null })], "2026-11-26")).toEqual([]); // no completion time: the chip is on the due date
    for (const d of ["2026-11-22", "2026-11-27"]) expect(donePeriodTasksForDay(list, d), d).toEqual([]);
    expect(isDonePeriodTask(list[3])).toBe(false);
  });
  it("a late completion day is outside the window, so the panel there has only the chip", () => {
    const late = t({ status: "DONE", doneAt: "2026-11-28T20:00:00Z" });
    expect(donePeriodTasksForDay([late], "2026-11-28")).toEqual([]);
    expect(chipDayOf(late)).toBe("2026-11-28");
  });
});

describe("which done period tasks a date range needs (beyond those due in it)", () => {
  const verification = t({ status: "DONE", dueDate: "2026-11-30", windowStart: "2026-11-16", doneAt: "2026-11-20T20:03:48.560Z" });
  it("a task due after the range whose window reaches into it", () => {
    expect(doneTaskBelongsInRange(verification, "2026-11-16", "2026-11-22")).toBe(true); // window start and completion day
    expect(doneTaskBelongsInRange(verification, "2026-11-23", "2026-11-29")).toBe(true); // neither: only the line
    expect(doneTaskBelongsInRange(verification, "2026-11-09", "2026-11-15")).toBe(false); // before the window
  });
  it("a task completed on a day inside the range: late after its due date, or early before its window", () => {
    const late = t({ status: "DONE", dueDate: "2026-11-19", windowStart: "2026-11-16", doneAt: "2026-11-24T18:00:00Z" });
    expect(doneTaskBelongsInRange(late, "2026-11-23", "2026-11-29")).toBe(true);
    expect(doneTaskBelongsInRange(late, "2026-11-30", "2026-12-06")).toBe(false);
    const early = t({ status: "DONE", dueDate: "2026-12-15", windowStart: "2026-12-01", doneAt: "2026-11-25T18:00:00Z" });
    expect(doneTaskBelongsInRange(early, "2026-11-23", "2026-11-29")).toBe(true); // completion day
    expect(doneTaskBelongsInRange(early, "2026-12-07", "2026-12-13")).toBe(true); // its window
    expect(doneTaskBelongsInRange(early, "2026-11-16", "2026-11-22")).toBe(false);
  });
  it("the completion day is the Pacific day: 11:30 PM Sunday belongs to that week, not the next", () => {
    const night = t({ status: "DONE", dueDate: "2026-11-19", windowStart: "2026-11-16", doneAt: "2026-11-23T07:30:00Z" }); // Sun 11/22, 11:30 PM Pacific
    expect(doneTaskBelongsInRange(night, "2026-11-16", "2026-11-22")).toBe(true);
    expect(doneTaskBelongsInRange(night, "2026-11-23", "2026-11-29")).toBe(false);
  });
  it("never an open, skipped or missed task, nor a done task without a window", () => {
    for (const status of ["UPCOMING", "IN_PROGRESS", "SKIPPED", "MISSED"]) expect(doneTaskBelongsInRange({ ...verification, status }, "2026-11-16", "2026-11-22")).toBe(false);
    expect(doneTaskBelongsInRange({ ...verification, windowStart: null }, "2026-11-16", "2026-11-22")).toBe(false);
  });
  it("the database filter asks only for done tasks of window rules, due after the range or due before it and completed around it", () => {
    const where = doneWindowCandidatesWhere("2026-11-16", "2026-11-22");
    expect(where.AND[0]).toEqual({ status: "DONE" });
    expect(where.AND[1]).toEqual({ rule: { windowMode: { not: "NONE" } } });
    expect(where.AND[2]).toEqual({ OR: [
      { dueDate: { gt: new Date("2026-11-22T23:59:59Z") } },
      { dueDate: { lt: new Date("2026-11-16T00:00:00Z") }, doneAt: { gte: new Date("2026-11-16T00:00:00Z"), lte: new Date("2026-11-24T00:00:00Z") } },
    ] });
  });
});
