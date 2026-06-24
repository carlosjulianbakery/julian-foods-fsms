import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { list } from "@vercel/blob";

export const dynamic = "force-dynamic";

const TOTAL_BYTES = 500 * 1024 * 1024; // 500 MB Hobby Plan limit

// Simple 5-minute in-memory cache
let cache: { data: StorageResult; expiresAt: number } | null = null;

interface StorageResult {
  total_files: number;
  supplier_docs_count: number;
  form_templates_count: number;
  receiving_coas_count: number;
  total_bytes: number;
  total_mb: number;
  total_gb_limit: number;
  percentage_used: number;
  checked_at: string;
}

async function fetchStorageStats(): Promise<StorageResult> {
  let totalFiles = 0;
  let supplierDocsCount = 0;
  let formTemplatesCount = 0;
  let receivingCoasCount = 0;
  let totalBytes = 0;

  let cursor: string | undefined;
  do {
    const result = await list({ cursor, limit: 1000 });
    for (const blob of result.blobs) {
      totalFiles++;
      totalBytes += blob.size;
      if (blob.pathname.startsWith("supplier-docs/")) supplierDocsCount++;
      else if (blob.pathname.startsWith("form-templates/")) formTemplatesCount++;
      else if (blob.pathname.startsWith("receiving-coas/")) receivingCoasCount++;
    }
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);

  const totalMb = totalBytes / (1024 * 1024);
  return {
    total_files: totalFiles,
    supplier_docs_count: supplierDocsCount,
    form_templates_count: formTemplatesCount,
    receiving_coas_count: receivingCoasCount,
    total_bytes: totalBytes,
    total_mb: Math.round(totalMb * 100) / 100,
    total_gb_limit: 500,
    percentage_used: Math.round((totalBytes / TOTAL_BYTES) * 10000) / 100,
    checked_at: new Date().toISOString(),
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Return cached result if still fresh
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return NextResponse.json(cache.data);
  }

  try {
    const data = await fetchStorageStats();
    cache = { data, expiresAt: now + 5 * 60 * 1000 };
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/admin/storage-usage]", msg);
    return NextResponse.json({ error: "Failed to fetch storage stats", detail: msg }, { status: 500 });
  }
}
