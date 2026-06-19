import type { SupplierDocument, DocumentRequirement, SupplierStatus } from "@/generated/prisma";

const EXPIRING_SOON_DAYS = 30;

type DocWithReq = SupplierDocument & {
  requirement: Pick<DocumentRequirement, "id" | "name" | "requirementType" | "isRequired"> | null;
};

/**
 * Derive supplier status from their documents.
 * Priority order (highest to lowest): INACTIVE → PENDING → EXPIRED → EXPIRING_SOON → APPROVED
 */
export function computeSupplierStatus(
  documents: DocWithReq[],
  requirements: DocumentRequirement[],
  pendingObligationCount = 0
): SupplierStatus {
  // Only non-per-delivery required requirements count here
  const activeRequired = requirements.filter(
    (r) => r.isActive && r.isRequired && r.requirementType !== "PER_DELIVERY"
  );

  const now = new Date();
  const soonThreshold = new Date(now.getTime() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000);

  // Latest document per requirement
  const latestByReq = new Map<string, SupplierDocument>();
  for (const doc of documents) {
    if (!doc.requirementId) continue; // skip orphaned docs
    const existing = latestByReq.get(doc.requirementId);
    if (!existing || doc.uploadedAt > existing.uploadedAt) {
      latestByReq.set(doc.requirementId, doc);
    }
  }

  let hasExpired = false;
  let hasExpiringSoon = false;
  let hasMissing = pendingObligationCount > 0;

  if (activeRequired.length === 0 && !hasMissing) return "APPROVED";

  for (const req of activeRequired) {
    const doc = latestByReq.get(req.id);
    if (!doc) {
      hasMissing = true;
      continue;
    }
    if (doc.expiresAt) {
      if (doc.expiresAt <= now) hasExpired = true;
      else if (doc.expiresAt <= soonThreshold) hasExpiringSoon = true;
    }
  }

  if (hasMissing) return "PENDING";
  if (hasExpired) return "EXPIRED";
  if (hasExpiringSoon) return "EXPIRING_SOON";
  return "APPROVED";
}
