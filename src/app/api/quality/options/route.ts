import { qualityOptions, qualityRoute } from "@/lib/quality-server";

export const dynamic = "force-dynamic";

// GET /api/quality/options — products, the admins who can own a CAPA, and today's Pacific date
export const GET = () => qualityRoute(() => qualityOptions());
