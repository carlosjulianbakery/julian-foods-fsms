import { describe, it, expect } from "vitest";
import {
  CATEGORIES, CAPA_SOURCES, CAPA_STATUSES, CHANNELS, INCIDENT_STATUSES, REOPEN_TO, canUseQuality, capaCanClose, capaClosingProblems, capaCreateProblems, capaDay,
  capaDecisionMade, capaMove, describeChange, diffFields, filterCapas, filterIncidents, formatDay, formatMoment, formatMomentDay, formatReference,
  incidentClosingProblems, incidentCreateProblems, incidentMove, isIsoDay, isOverdue, isReadOnly, normalize, parseFields, type CapaRow, type IncidentRow,
} from "@/lib/quality";
import { QUALITY_EVENTS_TRIGGER_SQL, QUALITY_NEXT_NUMBER_SQL, QUALITY_TABLES_SQL } from "@/lib/quality-sql";

describe("who may use Quality", () => {
  it("admins only, decided in one place", () => {
    expect(canUseQuality("ADMIN")).toBe(true);
    for (const role of ["SUPERVISOR", "admin", "", null, undefined]) expect(canUseQuality(role), String(role)).toBe(false);
  });
});

describe("the fixed lists", () => {
  it("are exactly the ones decided", () => {
    expect(Object.values(CHANNELS)).toEqual(["Email", "Phone", "Retailer", "Other"]);
    expect(Object.values(CATEGORIES)).toEqual(["Foreign matter", "Quality or taste", "Allergen or labeling", "Packaging or damage", "Illness or health complaint", "Shipping or delivery", "Order error", "Other"]);
    expect(Object.values(INCIDENT_STATUSES)).toEqual(["Open", "Under review", "Closed", "Void"]);
    expect(Object.values(CAPA_SOURCES)).toEqual(["Customer incident", "Audit finding", "Supplier issue", "Internal inspection", "Other"]);
    expect(Object.values(CAPA_STATUSES)).toEqual(["Open", "Action in progress", "Verifying effectiveness", "Closed", "Void"]);
  });
});

describe("reference numbers and dates", () => {
  it("CI-YYYY-NNN and CAPA-YYYY-NNN, padded to three digits", () => {
    expect(formatReference("CI", 2026, 1)).toBe("CI-2026-001");
    expect(formatReference("CAPA", 2026, 42)).toBe("CAPA-2026-042");
    expect(formatReference("CI", 2027, 1234)).toBe("CI-2027-1234");
  });
  it("the counter statement is one atomic upsert", () => {
    expect(QUALITY_NEXT_NUMBER_SQL).toContain("ON CONFLICT (kind, year) DO UPDATE SET \"lastNumber\" = quality_counters.\"lastNumber\" + 1");
    expect(QUALITY_NEXT_NUMBER_SQL).toContain("RETURNING \"lastNumber\"");
  });
  it("dates are shown MM/DD/YYYY; moments in Pacific time", () => {
    expect(formatDay("2026-11-21")).toBe("11/21/2026");
    expect(formatDay(null)).toBe("—");
    expect(formatMoment("2026-11-22T07:30:00Z")).toBe("11/21/2026, 11:30 PM PT"); // the Pacific day, not the UTC one
    expect(formatMomentDay("2026-11-22T07:30:00Z")).toBe("11/21/2026");
    expect(formatMomentDay("2027-01-01T07:59:00Z")).toBe("12/31/2026");
  });
  it("only real calendar days are accepted", () => {
    expect(isIsoDay("2026-02-28")).toBe(true);
    expect(isIsoDay("2028-02-29")).toBe(true);
    for (const bad of ["2026-02-30", "2026-13-01", "11/21/2026", "", null, 20261121]) expect(isIsoDay(bad), String(bad)).toBe(false);
  });
});

describe("the database trigger that protects the history", () => {
  const sql = QUALITY_EVENTS_TRIGGER_SQL.join("\n");
  it("refuses UPDATE and DELETE on every row of quality_events, and TRUNCATE on the table", () => {
    expect(sql).toContain("CREATE TRIGGER quality_events_no_update_delete BEFORE UPDATE OR DELETE ON quality_events FOR EACH ROW EXECUTE FUNCTION quality_events_append_only()");
    expect(sql).toContain("CREATE TRIGGER quality_events_no_truncate BEFORE TRUNCATE ON quality_events FOR EACH STATEMENT EXECUTE FUNCTION quality_events_append_only()");
    expect(sql).toContain("RAISE EXCEPTION 'quality_events is append-only: % is not allowed', TG_OP");
    expect(sql).not.toMatch(/BEFORE INSERT/); // inserting is how the history grows
  });
  it("lets through only the foreign key clearing a deleted user's id, with every other column unchanged", () => {
    expect(sql).toContain(`IF OLD."userId" IS NOT NULL AND NEW."userId" IS NULL AND (to_jsonb(NEW) - 'userId') = (to_jsonb(OLD) - 'userId') THEN`);
    expect(sql.match(/RETURN NEW/g)).toHaveLength(1);
  });
  it("can be applied again safely, and no other table gets such a trigger", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION");
    expect(sql.match(/DROP TRIGGER IF EXISTS/g)).toHaveLength(2);
    expect(sql.match(/ ON (\w+)/g)!.every((m) => m === " ON quality_events")).toBe(true);
    expect(QUALITY_TABLES_SQL.every((q) => /^CREATE (TABLE|UNIQUE INDEX|INDEX) IF NOT EXISTS/.test(q))).toBe(true);
    expect(QUALITY_TABLES_SQL.join("\n")).toContain(`"capaRequired"      BOOLEAN,\n  "noCapaReason"      TEXT NOT NULL DEFAULT ''`);
  });
});

describe("reading the fields of a request", () => {
  it("keeps only known fields, trims text, and turns empty picks into nothing", () => {
    const { data, problems } = parseFields("incident", { customer: "  Whole Foods  ", category: "", bestByDate: "", status: "closed", reference: "CI-1", hacked: true, foodSafetyConcern: true, capaRequired: null });
    expect(problems).toEqual([]);
    expect(data).toEqual({ customer: "Whole Foods", category: null, bestByDate: null, foodSafetyConcern: true, capaRequired: null });
  });
  it("names the field for every value of the wrong kind", () => {
    const { problems } = parseFields("incident", { customer: 5, dateReceived: "tomorrow", channel: "fax", foodSafetyConcern: "yes", capaRequired: "maybe", facility: "Mars", description: "x".repeat(5001) });
    expect(problems.map((p) => p.message)).toEqual([
      "Facility: choose Company-wide, Julian Bakery or 624.", "Date received: enter a valid date.", "How it came in: choose one from the list.", "Customer or account: must be text.",
      "What happened: is too long (5000 characters at most).", "Food safety concern: choose yes or no.", "CAPA needed: choose yes, no, or leave it undecided.",
    ]);
    expect(parseFields("capa", { source: "rumor", ownerId: 7 }).problems.map((p) => p.field)).toEqual(["source", "ownerId"]);
    expect(parseFields("capa", null)).toEqual({ data: {}, problems: [] });
  });
});

describe("what a record needs", () => {
  it("to be created", () => {
    expect(incidentCreateProblems({}).map((p) => p.field)).toEqual(["dateReceived", "channel", "description"]);
    expect(incidentCreateProblems({ dateReceived: "2026-11-20", channel: "phone", description: "  " }).map((p) => p.field)).toEqual(["description"]);
    expect(incidentCreateProblems({ dateReceived: "2026-11-20", channel: "phone", description: "Stale loaf" })).toEqual([]);
    expect(capaCreateProblems({ source: "other" }).map((p) => p.field)).toEqual(["problem"]);
    expect(capaCreateProblems({ source: "other", problem: "Gap in the log" })).toEqual([]);
  });

  const done = { category: "quality_taste", responseDate: "2026-11-21", foodSafetyConcern: false, immediateAction: "", capaRequired: false, noCapaReason: "One-off, refunded." };
  it("an incident to be closed: category, response date, closed date and the CAPA decision", () => {
    expect(incidentClosingProblems(done, false, "2026-11-21")).toEqual([]);
    expect(incidentClosingProblems({}, false, null).map((p) => p.field)).toEqual(["category", "responseDate", "capaRequired", "closedDate"]);
    expect(incidentClosingProblems({ ...done, category: null }, false, "2026-11-21")).toEqual([{ field: "category", message: "Category: choose one." }]);
    expect(incidentClosingProblems(done, false, "11/21/2026").map((p) => p.field)).toEqual(["closedDate"]);
  });
  it("the CAPA decision: a linked CAPA, or 'no CAPA needed' with a reason — nothing else counts", () => {
    expect(capaDecisionMade({ capaRequired: null }, true)).toBe(true); // a CAPA is linked
    expect(capaDecisionMade({ capaRequired: false, noCapaReason: "One-off" }, false)).toBe(true);
    expect(capaDecisionMade({ capaRequired: false, noCapaReason: "  " }, false)).toBe(false);
    expect(capaDecisionMade({ capaRequired: true }, false)).toBe(false); // "yes" without a CAPA is not a decision
    expect(capaDecisionMade({ capaRequired: null, noCapaReason: "reason without the choice" }, false)).toBe(false);
    expect(incidentClosingProblems({ ...done, capaRequired: null }, true, "2026-11-21")).toEqual([]);
    expect(incidentClosingProblems({ ...done, noCapaReason: "" }, false, "2026-11-21")[0].message).toBe("CAPA decision: give the reason no CAPA is needed.");
  });
  it("a food safety concern needs its immediate action and cannot close without the decision", () => {
    const fs = { ...done, foodSafetyConcern: true, capaRequired: null, noCapaReason: "" };
    expect(incidentClosingProblems(fs, false, "2026-11-21").map((p) => p.message)).toEqual([
      "Immediate action taken: required because this is a food safety concern.",
      'CAPA decision: open or link a CAPA, or choose "No CAPA needed" and give the reason. A food safety concern cannot be closed without this decision.',
    ]);
    expect(incidentClosingProblems({ ...fs, immediateAction: "Lot pulled." }, true, "2026-11-21")).toEqual([]);
    expect(incidentClosingProblems({ ...done, immediateAction: "" }, false, "2026-11-21")).toEqual([]); // not a food safety concern: not required
  });
  it("a CAPA to be closed: root cause, both actions, owner, due date, and the effectiveness check date and result", () => {
    const full = { rootCause: "a", correctiveAction: "b", preventiveAction: "c", ownerId: "u", dueDate: "2026-12-01", effectivenessDate: "2026-12-15", effectivenessResult: "d" };
    expect(capaClosingProblems(full)).toEqual([]);
    expect(capaClosingProblems({}).map((p) => p.field)).toEqual(["rootCause", "correctiveAction", "preventiveAction", "ownerId", "dueDate", "effectivenessDate", "effectivenessResult"]);
    expect(capaClosingProblems({ ...full, preventiveAction: "   " })).toEqual([{ field: "preventiveAction", message: "Preventive action: describe it." }]);
  });
});

describe("status moves", () => {
  it("incident: Open and Under review, either way; a closed or void incident does not move", () => {
    expect(incidentMove("open", "under_review")).toEqual({ ok: true, backward: false });
    expect(incidentMove("under_review", "open")).toEqual({ ok: true, backward: false });
    expect(incidentMove("open", "open").ok).toBe(false);
    expect(incidentMove("open", "closed")).toEqual({ ok: false, error: "Choose Open or Under review." });
    expect(incidentMove("closed", "open")).toEqual({ ok: false, error: "A closed incident is read-only. Reopen it first." });
    expect(incidentMove("void", "open").ok).toBe(false);
  });
  it("CAPA: one step at a time; a step back is flagged as needing a reason", () => {
    expect(capaMove("open", "in_progress")).toEqual({ ok: true, backward: false });
    expect(capaMove("in_progress", "verifying")).toEqual({ ok: true, backward: false });
    expect(capaMove("verifying", "in_progress")).toEqual({ ok: true, backward: true });
    expect(capaMove("in_progress", "open")).toEqual({ ok: true, backward: true });
    expect(capaMove("open", "verifying").ok).toBe(false);
    expect(capaMove("verifying", "open").ok).toBe(false);
    expect(capaMove("verifying", "closed").ok).toBe(false); // closing is its own action
    expect(capaMove("closed", "verifying")).toEqual({ ok: false, error: "A closed CAPA is read-only. Reopen it first." });
    expect(capaMove("open", "nonsense").ok).toBe(false);
  });
  it("closing a CAPA is only possible from Verifying effectiveness; closed and void are read-only; reopening goes back one step", () => {
    expect(["open", "in_progress", "verifying", "closed", "void"].map(capaCanClose)).toEqual([false, false, true, false, false]);
    expect(["open", "under_review", "in_progress", "verifying", "closed", "void"].map(isReadOnly)).toEqual([false, false, false, false, true, true]);
    expect(REOPEN_TO).toEqual({ incident: { closed: "under_review", void: "open" }, capa: { closed: "verifying", void: "open" } });
  });
});

describe("the diff behind every history row", () => {
  it("lists only the fields that really changed, as { field, from, to }", () => {
    const before = { customer: "Whole Foods", category: null, lotCode: "L1", foodSafetyConcern: false, dateReceived: new Date("2026-11-20T00:00:00Z") };
    expect(diffFields(before, { customer: "Whole Foods", category: "foreign_matter", lotCode: "L2", foodSafetyConcern: true, dateReceived: "2026-11-20" })).toEqual([
      { field: "category", from: null, to: "foreign_matter" }, { field: "lotCode", from: "L1", to: "L2" }, { field: "foodSafetyConcern", from: false, to: true },
    ]);
  });
  it("nothing never differs from nothing: empty text, null and a missing value are the same", () => {
    expect(diffFields({ customer: "", category: null }, { customer: null, category: "", lotCode: "  " })).toEqual([]);
    expect(diffFields({ customer: "A" }, { customer: "" })).toEqual([{ field: "customer", from: "A", to: null }]);
    expect(normalize(undefined)).toBeNull();
    expect(normalize(new Date("2026-11-20T00:00:00Z"))).toBe("2026-11-20");
    expect(normalize(false)).toBe(false);
  });
  it("only looks at the fields it is given, and only at those present in the new values", () => {
    expect(diffFields({ status: "open", customer: "A" }, { status: "closed", customer: "B" }, ["status"])).toEqual([{ field: "status", from: "open", to: "closed" }]);
    expect(diffFields({ status: "open" }, { customer: "B" }, ["status", "customer"])).toEqual([{ field: "customer", from: null, to: "B" }]);
    expect(diffFields({}, {})).toEqual([]);
  });
  it("is shown in words: labels, list names, dates, yes and no, people's names", () => {
    expect(describeChange("incident", { field: "category", from: null, to: "foreign_matter" })).toBe("Category: (empty) → Foreign matter");
    expect(describeChange("incident", { field: "dateReceived", from: "2026-11-19", to: "2026-11-20" })).toBe("Date received: 11/19/2026 → 11/20/2026");
    expect(describeChange("incident", { field: "foodSafetyConcern", from: false, to: true })).toBe("Food safety concern: No → Yes");
    expect(describeChange("incident", { field: "status", from: "open", to: "under_review" })).toBe("Status: Open → Under review");
    expect(describeChange("capa", { field: "status", from: "verifying", to: "closed" })).toBe("Status: Verifying effectiveness → Closed");
    expect(describeChange("capa", { field: "ownerId", from: null, to: "u1" }, { u1: "Chris Pence" })).toBe("Owner: (empty) → Chris Pence");
    expect(describeChange("capa", { field: "closedDate", from: null, to: "2026-12-21" })).toBe("Closed date: (empty) → 12/21/2026");
    expect(describeChange("incident", { field: "facility", from: null, to: "624" })).toBe("Facility: Company-wide → 624");
    expect(describeChange("incident", { field: "linkedCapa", from: null, to: "CAPA-2026-001" })).toBe("Linked CAPA: (empty) → CAPA-2026-001");
  });
});

describe("list filters", () => {
  const i = (over: Partial<IncidentRow>): IncidentRow => ({
    id: "x", reference: "CI-2026-001", facility: null, dateReceived: "2026-11-20", channel: "email", customer: "", productId: null, productName: "Keto Bread", description: "Plastic in a loaf",
    category: "foreign_matter", foodSafetyConcern: false, status: "open", updatedAt: "2026-11-21T18:00:00Z", updatedByName: "Carlos Gomory", capaId: null, capaReference: null, ...over,
  });
  const INCIDENTS = [
    i({ reference: "CI-2026-001" }),
    i({ reference: "CI-2026-002", status: "closed", category: "quality_taste", productName: "Paleo Wraps", description: "Tasted stale", dateReceived: "2026-10-05", facility: "624" }),
    i({ reference: "CI-2026-003", status: "void", description: "Entered twice" }),
    i({ reference: "CI-2026-004", status: "under_review", category: null, productName: "", description: "Late delivery", dateReceived: "2026-11-01", facility: "Julian Bakery" }),
  ];
  const refs = (f: Parameters<typeof filterIncidents>[1]) => filterIncidents(INCIDENTS, f).map((r) => r.reference.slice(-3));

  it("void records are hidden by default and shown on request", () => {
    expect(refs({})).toEqual(["001", "002", "004"]);
    expect(refs({ showVoid: true })).toEqual(["001", "002", "003", "004"]);
    expect(refs({ status: "void" })).toEqual(["003"]); // asking for Void shows them
  });
  it("status, category, product, facility, date range and free text on reference and description", () => {
    expect(refs({ status: "closed" })).toEqual(["002"]);
    expect(refs({ category: "foreign_matter" })).toEqual(["001"]);
    expect(refs({ product: "paleo" })).toEqual(["002"]);
    expect(refs({ facility: "624" })).toEqual(["002"]);
    expect(refs({ facility: "Company-wide" })).toEqual(["001"]);
    expect(refs({ from: "2026-11-01" })).toEqual(["001", "004"]);
    expect(refs({ to: "2026-11-01" })).toEqual(["002", "004"]);
    expect(refs({ from: "2026-10-01", to: "2026-10-31" })).toEqual(["002"]);
    expect(refs({ search: "STALE" })).toEqual(["002"]);
    expect(refs({ search: "ci-2026-004" })).toEqual(["004"]);
    expect(refs({ search: "twice" })).toEqual([]); // still void
    expect(refs({ status: "open", category: "quality_taste" })).toEqual([]);
  });

  const c = (over: Partial<CapaRow>): CapaRow => ({
    id: "c", reference: "CAPA-2026-001", facility: null, source: "customer_incident", problem: "Plastic in a loaf", status: "open", ownerId: "u", ownerName: "Chris Pence", dueDate: "2026-11-30",
    createdAt: "2026-11-21T18:00:00Z", updatedAt: "2026-11-21T18:00:00Z", updatedByName: "Carlos Gomory", incidentReferences: [], ...over,
  });
  const CAPAS = [c({}), c({ reference: "CAPA-2026-002", source: "audit_finding", status: "closed", problem: "Log gap", createdAt: "2026-10-10T18:00:00Z" }), c({ reference: "CAPA-2026-003", status: "void" })];
  it("CAPAs: source, status, date opened (Pacific day), search, and the same rule for void", () => {
    const of = (f: Parameters<typeof filterCapas>[1]) => filterCapas(CAPAS, f).map((r) => r.reference.slice(-3));
    expect(of({})).toEqual(["001", "002"]);
    expect(of({ showVoid: true })).toHaveLength(3);
    expect(of({ source: "audit_finding" })).toEqual(["002"]);
    expect(of({ status: "open" })).toEqual(["001"]);
    expect(of({ from: "2026-11-01" })).toEqual(["001"]);
    expect(of({ search: "log" })).toEqual(["002"]);
    expect(capaDay({ createdAt: "2026-11-22T07:30:00Z" })).toBe("2026-11-21"); // 11:30 PM Pacific
  });
  it("overdue: past its due date and neither closed nor void", () => {
    expect(isOverdue({ dueDate: "2026-11-20", status: "open" }, "2026-11-21")).toBe(true);
    expect(isOverdue({ dueDate: "2026-11-20", status: "verifying" }, "2026-11-21")).toBe(true);
    expect(isOverdue({ dueDate: "2026-11-21", status: "open" }, "2026-11-21")).toBe(false); // due today is not overdue
    expect(isOverdue({ dueDate: "2026-11-20", status: "closed" }, "2026-11-21")).toBe(false);
    expect(isOverdue({ dueDate: "2026-11-20", status: "void" }, "2026-11-21")).toBe(false);
    expect(isOverdue({ dueDate: null, status: "open" }, "2026-11-21")).toBe(false);
  });
});
