import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const apiKey = process.env.SHIPSTATION_API_KEY;
  const apiSecret = process.env.SHIPSTATION_API_SECRET;

  console.log("ShipStation env check — API Key exists:", !!apiKey, "| Secret exists:", !!apiSecret);

  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "ShipStation API credentials not configured" },
      { status: 400 }
    );
  }

  const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  const headers = {
    Authorization: `Basic ${credentials}`,
    "Content-Type": "application/json",
  };

  try {
    const res = await fetch("https://ssapi.shipstation.com/stores", { headers });

    if (res.status === 401) {
      return NextResponse.json(
        { success: false, error: "Authentication failed — check API Key and Secret" },
        { status: 401 }
      );
    }

    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json(
        { success: false, error: `ShipStation API error: ${res.status} ${res.statusText}`, detail: body },
        { status: 500 }
      );
    }

    const data = await res.json() as Array<{
      storeId: number;
      storeName: string;
      marketplaceName: string;
      active: boolean;
    }>;

    const stores = data.map(({ storeId, storeName, marketplaceName, active }) => ({
      storeId,
      storeName,
      marketplaceName,
      active,
    }));

    return NextResponse.json({
      success: true,
      message: "Connected to ShipStation successfully",
      stores,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `ShipStation API error: ${msg}` },
      { status: 500 }
    );
  }
}
