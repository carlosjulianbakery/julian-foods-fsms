import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cronGate, isAuthorizedCron } from "@/lib/cron-auth";
import { getPacificHour } from "@/lib/pacific-time";

const SECRET = "test-only-secret-value";
const req = (headers: Record<string, string> = {}, url = "http://localhost/api/cron/x") => new Request(url, { headers });

beforeEach(() => vi.stubEnv("CRON_SECRET", SECRET));
afterEach(() => vi.unstubAllEnvs());

describe("cron guard", () => {
  it("no header → 401", () => {
    expect(isAuthorizedCron(req())).toBe(false);
    expect(cronGate(req())?.status).toBe(401);
  });

  it("wrong secret → 401", () => {
    expect(cronGate(req({ authorization: "Bearer not-the-secret" }))?.status).toBe(401);
    expect(cronGate(req({ authorization: SECRET }))?.status).toBe(401); // missing "Bearer "
    expect(cronGate(req({ authorization: `Bearer ${SECRET}x` }))?.status).toBe(401);
  });

  it("correct secret → allowed", () => {
    expect(isAuthorizedCron(req({ authorization: `Bearer ${SECRET}` }))).toBe(true);
    expect(cronGate(req({ authorization: `Bearer ${SECRET}` }))).toBeNull();
  });

  it("secret unset → 401 for everything, including 'Bearer undefined' and an empty bearer", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(cronGate(req())?.status).toBe(401);
    expect(cronGate(req({ authorization: "Bearer undefined" }))?.status).toBe(401);
    expect(cronGate(req({ authorization: "Bearer " }))?.status).toBe(401);
    expect(cronGate(req({ authorization: `Bearer ${SECRET}` }))?.status).toBe(401);
  });

  it("the x-vercel-cron header alone no longer opens the gate", () => {
    expect(cronGate(req({ "x-vercel-cron": "1" }))?.status).toBe(401);
  });
});

describe("Pacific-hour gate (jobs are scheduled at 07:xx and 08:xx UTC)", () => {
  const auth = { authorization: `Bearer ${SECRET}` };
  const at = (iso: string) => vi.setSystemTime(new Date(iso));

  it("winter (PST): 08:05 UTC is Pacific hour 0 → runs; 07:05 UTC is 23:05 → skipped", async () => {
    at("2026-11-20T08:05:00Z");
    expect(getPacificHour()).toBe(0);
    expect(cronGate(req(auth), { pacificHour: 0 })).toBeNull();

    at("2026-11-20T07:05:00Z");
    expect(getPacificHour()).toBe(23);
    const skipped = cronGate(req(auth), { pacificHour: 0 });
    expect(skipped?.status).toBe(200);
    expect(await skipped?.json()).toMatchObject({ skipped: true });
  });

  it("summer (PDT): 07:05 UTC is Pacific hour 0 → runs; 08:05 UTC is 01:05 → skipped", () => {
    at("2026-07-15T07:05:00Z");
    expect(cronGate(req(auth), { pacificHour: 0 })).toBeNull();
    at("2026-07-15T08:05:00Z");
    expect(cronGate(req(auth), { pacificHour: 0 })?.status).toBe(200);
  });

  it("exactly one of the two daily slots runs on every day of the year, including both DST changes", () => {
    for (let d = new Date("2026-01-01T00:00:00Z"); d < new Date("2027-01-01T00:00:00Z"); d = new Date(d.getTime() + 86400000)) {
      const day = d.toISOString().slice(0, 10);
      const runs = ["07:59", "08:00"].filter((t) => getPacificHour(new Date(`${day}T${t}:00Z`)) === 0).length
        + 0;
      const slot7 = getPacificHour(new Date(`${day}T07:30:00Z`)) === 0;
      const slot8 = getPacificHour(new Date(`${day}T08:30:00Z`)) === 0;
      expect(Number(slot7) + Number(slot8), day).toBe(1);
      expect(runs, day).toBe(1);
    }
  });

  it("force=1 runs outside the hour, but never without the secret", () => {
    at("2026-11-19T20:00:00Z"); // noon Pacific
    expect(cronGate(req(auth, "http://localhost/api/cron/x?force=1"), { pacificHour: 0 })).toBeNull();
    expect(cronGate(req({}, "http://localhost/api/cron/x?force=1"), { pacificHour: 0 })?.status).toBe(401);
  });
});
