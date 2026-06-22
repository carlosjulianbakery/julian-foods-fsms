import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const materialId = searchParams.get("material_id");
  const type = searchParams.get("type") as "ingredient" | "packaging" | null;

  if (!materialId || !type || (type !== "ingredient" && type !== "packaging")) {
    return NextResponse.json({ error: "material_id and type (ingredient|packaging) required" }, { status: 400 });
  }

  try {
    let rows: Array<{ lot_number: string; last_used: Date }>;

    if (type === "ingredient") {
      rows = await prisma.$queryRaw<Array<{ lot_number: string; last_used: Date }>>`
        WITH lot_dates AS (
          SELECT
            lot->>'lot_number'  AS lot_number,
            s."submittedAt"     AS submitted_at
          FROM batch_sheet_submissions s,
            jsonb_array_elements(s."section3"->'ingredients') AS ing,
            jsonb_array_elements(ing->'lots')                 AS lot
          WHERE s.status IN ('COMPLETE', 'PASS', 'PASS_WITH_ISSUES', 'FAIL')
            AND ing->>'material_id'     = ${materialId}
            AND lot->>'lot_number'      IS NOT NULL
            AND lot->>'lot_number'      != ''
            AND lot->>'inventory_lot_id' IS NULL
        ),
        deduped AS (
          SELECT lot_number, MAX(submitted_at) AS last_used
          FROM lot_dates
          GROUP BY lot_number
        )
        SELECT lot_number, last_used
        FROM deduped
        ORDER BY last_used DESC
        LIMIT 2
      `;
    } else {
      rows = await prisma.$queryRaw<Array<{ lot_number: string; last_used: Date }>>`
        WITH lot_dates AS (
          SELECT
            lot->>'lot_number'  AS lot_number,
            s."submittedAt"     AS submitted_at
          FROM batch_sheet_submissions s,
            jsonb_array_elements(s."section3"->'presentations') AS pres,
            jsonb_array_elements(pres->'materials')             AS mat,
            jsonb_array_elements(mat->'lots')                   AS lot
          WHERE s.status IN ('COMPLETE', 'PASS', 'PASS_WITH_ISSUES', 'FAIL')
            AND mat->>'id'               = ${materialId}
            AND lot->>'lot_number'       IS NOT NULL
            AND lot->>'lot_number'       != ''
            AND lot->>'inventory_lot_id' IS NULL
        ),
        deduped AS (
          SELECT lot_number, MAX(submitted_at) AS last_used
          FROM lot_dates
          GROUP BY lot_number
        )
        SELECT lot_number, last_used
        FROM deduped
        ORDER BY last_used DESC
        LIMIT 2
      `;
    }

    const result = rows.map((r) => ({
      lot_number: r.lot_number,
      last_used_date: new Date(r.last_used).toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      }),
    }));

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/batch-sheet/recent-lots]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
