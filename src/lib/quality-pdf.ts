/**
 * Quality — the PDF of one record (a Customer Incident or a CAPA).
 *
 * The exporter (pdfExport624) turns the HTML into one tall picture and cuts it every A4 page height. So,
 * like the Foreign Matter builder, this one lays the record out as explicit pages, each exactly one A4
 * page tall (the same page geometry, FM_PDF). Everything on a page is a block of known height:
 *  - text is wrapped here, line by line, with a deliberately generous estimate of each character's
 *    width, and every line is one block — so long text flows from page to page and no line is ever cut;
 *  - a table row is one block and moves to the next page whole; a row too tall for a page is continued
 *    at a line boundary;
 *  - when a table goes on to another page its title and column headings are repeated.
 * Nothing here touches the database. File contents are never embedded: attachments are listed.
 */
import { FM_PDF } from "@/components/forms624/pdfBuilders624";
import {
  ACTION_LABELS, ATTACHMENT_KINDS, CAPA_SOURCES, CAPA_STATUSES, CATEGORIES, CHANNELS, INCIDENT_STATUSES, RESPONSE_CHANNELS, describeChange, facilityLabel, formatBytes,
  formatDay, formatMoment, type AttachmentRow, type Change, type EventAction,
} from "@/lib/quality";

export const Q_PDF = {
  /** The page: the same A4 block, padding and footer the Foreign Matter PDF uses. */
  pageWidth: 794, pageHeight: FM_PDF.pageHeight, padding: FM_PDF.padding, footerHeight: FM_PDF.footerHeight,
  titleHeight: 66,
  sectionHeight: 32,
  /** Fields: a label column and a value column, one block per line of the value. */
  fieldFont: 11, fieldLine: 15, fieldTop: 6, labelShare: 0.3,
  /** Tables. */
  tableFont: 10, tableLine: 13, rowPadding: 9, tableHeadHeight: 22, continuedTitleHeight: 20,
  /** A row with more lines than this is continued in a second block, so a block always fits on a page. */
  maxRowLines: 40,
  bannerHeadHeight: 28, bannerFoot: 10,
  noteHeight: 22,
};
export const pdfContentWidth = Q_PDF.pageWidth - 2 * Q_PDF.padding;
/** The height available for blocks on one page. */
export const pdfCapacity = Q_PDF.pageHeight - 2 * Q_PDF.padding - Q_PDF.footerHeight;

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── Measuring and wrapping text ─────────────────────────────────────────────────

/** The width of one character in Arial, as a share of the font size. Rounded UP by class, so a line is never wider than estimated. */
export function charWidth(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  if (code > 0x2e7f) return 1.4; // East Asian characters, emoji
  if (code > 0x7e) return 1; // accented letters, dashes, arrows
  if (ch === "W" || ch === "@") return 1.02;
  if (ch === "M" || ch === "m" || ch === "%") return 0.89;
  if ((ch >= "A" && ch <= "Z") || ch === "w" || ch === "&") return 0.78;
  if (" !,.:;/'()[]|`-{}*\"\\".includes(ch)) return 0.39;
  return 0.59;
}
export function textWidth(text: string, fontPx: number, bold = false): number {
  let em = 0;
  for (const ch of text) em += charWidth(ch);
  return em * fontPx * (bold ? 1.1 : 1);
}

/**
 * Breaks text into lines that fit `widthPx`. Line breaks typed by the person are kept (an empty line
 * stays an empty line); a word wider than the line is cut into pieces that fit.
 */
export function wrapText(text: string | null | undefined, widthPx: number, fontPx: number, bold = false): string[] {
  const max = widthPx * 0.97;
  const width = (s: string) => textWidth(s, fontPx, bold);
  const paragraphs = String(text ?? "").replace(/\r\n?/g, "\n").split("\n").map((p) => p.replace(/\s+/g, " ").trim());
  while (paragraphs.length && !paragraphs[0]) paragraphs.shift();
  while (paragraphs.length && !paragraphs[paragraphs.length - 1]) paragraphs.pop();
  const out: string[] = [];
  for (const paragraph of paragraphs) {
    if (!paragraph) { out.push(""); continue; }
    let line = "";
    for (let word of paragraph.split(" ")) {
      while (width(word) > max) {
        if (line) { out.push(line); line = ""; }
        const chars = Array.from(word);
        let piece = chars[0];
        let i = 1;
        while (i < chars.length && width(piece + chars[i]) <= max) piece += chars[i++];
        out.push(piece);
        word = chars.slice(i).join("");
      }
      if (!word) continue;
      const next = line ? `${line} ${word}` : word;
      if (width(next) <= max) line = next;
      else { out.push(line); line = word; }
    }
    if (line) out.push(line);
  }
  return out.length ? out : [""];
}

// ── Blocks ──────────────────────────────────────────────────────────────────────

/** One block of the PDF: it has a fixed height and is never split. */
export interface PdfBlock {
  kind: "title" | "banner" | "section" | "field" | "tableHead" | "row" | "note";
  height: number;
  /** The text the block shows (for tests and for reading the layout). */
  text: string;
  /** `continued` is true when this block is the first on a page and goes on from the page before. */
  html: (continued: boolean) => string;
  /** Blocks that belong together: one field's lines, or one table's rows. */
  group?: string;
  /** Must stay on the same page as the block after it (a heading is never left alone at the foot of a page). */
  keepWithNext?: boolean;
  /** What is repeated at the top of a page when this block's group goes on there. */
  repeat?: { height: number; text: string; html: string };
}

const section = (title: string): PdfBlock => ({
  kind: "section", height: Q_PDF.sectionHeight, text: title, keepWithNext: true, html: () => `<h2 style="height:${Q_PDF.sectionHeight}px">${esc(title)}</h2>`,
});

const labelWidth = pdfContentWidth * Q_PDF.labelShare - 10;
const valueWidth = pdfContentWidth * (1 - Q_PDF.labelShare) - 10;

/** A field: its label and its value, one block per line of the value. A long value flows across pages. */
function field(key: string, label: string, value: string | null | undefined): PdfBlock[] {
  const lines = wrapText(value?.trim() ? value : "—", valueWidth, Q_PDF.fieldFont);
  return lines.map((line, i) => {
    const height = Q_PDF.fieldLine + (i === 0 ? Q_PDF.fieldTop : 0);
    return {
      kind: "field" as const, group: `field:${key}`, text: line, height, keepWithNext: i === 0 && lines.length > 1,
      html: (continued: boolean) =>
        `<table class="f${i === 0 ? " first" : ""}" style="height:${height}px" data-field="${esc(key)}"><tr><td class="k">${i === 0 ? esc(label) : continued ? `${esc(label)} (cont.)` : ""}</td><td class="v">${esc(line) || "&nbsp;"}</td></tr></table>`,
    };
  });
}

interface Col { label: string; share: number }

/** A table: its title, its column headings and one block per row. Title and headings are repeated on every page it reaches. */
function table(name: string, title: string, cols: Col[], rows: string[][], empty: string): PdfBlock[] {
  const colgroup = `<colgroup>${cols.map((c) => `<col style="width:${(c.share * 100).toFixed(2)}%"/>`).join("")}</colgroup>`;
  const headHtml = `<table class="t" style="height:${Q_PDF.tableHeadHeight}px" data-table-head="${name}">${colgroup}<tr>${cols.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr></table>`;
  const headText = cols.map((c) => c.label).join(" | ");
  const out: PdfBlock[] = [{ ...section(title), text: title }];
  if (rows.length === 0) {
    out.push({ kind: "note", height: Q_PDF.noteHeight, text: empty, html: () => `<p class="note" style="height:${Q_PDF.noteHeight}px">${esc(empty)}</p>` });
    return out;
  }
  out.push({ kind: "tableHead", height: Q_PDF.tableHeadHeight, text: headText, keepWithNext: true, html: () => headHtml });
  const repeat = {
    height: Q_PDF.continuedTitleHeight + Q_PDF.tableHeadHeight, text: `${title} (continued) | ${headText}`,
    html: `<h3 style="height:${Q_PDF.continuedTitleHeight}px" data-continued="${name}">${esc(title)} (continued)</h3>${headHtml}`,
  };
  rows.forEach((cells, r) => {
    const wrapped = cols.map((c, i) => wrapText(cells[i] ?? "", pdfContentWidth * c.share - 10, Q_PDF.tableFont));
    const total = Math.max(...wrapped.map((w) => w.length));
    for (let from = 0; from < total; from += Q_PDF.maxRowLines) {
      const part = wrapped.map((w) => w.slice(from, from + Q_PDF.maxRowLines));
      const lines = Math.max(...part.map((w) => w.length));
      const height = Q_PDF.rowPadding + lines * Q_PDF.tableLine;
      // A row continued from a block above says so in its first column
      if (from > 0 && part[0].length === 0) part[0] = ["(continued)"];
      out.push({
        kind: "row", group: `table:${name}`, repeat, height, text: part.map((w) => w.join(" ")).join(" | "),
        html: () => `<table class="t" style="height:${height}px" data-row="${name}:${r}">${colgroup}<tr>${part.map((w) => `<td>${w.map((l) => `<div class="l">${esc(l) || "&nbsp;"}</div>`).join("")}</td>`).join("")}</tr></table>`,
      });
    }
  });
  return out;
}

// ── The record ──────────────────────────────────────────────────────────────────

export interface QualityPdfEvent { action: string; userName: string; createdAt: string; changes: Change[]; note: string | null }
export interface QualityPdfInput {
  type: "incident" | "capa";
  /** The record as the pages get it: days as YYYY-MM-DD, moments as ISO strings. */
  record: Record<string, unknown>;
  /** User (and product) names by id. */
  names: Record<string, string>;
  /** The linked records: the CAPA of an incident, or the incidents of a CAPA. References and status only. */
  linked: { reference: string; status: string }[];
  attachments: AttachmentRow[];
  events: QualityPdfEvent[];
  generatedAt: string;
  generatedBy: string;
}

export const PDF_TYPE_LABEL: Record<"incident" | "capa", string> = { incident: "Customer Incident", capa: "Corrective and Preventive Action (CAPA)" };
const yesNo = (v: unknown) => (v === true ? "Yes" : "No");

/** Every block of the record's PDF, in order. Exported so the layout can be tested. */
export function qualityPdfBlocks(p: QualityPdfInput): PdfBlock[] {
  const r = p.record;
  const s = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : "");
  const name = (id: string) => p.names[id] ?? "";
  const status = s("status");
  const statusLabel = (p.type === "incident" ? INCIDENT_STATUSES : CAPA_STATUSES)[status] ?? status;
  const reference = s("reference");
  const blocks: PdfBlock[] = [];

  // 1. Reference, record type, status
  const createdBy = name(s("createdById"));
  const sub1 = `Record type: ${PDF_TYPE_LABEL[p.type]}  |  Status: ${statusLabel}  |  Facility: ${facilityLabel(s("facility"))}${r.foodSafetyConcern === true ? "  |  FOOD SAFETY CONCERN" : ""}`;
  const sub2 = `Created ${formatMoment(s("createdAt"))}${createdBy ? ` by ${createdBy}` : ""}  |  Last changed ${formatMoment(s("updatedAt"))}`;
  blocks.push({
    kind: "title", height: Q_PDF.titleHeight, text: `${reference} | ${sub1} | ${sub2}`,
    html: () => `<div class="title" style="height:${Q_PDF.titleHeight}px"><h1>${esc(reference)} <span class="type">${esc(PDF_TYPE_LABEL[p.type])}</span> <span class="badge${status === "void" ? " void" : ""}">${esc(statusLabel.toUpperCase())}</span></h1><p class="sub">${esc(sub1)}</p><p class="sub">${esc(sub2)}</p></div>`,
  });

  // The VOID banner: the reason, who and when
  if (status === "void") {
    const who = name(s("voidedById"));
    const head = `VOID — this record was voided on ${formatMoment(s("voidedAt"))}${who ? ` by ${who}` : ""}. It is kept for the record.`;
    const reason = wrapText(`Reason: ${s("voidReason") || "—"}`, pdfContentWidth - 30, Q_PDF.fieldFont, true);
    blocks.push({ kind: "banner", group: "void", height: Q_PDF.bannerHeadHeight, text: head, keepWithNext: true, html: () => `<div class="void head" style="height:${Q_PDF.bannerHeadHeight}px" data-void-banner>${esc(head)}</div>` });
    reason.forEach((line, i) => {
      const height = Q_PDF.fieldLine + (i === reason.length - 1 ? Q_PDF.bannerFoot : 0);
      blocks.push({ kind: "banner", group: "void", height, text: line, html: () => `<div class="void" style="height:${height}px">${esc(line) || "&nbsp;"}</div>` });
    });
  }

  // 2. The record's fields, as on the record page
  const closedBy = s("closedByName") || name(s("closedById"));
  const closure = (extra: PdfBlock[]) => [
    section("Closure"),
    ...field("closure.status", "Status", statusLabel),
    ...field("closure.closedDate", "Closed date", status === "closed" ? formatDay(s("closedDate")) : "Not closed"),
    ...field("closure.closedBy", "Closed by", status === "closed" ? closedBy || "—" : "—"),
    ...extra,
  ];
  if (p.type === "incident") {
    const linkedCapa = p.linked[0];
    const decision = linkedCapa ? `A CAPA is linked: ${linkedCapa.reference}` : r.capaRequired === false ? "No CAPA needed" : "Not decided";
    blocks.push(
      section("The incident"),
      ...field("dateReceived", "Date received", formatDay(s("dateReceived"))),
      ...field("channel", "How it came in", CHANNELS[s("channel")] ?? s("channel")),
      ...field("customer", "Customer or account", s("customer")),
      ...field("facility", "Facility", facilityLabel(s("facility"))),
      ...field("productName", "Product", s("productName")),
      ...field("lotCode", "Lot code", s("lotCode")),
      ...field("bestByDate", "Best-by date", formatDay(s("bestByDate"))),
      ...field("description", "What happened", s("description")),
      ...field("category", "Category", CATEGORIES[s("category")] ?? s("category")),
      ...field("foodSafetyConcern", "Food safety concern", yesNo(r.foodSafetyConcern)),
      ...field("immediateAction", "Immediate action taken", s("immediateAction")),
      section("Response to the customer"),
      ...field("responseDate", "Response date", formatDay(s("responseDate"))),
      ...field("responseChannel", "Response channel", RESPONSE_CHANNELS[s("responseChannel")] ?? s("responseChannel")),
      ...field("responseSummary", "Response summary", s("responseSummary")),
      // 3. Closure, and the decisions closing depends on
      ...closure([
        ...field("closure.category", "Category", CATEGORIES[s("category")] ?? s("category")),
        ...field("closure.responseDate", "Response date", formatDay(s("responseDate"))),
        ...field("closure.capaDecision", "CAPA decision", decision),
        ...(r.capaRequired === false || s("noCapaReason") ? field("closure.noCapaReason", "Reason no CAPA is needed", s("noCapaReason")) : []),
      ]),
    );
  } else {
    blocks.push(
      section("The problem"),
      ...field("source", "Source", CAPA_SOURCES[s("source")] ?? s("source")),
      ...field("facility", "Facility", facilityLabel(s("facility"))),
      ...field("problem", "The problem", s("problem")),
      ...field("rootCause", "Root cause", s("rootCause")),
      section("Actions"),
      ...field("correctiveAction", "Corrective action", s("correctiveAction")),
      ...field("preventiveAction", "Preventive action", s("preventiveAction")),
      ...field("ownerId", "Owner", name(s("ownerId"))),
      ...field("dueDate", "Due date", formatDay(s("dueDate"))),
      section("Effectiveness check"),
      ...field("effectivenessDate", "Date of the check", formatDay(s("effectivenessDate"))),
      ...field("effectivenessResult", "Result", s("effectivenessResult")),
      ...closure([]),
    );
  }

  // 4. Linked records: references and status only
  blocks.push(...table(
    "linked", p.type === "incident" ? "Linked CAPA" : `Linked incidents (${p.linked.length})`,
    [{ label: "Reference", share: 0.3 }, { label: "Record type", share: 0.4 }, { label: "Status", share: 0.3 }],
    p.linked.map((l) => [l.reference, PDF_TYPE_LABEL[p.type === "incident" ? "capa" : "incident"], (p.type === "incident" ? CAPA_STATUSES : INCIDENT_STATUSES)[l.status] ?? l.status]),
    p.type === "incident" ? "No CAPA is linked to this incident." : "No incident is linked to this CAPA.",
  ));

  // 5. Attachments: listed, never embedded
  blocks.push(...table(
    "attachments", `Attachments (${p.attachments.filter((a) => !a.removedAt).length})`,
    [{ label: "File name", share: 0.2 }, { label: "Kind", share: 0.12 }, { label: "Description", share: 0.16 }, { label: "Uploaded by", share: 0.12 }, { label: "Uploaded (PT)", share: 0.2 }, { label: "State", share: 0.2 }],
    p.attachments.map((a) => [
      `${a.fileName}${a.fileSize ? ` (${formatBytes(a.fileSize)})` : ""}`, ATTACHMENT_KINDS[a.kind] ?? a.kind, a.description || "—", a.uploadedByName || "—", formatMoment(a.uploadedAt),
      a.removedAt ? `REMOVED\n${formatMoment(a.removedAt)}${a.removedByName ? `\nby ${a.removedByName}` : ""}\nReason: ${a.removeReason || "—"}` : "Attached",
    ]),
    "No attachments. (File contents are not included in this document.)",
  ));

  // 6. The full history
  blocks.push(...table(
    "history", `History (${p.events.length})`,
    [{ label: "Date and time (PT)", share: 0.2 }, { label: "Person", share: 0.14 }, { label: "Action", share: 0.13 }, { label: "Field: from → to", share: 0.35 }, { label: "Note", share: 0.18 }],
    p.events.map((e) => [
      formatMoment(e.createdAt), e.userName || "Unknown", ACTION_LABELS[e.action as EventAction] ?? e.action,
      e.changes.map((c) => describeChange(p.type, c, p.names)).join("\n") || "—", e.note || "—",
    ]),
    "No history.",
  ));
  return blocks;
}

// ── Pages ───────────────────────────────────────────────────────────────────────

export interface PdfPage { items: { height: number; text: string; html: string; kind: PdfBlock["kind"] | "repeat"; group?: string }[]; used: number }

/** Deals the blocks into pages. A block is never split, and a heading never ends a page. Exported so the rule can be tested. */
export function paginateBlocks(blocks: PdfBlock[], capacity = pdfCapacity): PdfPage[] {
  const pages: PdfPage[] = [{ items: [], used: 0 }];
  const page = () => pages[pages.length - 1];
  blocks.forEach((block, i) => {
    // What has to fit together with this block
    let needed = block.height;
    for (let j = i; blocks[j].keepWithNext && j + 1 < blocks.length; j++) needed += blocks[j + 1].height;
    const goesOn = i > 0 && !!block.group && blocks[i - 1].group === block.group;
    let continued = false;
    if (page().used + needed > capacity && page().items.length > 0) {
      pages.push({ items: [], used: 0 });
      continued = goesOn;
      if (continued && block.repeat) {
        page().items.push({ height: block.repeat.height, text: block.repeat.text, html: block.repeat.html, kind: "repeat", group: block.group });
        page().used += block.repeat.height;
      }
    }
    page().items.push({ height: block.height, text: block.text, html: block.html(continued), kind: block.kind, group: block.group });
    page().used += block.height;
  });
  return pages;
}

export const qualityPdfPages = (p: QualityPdfInput) => paginateBlocks(qualityPdfBlocks(p));

export function buildQualityPdfHtml(p: QualityPdfInput): string {
  const pages = qualityPdfPages(p);
  const reference = String(p.record.reference ?? "");
  const isVoid = p.record.status === "void";
  const body = pages.map((pg, n) => `
  <div class="page" data-page="${n + 1}">
    ${pg.items.map((i) => i.html).join("\n    ")}
    <p class="footer">Generated ${esc(formatMoment(p.generatedAt))} by ${esc(p.generatedBy || "Unknown")} &nbsp;|&nbsp; ${esc(reference)}${isVoid ? " &nbsp;|&nbsp; VOID" : ""} &nbsp;|&nbsp; Julian Bakery — Quality &nbsp;|&nbsp; Page ${n + 1} of ${pages.length}</p>
  </div>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <style>
    html, body { margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; color: #111; }
    .page { position: relative; box-sizing: border-box; width: ${Q_PDF.pageWidth}px; height: ${Q_PDF.pageHeight}px; padding: ${Q_PDF.padding}px; overflow: hidden; page-break-after: always; }
    .title { overflow: hidden; }
    h1 { font-size: 20px; line-height: 26px; margin: 0 0 4px; font-family: monospace; }
    h1 .type { font-family: Arial, sans-serif; font-size: 14px; font-weight: 600; color: #374151; }
    .badge { display: inline-block; padding: 0 8px; border-radius: 9999px; font-family: Arial, sans-serif; font-size: 11px; line-height: 18px; font-weight: 700; background: #e5e7eb; color: #111; vertical-align: middle; }
    .badge.void { background: #111; color: #fff; }
    p.sub { font-size: 11px; line-height: 15px; color: #4b5563; margin: 0; white-space: nowrap; }
    h2 { font-size: 13px; line-height: 16px; margin: 0; padding-top: 12px; box-sizing: border-box; text-transform: uppercase; letter-spacing: .03em; overflow: hidden; }
    h3 { font-size: 11px; line-height: 14px; margin: 0; padding-top: 2px; box-sizing: border-box; color: #374151; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    table.f td { padding: 0 5px; font-size: ${Q_PDF.fieldFont}px; line-height: ${Q_PDF.fieldLine}px; vertical-align: top; white-space: nowrap; }
    table.f.first td { padding-top: ${Q_PDF.fieldTop - 1}px; border-top: 1px solid #e5e7eb; }
    table.f td.k { width: ${Q_PDF.labelShare * 100}%; font-size: 10px; font-weight: 700; color: #4b5563; }
    table.t th { text-align: left; padding: 0 5px 3px; font-size: 9px; line-height: 11px; color: #6b7280; text-transform: uppercase; border-bottom: 2px solid #d1d5db; vertical-align: bottom; white-space: nowrap; }
    table.t td { padding: 4px 5px; font-size: ${Q_PDF.tableFont}px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    .l { height: ${Q_PDF.tableLine}px; line-height: ${Q_PDF.tableLine}px; white-space: nowrap; }
    .note { margin: 0; font-size: 11px; line-height: ${Q_PDF.noteHeight}px; color: #6b7280; }
    .void { box-sizing: border-box; padding: 0 12px; font-size: ${Q_PDF.fieldFont}px; line-height: ${Q_PDF.fieldLine}px; font-weight: 700; background: #f3f4f6; border-left: 5px solid #111; white-space: nowrap; }
    .void.head { padding-top: 8px; font-size: 12px; }
    .footer { position: absolute; left: ${Q_PDF.padding}px; right: ${Q_PDF.padding}px; bottom: ${Q_PDF.padding}px; margin: 0; font-size: 9px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 6px; }
  </style></head><body>${body}
  </body></html>`;
}
