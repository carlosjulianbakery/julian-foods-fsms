import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";

export const dynamic = "force-dynamic";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SwabAttempt {
  attempt_number: number;
  equipment_swabbed: string;
  time_recorded: string;
  result: "pass" | "fail";
  initials: string;
}
interface AllergenSection {
  changeover_required: boolean;
  previous_product_name: string | null;
  previous_product_allergens: string[] | null;
  swab_attempts: SwabAttempt[] | null;
  final_result: "pass" | "not_required" | null;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as { role?: string }).role ?? "";
    if (role !== "SUPERVISOR" && role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const allergenFilter = searchParams.getAll("allergen");
    const dateFrom       = searchParams.get("date_from") ?? "";
    const dateTo         = searchParams.get("date_to")   ?? "";
    const productFilter  = searchParams.get("product")   ?? "";
    const attemptsFilter = searchParams.get("attempts")  ?? "";

    const where: Prisma.BatchSheetSubmissionWhereInput = {
      status: { notIn: ["IN_PROGRESS", "DRAFT"] },
      ...(dateFrom && { productionDate: { gte: new Date(dateFrom) } }),
      ...(dateTo   && { productionDate: { lte: new Date(dateTo + "T23:59:59") } }),
    };

    const submissions = await prisma.batchSheetSubmission.findMany({
      where,
      orderBy: { productionDate: "desc" },
      select: {
        id:               true,
        templateName:     true,
        productionDate:   true,
        supervisorName:   true,
        notes:            true,
        section2_allergen: true,
      },
    });

    // Filter to only rows with an allergen changeover
    const allergenRows = submissions.filter((sub) => {
      if (!sub.section2_allergen) return false;
      const a = sub.section2_allergen as unknown as AllergenSection;
      return a.changeover_required === true;
    });

    // Apply remaining JS-side filters
    const filtered = allergenRows.filter((sub) => {
      const a = sub.section2_allergen as unknown as AllergenSection;

      if (productFilter && sub.templateName !== productFilter) return false;

      if (allergenFilter.length > 0) {
        const present = a.previous_product_allergens ?? [];
        const matches = allergenFilter.some((af) =>
          present.some((p) => p.toLowerCase().includes(af.toLowerCase()))
        );
        if (!matches) return false;
      }

      if (attemptsFilter && attemptsFilter !== "any") {
        const count = (a.swab_attempts ?? []).length;
        if (attemptsFilter === "1"  && count !== 1) return false;
        if (attemptsFilter === "2"  && count !== 2) return false;
        if (attemptsFilter === "3+" && count <  3)  return false;
      }

      return true;
    });

    const rows = filtered.map((sub) => {
      const a = sub.section2_allergen as unknown as AllergenSection;
      const attempts = a.swab_attempts ?? [];
      const passingAtt = attempts.find((att) => att.result === "pass");
      const failCount  = attempts.filter((att) => att.result === "fail").length;

      let observations = "";
      if (failCount > 0) {
        observations = `Failed ${failCount} time${failCount > 1 ? "s" : ""} before passing. Re-cleaning performed.`;
      } else if (attempts.length === 1 && attempts[0].result === "pass") {
        observations = "Passed on first attempt.";
      }
      if (sub.notes?.trim()) {
        observations = observations ? `${observations} ${sub.notes.trim()}` : sub.notes.trim();
      }

      return {
        id:                    sub.id,
        date:                  sub.productionDate.toISOString().split("T")[0],
        previous_product:      a.previous_product_name ?? "—",
        allergens:             (a.previous_product_allergens ?? []).join(", ") || "—",
        allergens_array:       a.previous_product_allergens ?? [],
        current_product:       sub.templateName,
        attempts_to_pass:      attempts.length,
        equipment_on_passing:  passingAtt?.equipment_swabbed ?? "—",
        time_cleared:          passingAtt?.time_recorded ?? "—",
        observations,
        supervisor_name:       sub.supervisorName,
        notes:                 sub.notes ?? null,
        swab_attempts:         attempts,
      };
    });

    // Unique product names for dropdown
    const allProducts = await prisma.batchSheetSubmission.findMany({
      where: { status: { notIn: ["IN_PROGRESS", "DRAFT"] } },
      select: { templateName: true },
      distinct: ["templateName"],
      orderBy: { templateName: "asc" },
    });

    return NextResponse.json({
      rows,
      total_count:  rows.length,
      product_list: allProducts.map((p) => p.templateName),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/logs/allergen-changeover]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
