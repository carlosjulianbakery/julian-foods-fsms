import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { put } from "@vercel/blob";
import { computeSupplierStatus } from "@/lib/supplier-status";

const MAX_DIRECT_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB via serverless (keep for backward compat)

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const documents = await prisma.supplierDocument.findMany({
    where: { supplierId: params.id },
    include: { requirement: true },
    orderBy: { uploadedAt: "desc" },
  });

  return NextResponse.json(documents);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: "You must be logged in to upload documents." },
        { status: 401 }
      );
    }

    const { role, id: userId } = session.user as { role: string; id: string };
    if (role !== "ADMIN") {
      console.error(
        `Upload blocked: user role is ${role}, expected ADMIN. User id: ${userId}`
      );
      return NextResponse.json(
        {
          error:
            "You do not have permission to upload documents. Admin role required.",
        },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    // Client-side blob upload path: blobUrl + metadata fields instead of the raw file
    const blobUrl = formData.get("blobUrl") as string | null;
    const clientFileName = formData.get("fileName") as string | null;
    const clientFileSize = formData.get("fileSize") as string | null;
    const clientMimeType = formData.get("mimeType") as string | null;
    const requirementId = formData.get("requirementId") as string | null;
    const expiresAt = formData.get("expiresAt") as string | null;
    const notes = formData.get("notes") as string | null;
    const obligationId = formData.get("obligationId") as string | null;

    if (!file && !blobUrl) {
      return NextResponse.json({ error: "file or blobUrl is required" }, { status: 400 });
    }
    if (!requirementId && !obligationId) {
      return NextResponse.json(
        { error: "requirementId or obligationId is required" },
        { status: 400 }
      );
    }

    // Resolve final file metadata — either from an already-uploaded blob or the raw file
    let finalFileName: string;
    let finalFileSize: number;
    let finalMimeType: string;
    let finalBlobUrl: string;

    if (blobUrl) {
      // Client-side upload already completed; validate the metadata fields
      if (!clientFileName || !clientMimeType) {
        return NextResponse.json(
          { error: "fileName and mimeType are required with blobUrl" },
          { status: 400 }
        );
      }
      if (clientMimeType !== "application/pdf") {
        return NextResponse.json(
          { error: "Only PDF files are accepted. Please upload a PDF." },
          { status: 400 }
        );
      }
      finalFileName = clientFileName;
      finalFileSize = clientFileSize ? parseInt(clientFileSize, 10) : 0;
      finalMimeType = clientMimeType;
      finalBlobUrl = blobUrl;
    } else {
      // Legacy path: file sent through the serverless function
      const f = file!;
      if (f.type !== "application/pdf") {
        return NextResponse.json(
          { error: "Only PDF files are accepted. Please upload a PDF." },
          { status: 400 }
        );
      }
      if (f.size > MAX_DIRECT_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: "File exceeds the 10 MB limit. Please upload via the standard upload flow." },
          { status: 400 }
        );
      }
      finalFileName = f.name;
      finalFileSize = f.size;
      finalMimeType = f.type;

      // Upload to private Vercel Blob store
      const blobPathname = `supplier-docs/${params.id}/${requirementId ?? "misc"}/${Date.now()}-${f.name}`;
      let blob: Awaited<ReturnType<typeof put>>;
      try {
        blob = await put(blobPathname, f, { access: "private" });
      } catch (blobError) {
        console.error("[documents upload] Blob storage error:", blobError);
        return NextResponse.json(
          { error: "File storage error. Please try again or contact support." },
          { status: 500 }
        );
      }
      finalBlobUrl = blob.url;
    }

    // If fulfilling an obligation, fetch its receivingRecordId and lotNumber
    let obligationReceivingRecordId: string | null = null;
    let obligationLotNumber: string | null = null;
    let resolvedRequirementId = requirementId;

    if (obligationId) {
      const obl = await prisma.perDeliveryObligation.findUnique({
        where: { id: obligationId },
        select: { receivingRecordId: true, lotNumber: true, requirementId: true },
      });
      if (obl) {
        obligationReceivingRecordId = obl.receivingRecordId;
        obligationLotNumber = obl.lotNumber;
        resolvedRequirementId = resolvedRequirementId ?? obl.requirementId;
      }
    }

    let doc: Awaited<ReturnType<typeof prisma.supplierDocument.create>>;
    try {
      doc = await prisma.supplierDocument.create({
        data: {
          supplierId: params.id,
          requirementId: resolvedRequirementId ?? null,
          fileName: finalFileName,
          fileUrl: finalBlobUrl,
          fileSize: finalFileSize,
          mimeType: finalMimeType,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          notes: notes ?? null,
          receivingRecordId: obligationReceivingRecordId,
          lotNumber: obligationLotNumber,
        },
        include: { requirement: true },
      });
    } catch (dbError) {
      console.error("[documents upload] Database save error:", dbError);
      return NextResponse.json(
        {
          error:
            "File uploaded but could not be saved to records. Please contact admin.",
        },
        { status: 500 }
      );
    }

    // If obligation provided, mark it fulfilled
    if (obligationId) {
      try {
        await prisma.perDeliveryObligation.update({
          where: { id: obligationId },
          data: {
            status: "fulfilled",
            documentId: doc.id,
            fulfilledAt: new Date(),
          },
        });
      } catch (oblError) {
        console.error("[documents upload] Obligation update error:", oblError);
        return NextResponse.json(
          { error: "Document saved but obligation could not be marked fulfilled. Please contact admin." },
          { status: 500 }
        );
      }
    }

    // Recompute status
    try {
      const allDocs = await prisma.supplierDocument.findMany({
        where: { supplierId: params.id },
        include: { requirement: { select: { id: true, name: true, requirementType: true, isRequired: true } } },
      });
      const requirements = await prisma.documentRequirement.findMany({ where: { isActive: true } });
      const pendingCount = await prisma.perDeliveryObligation.count({ where: { supplierId: params.id, status: "pending" } });
      const computedStatus = computeSupplierStatus(allDocs, requirements, pendingCount);
      await prisma.supplier.update({ where: { id: params.id }, data: { status: computedStatus } });
    } catch (statusError) {
      console.error("[documents upload] Status recompute error:", statusError);
      // Non-fatal: document was saved successfully; status will reconcile on next load
    }

    const uploaderId = (session!.user as { id: string }).id;

    return NextResponse.json(doc, { status: 201 });
  } catch (unexpectedError) {
    console.error("[documents upload] Unexpected error:", unexpectedError);
    return NextResponse.json(
      { error: `An unexpected server error occurred: ${unexpectedError instanceof Error ? unexpectedError.message : String(unexpectedError)}` },
      { status: 500 }
    );
  }
}
