/**
 * TEMPORARY diagnostic route — delete after use.
 * GET /api/admin/check-users
 *
 * Admin-only. Audits the User table for role casing issues and
 * optionally fixes them via ?fix=true.
 */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export async function GET(req: NextRequest) {
  // ── Auth guard ────────────────────────────────────────────────────────────
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  const applyFix = req.nextUrl.searchParams.get("fix") === "true";
  const output: string[] = [];

  // ── 1. Database host ──────────────────────────────────────────────────────
  const dbUrl = process.env.DATABASE_URL ?? "";
  let dbHost = "(DATABASE_URL not set)";
  try {
    // Extract everything between the last @ and the next /
    const match = dbUrl.match(/@([^/]+)\//);
    dbHost = match ? match[1] : "(could not parse host)";
  } catch {
    dbHost = "(parse error)";
  }
  const hostLine = `Database host: ${dbHost}`;
  output.push(hostLine);
  console.log("[check-users]", hostLine);

  // ── 2. User audit ─────────────────────────────────────────────────────────
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  output.push(`\nTotal users: ${users.length}`);
  console.log(`[check-users] Total users: ${users.length}`);

  const rows = users.map((u) => ({
    id:        u.id,
    name:      u.name,
    email:     u.email,
    role:      u.role,
    createdAt: u.createdAt,
    roleOk:    u.role === u.role.toUpperCase(),
  }));

  rows.forEach((u) => {
    const flag = u.roleOk ? "✓" : "✗ NEEDS FIX";
    const line = `  ${flag}  ${u.email}  role="${u.role}"  id=${u.id}`;
    output.push(line);
    console.log("[check-users]", line);
  });

  const badRoles = rows.filter((u) => !u.roleOk);
  output.push(`\nUsers with incorrect role casing: ${badRoles.length}`);
  console.log(`[check-users] Users with incorrect role casing: ${badRoles.length}`);

  // ── 3. Fix (only when ?fix=true) ─────────────────────────────────────────
  let fixedCount = 0;
  if (badRoles.length === 0) {
    const msg = "All roles are correctly uppercase — no fix needed.";
    output.push(msg);
    console.log("[check-users]", msg);
  } else if (applyFix) {
    for (const u of badRoles) {
      await prisma.user.update({
        where: { id: u.id },
        data:  { role: u.role.toUpperCase() as Role },
      });
      fixedCount++;
    }
    const msg = `Updated ${fixedCount} user(s) with incorrect role casing.`;
    output.push(msg);
    console.log("[check-users]", msg);
  } else {
    const msg = "Pass ?fix=true to apply the uppercase fix.";
    output.push(msg);
    console.log("[check-users]", msg);
  }

  return NextResponse.json({
    db_host:      dbHost,
    users:        rows,
    bad_role_count: badRoles.length,
    fixed:        fixedCount,
    output,
  });
}
