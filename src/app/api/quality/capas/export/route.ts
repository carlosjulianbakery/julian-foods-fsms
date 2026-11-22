import { NextRequest } from "next/server";
import { exportFile } from "@/lib/quality-export-data";
import { requireQuality } from "@/lib/quality-server";

export const dynamic = "force-dynamic";

// GET /api/quality/capas/export — the list as a CSV file. The list's filters come in the address and are applied
// again here, on the server; the browser never says which records to export. Admins only: 401 without a session,
// 403 otherwise.
export async function GET(req: NextRequest) {
  const auth = await requireQuality();
  if (auth.response) return auth.response;
  return exportFile("capas", req.nextUrl);
}
