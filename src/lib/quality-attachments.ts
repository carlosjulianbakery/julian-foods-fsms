/**
 * Quality — attachments on incidents and CAPAs. Files live in the private Blob store and are only ever
 * reached through the download route, which checks the session first. Adding and removing each write
 * their history row in the same transaction. A removed attachment is only marked removed: the file stays.
 */
import {
  ATTACHMENT_KINDS, ATTACHMENT_MAX_BYTES, attachmentFolder, attachmentProblem, attachmentUrlBelongs, type AttachmentInput,
} from "@/lib/quality";
import { loadCapa, loadIncident, mustBeEditable, reason, recordEvent, refuse, write, type Actor, type Tx } from "@/lib/quality-server";

type Kind = "incident" | "capa";

/** The record an attachment belongs to; refuses a closed or void one (reopen it first). */
async function editableRecord(tx: Tx, recordType: unknown, recordId: unknown): Promise<{ type: Kind; id: string; reference: string }> {
  if ((recordType !== "incident" && recordType !== "capa") || typeof recordId !== "string") throw refuse(400, "Attachments belong to an incident or a CAPA.");
  const row = recordType === "incident" ? await loadIncident(tx, recordId) : await loadCapa(tx, recordId);
  mustBeEditable(row.status, recordType === "incident" ? "incident" : "CAPA");
  return { type: recordType, id: row.id, reference: row.reference };
}
const activeCount = (tx: Tx, type: Kind, id: string) => tx.qualityAttachment.count({ where: { recordType: type, recordId: id, removedAt: null } });

/**
 * First check, before the browser is given a short-lived upload token: the record must be open, the
 * type and size allowed, the limit of ten not reached, and the file must go into that record's folder.
 * Returns the limits the token itself enforces.
 */
export async function attachmentTokenOptions(pathname: string, clientPayload: string | null) {
  let input: (AttachmentInput & { recordId?: unknown }) | null = null;
  try { input = clientPayload ? JSON.parse(clientPayload) : null; } catch { input = null; }
  if (!input) throw refuse(400, "Missing upload details.");
  return write(async (tx) => {
    const record = await editableRecord(tx, input!.recordType, input!.recordId);
    const problem = attachmentProblem(input!, await activeCount(tx, record.type, record.id));
    if (problem) throw refuse(400, problem);
    if (!pathname.startsWith(attachmentFolder(record.type, record.id))) throw refuse(400, "The file is not being stored with its record.");
    // The token only lets this one content type through, up to the size limit; a random suffix keeps names from clashing
    return { allowedContentTypes: [input!.mimeType as string], maximumSizeInBytes: ATTACHMENT_MAX_BYTES, addRandomSuffix: true };
  });
}

/** Second check, when the uploaded file is recorded on its record. Writes the "attachment added" event with it. */
export function addAttachment(actor: Actor, body: (AttachmentInput & { recordId?: unknown; fileUrl?: unknown }) | null) {
  return write(async (tx) => {
    const record = await editableRecord(tx, body?.recordType, body?.recordId);
    const problem = attachmentProblem(body ?? {}, await activeCount(tx, record.type, record.id));
    if (problem) throw refuse(400, problem);
    if (!attachmentUrlBelongs(body!.fileUrl, record.type, record.id)) throw refuse(400, "That file was not uploaded for this record.");
    const description = typeof body!.description === "string" ? body!.description.trim() : "";
    const row = await tx.qualityAttachment.create({
      data: {
        recordType: record.type, recordId: record.id, kind: body!.kind as string, fileName: (body!.fileName as string).trim(), fileUrl: body!.fileUrl as string,
        fileSize: body!.fileSize as number, mimeType: body!.mimeType as string, description, uploadedById: actor.id,
      },
    });
    await recordEvent(tx, {
      type: record.type, id: record.id, reference: record.reference, action: "attachment_added", actor,
      changes: [{ field: "attachment", from: null, to: row.fileName }], note: `${ATTACHMENT_KINDS[row.kind]}${description ? `: ${description}` : ""}`,
    });
    return { id: row.id };
  });
}

/** Marks an attachment removed, with a required reason. The file itself is kept; the history records who, when and why. */
export function removeAttachment(actor: Actor, id: string, why: unknown) {
  return write(async (tx) => {
    const row = await tx.qualityAttachment.findUnique({ where: { id } });
    if (!row) throw refuse(404, "Attachment not found.");
    if (row.removedAt) throw refuse(409, "This attachment was already removed.");
    const record = await editableRecord(tx, row.recordType, row.recordId);
    const note = reason(why, "removing this attachment");
    await tx.qualityAttachment.update({ where: { id }, data: { removedAt: new Date(), removedById: actor.id, removeReason: note } });
    await recordEvent(tx, { type: record.type, id: record.id, reference: record.reference, action: "attachment_removed", actor, changes: [{ field: "attachment", from: row.fileName, to: null }], note });
    return { removed: row.fileName };
  });
}
