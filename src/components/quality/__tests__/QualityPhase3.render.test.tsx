import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import { resolve } from "path";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {}, replace() {} }) }));

import { CapasList, IncidentsList } from "@/components/quality/QualityLists";
import { ReviewsTab } from "@/components/quality/QualityReviews";
import { CapaRecord, IncidentRecord } from "@/components/quality/QualityRecords";
import type { CapaRow, IncidentRow, ReviewRow } from "@/lib/quality";

const noop = () => {};
const count = (html: string, needle: string) => html.split(needle).length - 1;
const unescape = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"');
const OPTIONS = { products: [{ id: "prod-1", name: "Keto Thin Bread" }], admins: [{ id: "carlos", name: "Carlos Gomory" }, { id: "chris", name: "Chris Pence" }], today: "2026-11-21" };
const INCIDENT = {
  id: "inc-1", reference: "CI-2026-001", facility: null, dateReceived: "2026-11-20", channel: "email", customer: "", productId: null, productName: "", lotCode: "", bestByDate: null,
  description: "Plastic in a loaf.", category: null, foodSafetyConcern: false, immediateAction: "", responseDate: null, responseChannel: null, responseSummary: "", capaRequired: null, noCapaReason: "",
  status: "open", closedDate: null, closedById: null, voidedAt: null, voidedById: null, voidReason: null, updatedAt: "2026-11-21T18:00:00.000Z",
};
const CAPA = {
  id: "capa-1", reference: "CAPA-2026-001", facility: null, source: "audit_finding", problem: "Sanitizer log incomplete.", rootCause: "", correctiveAction: "", preventiveAction: "", ownerId: null, dueDate: null,
  effectivenessDate: null, effectivenessResult: "", status: "open", closedDate: null, closedById: null, closedByName: null, voidedAt: null, voidedById: null, voidReason: null, updatedAt: "2026-11-21T18:00:00.000Z",
};
const incident = (over: Record<string, unknown> = {}, record: Record<string, string | boolean | null> = {}) =>
  renderToStaticMarkup(<IncidentRecord record={{ ...INCIDENT, ...record }} capa={null} events={[]} options={OPTIONS} onSave={noop} onAction={noop} onOpenCapa={noop} onUnlink={noop} onGoToCapa={noop} {...over} />);
const capa = (over: Record<string, unknown> = {}, record: Record<string, string | boolean | null> = {}) =>
  renderToStaticMarkup(<CapaRecord record={{ ...CAPA, ...record }} incidents={[]} linkable={[]} events={[]} options={OPTIONS} onSave={noop} onAction={noop} onLink={noop} onUnlink={noop} onGoToIncident={noop} {...over} />);

describe("Download PDF on the record pages (real components)", () => {
  it("an incident and a CAPA each show one Download PDF button in the heading", () => {
    for (const html of [incident({ onDownloadPdf: noop }), capa({ onDownloadPdf: noop })]) {
      expect(count(html, "data-download-pdf")).toBe(1);
      expect(html).toContain("Download PDF");
      expect(html.indexOf("data-download-pdf")).toBeLessThan(html.indexOf("data-section="));
    }
  });
  it("it is there on closed and void records too: they are read-only, not hidden", () => {
    for (const status of ["closed", "void"]) {
      expect(count(incident({ onDownloadPdf: noop }, { status, closedDate: "2026-11-21", voidedAt: "2026-11-21T18:00:00.000Z", voidReason: "Duplicate" }), "data-download-pdf")).toBe(1);
      expect(count(capa({ onDownloadPdf: noop }, { status, closedDate: "2026-11-21", voidedAt: "2026-11-21T18:00:00.000Z", voidReason: "Duplicate" }), "data-download-pdf")).toBe(1);
    }
  });
  it("while the PDF is being prepared the button says so and cannot be pressed twice", () => {
    const html = incident({ onDownloadPdf: noop, pdfBusy: true });
    expect(html).toContain("Preparing the PDF…");
    expect(html).toMatch(/<button[^>]*data-download-pdf[^>]*disabled=""/);
  });
  it("without the download handler there is no button (the handler is only given by the admin-only record page)", () => {
    expect(incident()).not.toContain("data-download-pdf");
    expect(capa()).not.toContain("data-download-pdf");
  });
  it("the admin-only page is what gives the handler: it asks the PDF route and hands the layout to the 624 exporter", () => {
    const read = (p: string) => readFileSync(resolve(__dirname, "../../..", p), "utf8");
    const page = read("app/(dashboard)/dashboard/admin/quality/QualityRecordPage.tsx");
    expect(page).toContain("const res = await fetch(`${api}/pdf`);");
    expect(page).toContain('const { exportFormPdf } = await import("@/components/forms624/pdfExport624");');
    expect(page).toContain("await exportFormPdf(out.html, out.filename);");
    expect(page).toContain("onDownloadPdf: () => void downloadPdf(), pdfBusy,");
    for (const p of ["incidents/[id]/page.tsx", "capas/[id]/page.tsx"]) {
      expect(read(`app/(dashboard)/dashboard/admin/quality/${p}`)).toContain('if (!session || !canUseQuality(session.user.role)) redirect("/dashboard");');
    }
    for (const p of ["incidents", "capas"]) expect(read(`app/api/quality/${p}/[id]/pdf/route.ts`)).toContain("qualityRoute((actor) => recordPdf(");
  });
});

describe("Export CSV on each list (real components)", () => {
  const INCIDENTS: IncidentRow[] = [
    { id: "i1", reference: "CI-2026-001", facility: null, dateReceived: "2026-11-20", channel: "email", customer: "", productId: null, productName: "Keto Thin Bread", description: "Plastic.", category: "foreign_matter", foodSafetyConcern: false, status: "open", updatedAt: "2026-11-21T18:00:00Z", updatedByName: "Carlos Gomory", capaId: null, capaReference: null },
    { id: "i2", reference: "CI-2026-002", facility: null, dateReceived: "2026-11-21", channel: "email", customer: "", productId: null, productName: "", description: "Duplicate.", category: null, foodSafetyConcern: false, status: "void", updatedAt: "2026-11-21T18:00:00Z", updatedByName: "Carlos Gomory", capaId: null, capaReference: null },
  ];
  const CAPAS: CapaRow[] = [{ id: "c1", reference: "CAPA-2026-001", facility: null, source: "audit_finding", problem: "Log incomplete.", status: "open", ownerId: null, ownerName: "", dueDate: null, createdAt: "2026-11-21T18:00:00Z", updatedAt: "2026-11-21T18:00:00Z", updatedByName: "Carlos Gomory", incidentReferences: [] }];
  const href = (html: string, kind: string) => unescape(new RegExp(`<a href="([^"]*)" data-export="${kind}"`).exec(html)?.[1] ?? "");

  it("the incidents list: one Export CSV link that carries the filters the list is showing", () => {
    const plain = renderToStaticMarkup(<IncidentsList rows={INCIDENTS} onOpen={noop} />);
    expect(count(plain, "data-export=")).toBe(1);
    expect(plain).toContain(">Export CSV</a>");
    expect(href(plain, "incident")).toBe("/api/quality/incidents/export");
    const filtered = renderToStaticMarkup(<IncidentsList rows={INCIDENTS} onOpen={noop} initialFilters={{ status: "open", category: "foreign_matter", product: "keto", from: "2026-11-01", to: "2026-11-30", showVoid: true }} />);
    expect(href(filtered, "incident")).toBe("/api/quality/incidents/export?status=open&category=foreign_matter&product=keto&from=2026-11-01&to=2026-11-30&showVoid=1");
  });
  it("it is there when the filters match nothing, so an empty export is possible too", () => {
    const none = renderToStaticMarkup(<IncidentsList rows={INCIDENTS} onOpen={noop} initialFilters={{ search: "zzz" }} />);
    expect(none).toContain("No incidents match these filters.");
    expect(href(none, "incident")).toBe("/api/quality/incidents/export?search=zzz");
  });
  it("the CAPA list: its own link, with its own filters", () => {
    const html = renderToStaticMarkup(<CapasList rows={CAPAS} today="2026-11-21" onOpen={noop} initialFilters={{ source: "audit_finding", showVoid: true }} />);
    expect(count(html, "data-export=")).toBe(1);
    expect(href(html, "capa")).toBe("/api/quality/capas/export?source=audit_finding&showVoid=1");
  });
  it("the reviews list: its own link, with the year shown", () => {
    const REVIEWS: ReviewRow[] = [{ id: "r1", period: "2026-10", reviewDate: "2026-11-02", reviewedByName: "Carlos Gomory", whatWasReviewed: "Everything", notes: "", counts: { openIncidents: 1, openCapas: 0, overdueCapas: 0, incidentsReceived: 2 }, updatedAt: "2026-11-02T18:00:00Z" }];
    const props = { reviews: REVIEWS, today: "2026-11-21", currentPeriod: "2026-11", currentCounts: { openIncidents: 0, openCapas: 0, overdueCapas: 0, incidentsReceived: 0 }, reviewerName: "Carlos Gomory", onCreate: noop, onUpdate: noop };
    const all = renderToStaticMarkup(<ReviewsTab {...props} />);
    expect(count(all, "data-export=")).toBe(1);
    expect(href(all, "review")).toBe("/api/quality/reviews/export");
    expect(href(renderToStaticMarkup(<ReviewsTab {...props} initialYear="2026" />), "review")).toBe("/api/quality/reviews/export?year=2026");
  });
});
