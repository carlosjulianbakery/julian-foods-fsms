import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PrismaClient } from "@/generated/prisma";

const prisma = new PrismaClient();
export const dynamic = "force-dynamic";

interface BundleComponentInput {
  componentProductId: string;
  fsmsPresentationId: string;
  fsmsProductId: string;
  quantityPerBundle: number;
}

interface SaveBody {
  configType: "bundle" | "single" | "ignored";
  components?: BundleComponentInput[];
  upc?: string;
  fsmsPresentationId?: string;
  fsmsProductId?: string;
  ignoredReason?: string | null;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = params;
  const body = await request.json() as SaveBody;

  const product = await prisma.shipstationProduct.findUnique({ where: { id } });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  if (body.configType === "bundle") {
    const components = body.components ?? [];
    if (components.length === 0) {
      return NextResponse.json({ error: "Bundle must have at least one component" }, { status: 400 });
    }

    // Replace all bundle configs for this product
    await prisma.shipstationBundleConfig.deleteMany({ where: { bundleProductId: id } });
    for (const comp of components) {
      await prisma.shipstationBundleConfig.create({
        data: {
          bundleProductId: id,
          componentProductId: comp.componentProductId,
          fsmsPresentationId: comp.fsmsPresentationId,
          fsmsProductId: comp.fsmsProductId,
          quantityPerBundle: comp.quantityPerBundle,
          createdBy: (session.user as { id?: string }).id ?? "admin",
        },
      });
    }
    await prisma.shipstationProduct.update({
      where: { id },
      data: { configStatus: "bundle", isBundle: true, ignoredReason: null },
    });

  } else if (body.configType === "single") {
    if (!body.fsmsPresentationId || !body.upc) {
      return NextResponse.json({ error: "UPC and FSMS presentation required" }, { status: 400 });
    }

    await prisma.shipstationProduct.update({
      where: { id },
      data: {
        configStatus: "single_matched",
        upc: body.upc,
        fsmsPresentationId: body.fsmsPresentationId,
        fsmsProductId: body.fsmsProductId ?? null,
        isBundle: false,
        ignoredReason: null,
      },
    });

    // Also write the UPC to the FSMS product presentation if it was empty
    if (body.fsmsPresentationId) {
      const fsmsProducts = await prisma.product.findMany({ select: { id: true, presentations: true } });
      for (const fp of fsmsProducts) {
        const pres = (fp.presentations as Array<{ id: string; upc?: string }>) ?? [];
        const idx = pres.findIndex((p) => p.id === body.fsmsPresentationId);
        if (idx !== -1 && !pres[idx].upc) {
          pres[idx] = { ...pres[idx], upc: body.upc! };
          await prisma.product.update({
            where: { id: fp.id },
            data: { presentations: pres },
          });
          break;
        }
      }
    }

  } else if (body.configType === "ignored") {
    await prisma.shipstationBundleConfig.deleteMany({ where: { bundleProductId: id } });
    await prisma.shipstationProduct.update({
      where: { id },
      data: {
        configStatus: "ignored",
        ignoredReason: body.ignoredReason ?? null,
        fsmsPresentationId: null,
        fsmsProductId: null,
      },
    });
  } else {
    return NextResponse.json({ error: "Invalid configType" }, { status: 400 });
  }

  return NextResponse.json({ success: true, id });
}
