import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/task-generator", () => ({
  generateInstances: vi.fn(),
  updateStatuses: vi.fn(),
  generateCalendarInstances: vi.fn(),
}));
vi.mock("@/lib/task-reminders", () => ({ sendReminders: vi.fn() }));
vi.mock("@/lib/task-escalation", () => ({ sendEscalations: vi.fn() }));

import { generateInstances, updateStatuses, generateCalendarInstances } from "@/lib/task-generator";
import { sendReminders } from "@/lib/task-reminders";
import { sendEscalations } from "@/lib/task-escalation";
import { GET } from "@/app/api/cron/task-generator/route";

type MockFn = ReturnType<typeof vi.fn>;
const m = {
  status: updateStatuses as unknown as MockFn,
  recurring: generateInstances as unknown as MockFn,
  calendar: generateCalendarInstances as unknown as MockFn,
  reminders: sendReminders as unknown as MockFn,
  escalations: sendEscalations as unknown as MockFn,
};
const SECRET = "test-only-secret-value";
const call = (headers: Record<string, string> = { authorization: `Bearer ${SECRET}` }, qs = "") =>
  GET(new NextRequest(`http://localhost/api/cron/task-generator${qs}`, { headers }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("VERCEL_ENV", "production");
  vi.setSystemTime(new Date("2026-11-20T08:05:00Z")); // 00:05 Pacific
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.status.mockResolvedValue({ updated: 4 });
  m.recurring.mockResolvedValue({ created: 1 });
  m.calendar.mockResolvedValue({ totalCreated: 2, totalDeleted: 0, totalFlagged: 0, results: [] });
  m.reminders.mockResolvedValue({ dueSoon: 0, dueToday: 3, overdue: 1 });
  m.escalations.mockResolvedValue({ escalated: 0 });
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/cron/task-generator", () => {
  it("rejects a call without the secret and does no work", async () => {
    expect((await call({})).status).toBe(401);
    expect((await call({ "x-vercel-cron": "1" })).status).toBe(401);
    expect(m.status).not.toHaveBeenCalled();
    expect(m.recurring).not.toHaveBeenCalled();
  });

  it("promotes statuses before generating, then sends reminders", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const order = [m.status, m.recurring, m.calendar, m.reminders, m.escalations].map((f) => f.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(await res.json()).toMatchObject({ ok: true, statusUpdates: 4, recurring: { created: 1 }, reminders: { dueToday: 3, overdue: 1 }, errors: [] });
  });

  it("a generation failure still returns the promoted count and still sends reminders", async () => {
    m.calendar.mockRejectedValue(new Error("sheet fetch failed"));
    m.recurring.mockRejectedValue(new Error("db hiccup"));

    const res = await call();
    const json = await res.json();

    expect(res.status).toBe(207);
    expect(json).toMatchObject({ ok: false, statusUpdates: 4, calendar: null, reminders: { dueToday: 3 } });
    expect(json.errors).toEqual(["recurring generation failed", "calendar generation failed"]);
    expect(m.reminders).toHaveBeenCalledTimes(1);
  });

  it("the slot outside Pacific hour 0 is acknowledged and does nothing", async () => {
    vi.setSystemTime(new Date("2026-11-20T07:05:00Z")); // 23:05 Pacific in winter
    const res = await call();
    expect(await res.json()).toMatchObject({ skipped: true });
    expect(m.status).not.toHaveBeenCalled();
  });

  it("force=1 with the secret runs at any hour", async () => {
    vi.setSystemTime(new Date("2026-11-19T20:00:00Z"));
    expect((await call(undefined, "?force=1")).status).toBe(200);
    expect(m.status).toHaveBeenCalledTimes(1);
  });

  it("dryRun writes nothing: no status update, no recurring generation", async () => {
    await call(undefined, "?dryRun=true");
    expect(m.status).not.toHaveBeenCalled();
    expect(m.recurring).not.toHaveBeenCalled();
    expect(m.calendar).toHaveBeenCalledWith({ dryRun: true });
    expect(m.reminders).toHaveBeenCalledWith({ dryRun: true });
  });
});
