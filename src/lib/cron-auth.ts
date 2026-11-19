import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getPacificHour } from "@/lib/pacific-time";

/**
 * The only accepted credential for cron routes: `Authorization: Bearer ${CRON_SECRET}`.
 * Fails closed — with CRON_SECRET unset nothing is authorized. No header shortcuts, no fallback value.
 */
export function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Gate for a cron route. Returns the response to send when the call must not proceed, otherwise null.
 * With `pacificHour`, an authorized call outside that Pacific hour is acknowledged and skipped —
 * Vercel schedules are UTC, so each job is scheduled for both UTC hours that can be that Pacific hour.
 * `?force=1` (still authorized) runs regardless of the hour.
 */
export function cronGate(req: Request, opts: { pacificHour?: number } = {}): NextResponse | null {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (opts.pacificHour !== undefined && new URL(req.url).searchParams.get("force") !== "1") {
    const hour = getPacificHour();
    if (hour !== opts.pacificHour) {
      return NextResponse.json({ skipped: true, reason: `Pacific hour is ${hour}, runs at ${opts.pacificHour}` });
    }
  }
  return null;
}
