import { describe, it, expect } from "vitest";
import {
  OTHER_EQUIPMENT, WO_FACILITIES, addDays, completionProblems, defaultFacility, describeWoChange, dueDateFor, filterWorkOrders, formatTime, isOverdue, isTime, parseRequest,
  parseStep2, step2OrderProblems, taskHasRealHistory, taskStatusForDue, workOrderCan, workOrderTaskKey, workOrderTaskLabel, type WorkOrderRow,
} from "@/lib/work-orders";
import { WORK_ORDER_TABLES_SQL } from "@/lib/work-orders-sql";
import { REFERENCE_KIND, formatReference } from "@/lib/quality";

describe("permissions: one helper decides who may do what", () => {
  const wo = { requestedById: "req", assigneeId: "asg" };
  const who = { admin: { id: "a", role: "ADMIN" }, supervisor: { id: "s", role: "SUPERVISOR" }, requester: { id: "req", role: "EMPLOYEE" }, assignee: { id: "asg", role: "EMPLOYEE" }, other: { id: "x", role: "EMPLOYEE" }, noRole: { id: "n", role: null } };
  const table = (fn: (v: { id: string; role: string | null }) => boolean) => Object.fromEntries(Object.entries(who).map(([k, v]) => [k, fn(v)]));
  it("create: anyone signed in", () => {
    expect(table((v) => workOrderCan.create(v))).toEqual({ admin: true, supervisor: true, requester: true, assignee: true, other: true, noRole: true });
  });
  it("see all: supervisors and admins; see one: also its requester and its assignee, and nobody else", () => {
    expect(table((v) => workOrderCan.viewAll(v))).toEqual({ admin: true, supervisor: true, requester: false, assignee: false, other: false, noRole: false });
    expect(table((v) => workOrderCan.view(v, wo))).toEqual({ admin: true, supervisor: true, requester: true, assignee: true, other: false, noRole: false });
  });
  it("reassign: requester, current assignee, admin (not a supervisor who is neither)", () => {
    expect(table((v) => workOrderCan.reassign(v, wo))).toEqual({ admin: true, supervisor: false, requester: true, assignee: true, other: false, noRole: false });
  });
  it("start and Step 2: the assignee, and an admin", () => {
    expect(table((v) => workOrderCan.work(v, wo))).toEqual({ admin: true, supervisor: false, requester: false, assignee: true, other: false, noRole: false });
  });
  it("cancel: the requester, and an admin", () => {
    expect(table((v) => workOrderCan.cancel(v, wo))).toEqual({ admin: true, supervisor: false, requester: true, assignee: false, other: false, noRole: false });
  });
  it("edit the equipment list: supervisors and admins", () => {
    expect(table((v) => workOrderCan.editEquipment(v))).toEqual({ admin: true, supervisor: true, requester: false, assignee: false, other: false, noRole: false });
  });
  it("a work order whose people were removed (ids emptied) matches nobody by accident", () => {
    const empty = { requestedById: null, assigneeId: null };
    expect(workOrderCan.view({ id: "", role: "EMPLOYEE" }, empty)).toBe(false);
    expect(workOrderCan.work({ id: "", role: "EMPLOYEE" }, empty)).toBe(false);
    expect(workOrderCan.cancel({ id: "", role: "EMPLOYEE" }, empty)).toBe(false);
  });
  it("a supervisor who is the requester or the assignee gets that person's rights too", () => {
    expect(workOrderCan.work({ id: "asg", role: "SUPERVISOR" }, wo)).toBe(true);
    expect(workOrderCan.cancel({ id: "req", role: "SUPERVISOR" }, wo)).toBe(true);
  });
});

describe("due date from priority", () => {
  it("High = the same day, Medium = 7 days later, Low = 30 days later", () => {
    expect(dueDateFor("high", "2026-11-25")).toBe("2026-11-25");
    expect(dueDateFor("medium", "2026-11-25")).toBe("2026-12-02");
    expect(dueDateFor("low", "2026-11-25")).toBe("2026-12-25");
  });
  it("counts calendar days across month ends, year ends, leap days and both daylight-saving changes", () => {
    expect(dueDateFor("medium", "2026-12-28")).toBe("2027-01-04");
    expect(dueDateFor("low", "2026-12-15")).toBe("2027-01-14");
    expect(dueDateFor("low", "2028-02-01")).toBe("2028-03-02"); // 2028 is a leap year
    expect(dueDateFor("medium", "2026-03-05")).toBe("2026-03-12"); // clocks go forward on March 8, 2026
    expect(dueDateFor("medium", "2026-10-28")).toBe("2026-11-04"); // clocks go back on November 1, 2026
    expect(dueDateFor("low", "2026-10-15")).toBe("2026-11-14");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
  });
  it("overdue: past the due date and still open or in progress", () => {
    expect(isOverdue({ dueDate: "2026-11-24", status: "open" }, "2026-11-25")).toBe(true);
    expect(isOverdue({ dueDate: "2026-11-24", status: "in_progress" }, "2026-11-25")).toBe(true);
    expect(isOverdue({ dueDate: "2026-11-25", status: "open" }, "2026-11-25")).toBe(false);
    expect(isOverdue({ dueDate: "2026-11-24", status: "completed" }, "2026-11-25")).toBe(false);
    expect(isOverdue({ dueDate: "2026-11-24", status: "cancelled" }, "2026-11-25")).toBe(false);
  });
  it("the status of a task nobody is working on follows its due date", () => {
    expect([taskStatusForDue("2026-11-24", "2026-11-25"), taskStatusForDue("2026-11-25", "2026-11-25"), taskStatusForDue("2026-11-26", "2026-11-25")]).toEqual(["OVERDUE", "DUE_TODAY", "UPCOMING"]);
  });
});

describe("the task", () => {
  it("the label starts with the reference, then the equipment and a short problem", () => {
    expect(workOrderTaskLabel("WO-2026-001", "Mixer 2", "Belt slipping")).toBe("WO-2026-001: Mixer 2 — Belt slipping");
    const long = workOrderTaskLabel("WO-2026-014", "E".repeat(80), "The belt slips\nwhen the mixer is   loaded above half and it smells of burnt rubber every time");
    expect(long.startsWith("WO-2026-014: ")).toBe(true);
    expect(long).not.toContain("\n");
    expect(long.length).toBeLessThanOrEqual("WO-2026-014: ".length + 50 + 3 + 60);
    expect(long.endsWith("…")).toBe(true);
  });
  it("two work orders for the same equipment and problem still get different labels", () => {
    expect(workOrderTaskLabel("WO-2026-001", "Oven 1", "Door seal")).not.toBe(workOrderTaskLabel("WO-2026-002", "Oven 1", "Door seal"));
  });
  it("the task key and what counts as real history", () => {
    expect(workOrderTaskKey("abc")).toBe("wo:abc");
    expect(taskHasRealHistory(["created"])).toBe(false);
    expect(taskHasRealHistory([])).toBe(false);
    for (const a of ["started", "updated", "reopened", "completed"]) expect(taskHasRealHistory(["created", a]), a).toBe(true);
  });
  it("the reference uses the Quality counter format with its own kind", () => {
    expect(REFERENCE_KIND).toEqual({ incident: "CI", capa: "CAPA", workOrder: "WO" });
    expect(formatReference(REFERENCE_KIND.workOrder, 2026, 1)).toBe("WO-2026-001");
    expect(formatReference(REFERENCE_KIND.workOrder, 2026, 1234)).toBe("WO-2026-1234");
  });
});

describe("Step 1, the request", () => {
  const ok = { facility: "624", requestType: "machinery_equipment", equipmentId: "eq-1", problem: "Belt slipping", priority: "high", assigneeId: "hugo" };
  it("a complete request has no problems; text is trimmed", () => {
    const { data, problems } = parseRequest({ ...ok, problem: "  Belt slipping  " });
    expect(problems).toEqual([]);
    expect(data).toEqual({ facility: "624", requestType: "machinery_equipment", equipmentId: "eq-1", equipmentName: "", problem: "Belt slipping", priority: "high", assigneeId: "hugo" });
  });
  it("Other: the name is typed, and no list item is stored", () => {
    const { data, problems } = parseRequest({ ...ok, equipmentId: OTHER_EQUIPMENT, equipmentName: " Loading dock door " });
    expect(problems).toEqual([]);
    expect([data.equipmentId, data.equipmentName]).toEqual([null, "Loading dock door"]);
    expect(parseRequest({ ...ok, equipmentId: "", equipmentName: "Roof vent" }).problems).toEqual([]); // an empty list: just the name
  });
  it("everything required is named, in plain words", () => {
    expect(parseRequest({}).problems.map((p) => p.field)).toEqual(["facility", "requestType", "equipmentName", "problem", "priority", "assigneeId"]);
    expect(parseRequest(null).problems).toHaveLength(6);
    expect(parseRequest({ ...ok, equipmentId: OTHER_EQUIPMENT }).problems.map((p) => p.field)).toEqual(["equipmentName"]);
    expect(parseRequest({ ...ok, facility: "Somewhere" }).problems[0].message).toBe("Facility: choose Julian Bakery or 624.");
    expect(parseRequest({ ...ok, priority: "urgent" }).problems[0].message).toBe("Priority: choose High, Medium or Low.");
  });
  it("the date, the time and the requester cannot be sent from the browser: they are not read at all", () => {
    const { data } = parseRequest({ ...ok, requestedAt: "2020-01-01", requestedById: "someone-else", requestedByName: "Someone Else", dueDate: "2030-01-01", status: "completed", reference: "WO-1" });
    expect(Object.keys(data).sort()).toEqual(["assigneeId", "equipmentId", "equipmentName", "facility", "priority", "problem", "requestType"]);
  });
});

describe("Step 2, the action", () => {
  const done = { startDate: "2026-11-25", startTime: "08:00", stopTime: "09:30", repairedByKind: "internal", repairedByUserId: "hugo", repairedByName: "Hugo Ayala", toolsAccounted: true, workDescription: "Replaced the belt.", completedDate: "2026-11-25", signatureName: "Hugo Ayala" };
  it("a draft can hold anything that has the right shape, including nothing", () => {
    expect(parseStep2({ startTime: "08:00", toolsAccounted: false, workDescription: " half done " })).toEqual({ data: { startTime: "08:00", toolsAccounted: false, workDescription: "half done" }, problems: [] });
    expect(parseStep2({ startDate: "", stopTime: null, repairedByKind: "", toolsAccounted: null })).toEqual({ data: { startDate: null, stopTime: null, repairedByKind: null, toolsAccounted: null }, problems: [] });
    expect(parseStep2({ status: "completed", signedById: "x", dueDate: "2030-01-01" })).toEqual({ data: {}, problems: [] }); // only Step 2 fields are read
  });
  it("a value of the wrong kind is refused by field", () => {
    expect(parseStep2({ startDate: "11/25/2026", startTime: "8am", stopTime: "25:00", repairedByKind: "robot", toolsAccounted: "yes", workDescription: 5 }).problems.map((p) => p.field))
      .toEqual(["startDate", "startTime", "stopTime", "repairedByKind", "toolsAccounted", "workDescription"]);
    expect(isTime("00:00") && isTime("23:59")).toBe(true);
    expect(isTime("24:00") || isTime("7:5") || isTime("")).toBe(false);
  });
  it("everything filled in and tools Yes: it can be completed", () => {
    expect(completionProblems(done)).toEqual([]);
    expect(completionProblems({ ...done, repairedByKind: "external", repairedByUserId: null, repairedByName: "ACME Refrigeration" })).toEqual([]);
    expect(completionProblems({ ...done, repairedByUserId: null, repairedByName: "Pedro (night shift)" })).toEqual([]); // internal, typed name
  });
  it("tools No blocks completion, with a message that says what to do", () => {
    const no = completionProblems({ ...done, toolsAccounted: false });
    expect(no.map((p) => p.field)).toEqual(["toolsAccounted"]);
    expect(no[0].message).toContain("the answer is No");
    expect(completionProblems({ ...done, toolsAccounted: null }).map((p) => p.field)).toEqual(["toolsAccounted"]);
    expect(completionProblems({ ...done, toolsAccounted: undefined })[0].message).toContain("answer whether all tools are accounted for");
  });
  it("each missing piece is named", () => {
    expect(completionProblems({}).map((p) => p.field)).toEqual(["startDate", "startTime", "stopTime", "repairedByKind", "toolsAccounted", "workDescription", "completedDate", "signatureName"]);
    expect(completionProblems({ ...done, repairedByKind: "external", repairedByName: " " }).map((p) => p.field)).toEqual(["repairedByName"]);
    expect(completionProblems({ ...done, repairedByUserId: null, repairedByName: "" }).map((p) => p.field)).toEqual(["repairedByName"]);
    expect(completionProblems({ ...done, signatureName: "  " }).map((p) => p.field)).toEqual(["signatureName"]);
  });
  it("the completion date cannot be before the start date", () => {
    const p = step2OrderProblems({ startDate: "2026-11-25", completedDate: "2026-11-24" });
    expect(p).toEqual([{ field: "completedDate", message: "Date work completed: it cannot be before the start date (11/25/2026)." }]);
    expect(completionProblems({ ...done, completedDate: "2026-11-24" }).map((x) => x.field)).toEqual(["completedDate"]);
  });
  it("the stop time cannot be before the start time on the same day; across days it can", () => {
    expect(step2OrderProblems({ ...done, startTime: "14:00", stopTime: "13:59" }).map((p) => p.field)).toEqual(["stopTime"]);
    expect(step2OrderProblems({ ...done, startTime: "14:00", stopTime: "13:59" })[0].message).toContain("2:00 PM");
    expect(step2OrderProblems({ ...done, startTime: "14:00", stopTime: "14:00" })).toEqual([]);
    expect(step2OrderProblems({ ...done, startTime: "22:00", stopTime: "02:00", completedDate: "2026-11-26" })).toEqual([]); // worked past midnight
    expect(step2OrderProblems({ startTime: "14:00", stopTime: "09:00" })).toEqual([]); // no dates yet: nothing to compare
  });
  it("times read as 12-hour clock times", () => {
    expect([formatTime("00:05"), formatTime("08:00"), formatTime("12:00"), formatTime("14:05"), formatTime("23:59"), formatTime(null)]).toEqual(["12:05 AM", "8:00 AM", "12:00 PM", "2:05 PM", "11:59 PM", "—"]);
  });
});

describe("the list filters", () => {
  const row = (n: number, over: Partial<WorkOrderRow>): WorkOrderRow => ({
    id: `wo-${n}`, reference: `WO-2026-00${n}`, facility: "624", requestType: "machinery_equipment", equipmentName: "Mixer", problem: "p", priority: "medium", status: "open", dueDate: "2026-12-02",
    requestedById: "carlos", requestedByName: "Carlos Gomory", requestedAt: "2026-11-25T18:00:00Z", assigneeId: "hugo", assigneeName: "Hugo Ayala", completedDate: null, updatedAt: "2026-11-25T18:00:00Z", ...over,
  });
  const rows = [row(1, {}), row(2, { status: "in_progress", priority: "high", facility: "Julian Bakery" }), row(3, { status: "completed", requestType: "facility", requestedById: "hugo", assigneeId: "carlos" }), row(4, { status: "cancelled" })];
  const shows = (f: Parameters<typeof filterWorkOrders>[1], viewer = "hugo") => filterWorkOrders(rows, f, viewer).map((r) => r.reference.slice(-1)).join("");
  it("cancelled work orders are hidden unless asked for", () => {
    expect(shows({})).toBe("123");
    expect(shows({ showCancelled: true })).toBe("1234");
    expect(shows({ status: "cancelled" })).toBe("4");
  });
  it("status, priority, type and facility", () => {
    expect(shows({ status: "in_progress" })).toBe("2");
    expect(shows({ priority: "high" })).toBe("2");
    expect(shows({ requestType: "facility" })).toBe("3");
    expect(shows({ facility: "Julian Bakery" })).toBe("2");
    expect(shows({ facility: "624", status: "open" })).toBe("1");
  });
  it("assigned to me and requested by me follow the person looking", () => {
    expect(shows({ assignedToMe: true }, "hugo")).toBe("12");
    expect(shows({ assignedToMe: true }, "carlos")).toBe("3");
    expect(shows({ requestedByMe: true }, "hugo")).toBe("3");
    expect(shows({ requestedByMe: true, assignedToMe: true }, "hugo")).toBe("");
    expect(shows({ assignedToMe: true, showCancelled: true }, "hugo")).toBe("124");
  });
});

describe("the facility a new work order starts on", () => {
  it("the facility of the person's most recent work order comes first", () => {
    expect(defaultFacility("624", ["Julian Bakery", "Julian Bakery"])).toBe("624");
  });
  it("otherwise the facility where they own the most task rules", () => {
    expect(defaultFacility(null, ["624", "624", "Julian Bakery"])).toBe("624");
    expect(defaultFacility(undefined, ["Julian Bakery"])).toBe("Julian Bakery");
  });
  it("otherwise blank: no rules, a tie, or a facility the form does not know", () => {
    expect(defaultFacility(null, [])).toBe("");
    expect(defaultFacility(null, ["624", "Julian Bakery"])).toBe("");
    expect(defaultFacility("Old Plant", ["Old Plant"])).toBe("");
    expect([...WO_FACILITIES]).toEqual(["Julian Bakery", "624"]);
  });
});

describe("the change log reads in plain words", () => {
  it("statuses, priorities, dates, times, yes / no and people", () => {
    expect(describeWoChange({ field: "status", from: "open", to: "in_progress" })).toBe("Status: Open → In progress");
    expect(describeWoChange({ field: "assignee", from: "Hugo Ayala", to: "Ivan Diaz" })).toBe("Assigned to: Hugo Ayala → Ivan Diaz");
    expect(describeWoChange({ field: "priority", from: null, to: "high" })).toBe("Priority: (empty) → High");
    expect(describeWoChange({ field: "dueDate", from: null, to: "2026-12-02" })).toBe("Due date: (empty) → 12/02/2026");
    expect(describeWoChange({ field: "stopTime", from: "09:00", to: "14:30" })).toBe("Stop time: 9:00 AM → 2:30 PM");
    expect(describeWoChange({ field: "toolsAccounted", from: false, to: true })).toBe("All tools accounted for and area cleared and cleaned: No → Yes");
    expect(describeWoChange({ field: "repairedByUserId", from: null, to: "hugo" }, { hugo: "Hugo Ayala" })).toBe("Repaired by (person): (empty) → Hugo Ayala");
    expect(describeWoChange({ field: "cancelReason", from: null, to: "Duplicate" })).toBe("Reason: (empty) → Duplicate");
  });
});

describe("the database statements only add", () => {
  it("four new tables, their indexes and foreign keys; nothing existing is altered or dropped", () => {
    const all = WORK_ORDER_TABLES_SQL.join(";\n");
    expect(WORK_ORDER_TABLES_SQL.every((s) => /^CREATE (TABLE|INDEX|UNIQUE INDEX) IF NOT EXISTS work_order/.test(s))).toBe(true);
    // (the only DELETE / UPDATE words are the foreign keys' own "ON DELETE … ON UPDATE …" clauses)
    expect(all.replace(/ON (DELETE|UPDATE) (SET NULL|CASCADE|RESTRICT)/g, "")).not.toMatch(/\b(ALTER|DROP|TRUNCATE|DELETE|UPDATE|INSERT|TRIGGER)\b/);
    expect(Array.from(all.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)).map((m) => m[1])).toEqual(["work_order_equipment_lists", "work_order_equipment", "work_orders", "work_order_events"]);
    expect(Array.from(all.matchAll(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS (\w+)/g)).map((m) => m[1])).toEqual([
      "work_order_equipment_facility_idx", "work_orders_reference_key", "work_orders_status_idx", "work_orders_requested_idx", "work_orders_assignee_idx", "work_orders_equipment_idx", "work_order_events_order_idx",
    ]);
    expect(all).toContain(`CREATE UNIQUE INDEX IF NOT EXISTS work_orders_reference_key ON work_orders (reference)`);
  });
  it("every column that names a user is a foreign key to users that empties itself when the user is removed", () => {
    const all = WORK_ORDER_TABLES_SQL.join("\n");
    const toUsers = Array.from(all.matchAll(/FOREIGN KEY \("(\w+)"\)\s+REFERENCES users\(id\) ON DELETE (\w+ \w+)/g));
    expect(toUsers.map((m) => m[1]).sort()).toEqual(["assigneeId", "cancelledById", "createdById", "repairedByUserId", "requestedById", "retiredById", "signedById", "updatedById", "updatedById", "updatedById", "userId"].sort());
    expect(toUsers.every((m) => m[2] === "SET NULL")).toBe(true);
    // every "...ById" / "...UserId" / assigneeId column declared has its foreign key
    const userColumns = Array.from(all.matchAll(/^\s+"?(\w*(?:ById|UserId)|assigneeId|userId)"?\s+TEXT/gm)).map((m) => m[1]);
    expect(userColumns.sort()).toEqual(toUsers.map((m) => m[1]).sort());
  });
});
