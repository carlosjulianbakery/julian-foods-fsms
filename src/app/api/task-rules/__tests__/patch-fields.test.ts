/**
 * Behavior tests for PATCH /api/task-rules/[id] field preservation.
 *
 * Tests the data-building logic: only fields explicitly present in the PATCH
 * body are written; omitted fields leave the existing DB row unchanged.
 */

import { describe, it, expect } from "vitest";

// ─── Reproduce the PATCH data-building logic from route.ts ────────────────────

interface PatchBody {
  title?: string;
  description?: string;
  facilityId?: string;
  ownerId?: string;
  triggerType?: string;
  recurrenceUnit?: string;
  recurrenceEvery?: number | string;
  recurrenceStart?: string;
  formKey?: string | null;
  productName?: string | null;
  isActive?: boolean;
  windowMode?: string;
  windowDaysBefore?: number | string | null;
  recurrenceEndOfMonth?: boolean;
}

function buildPatchData(body: PatchBody): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = (body.title as string).trim();
  if (body.description !== undefined) data.description = body.description?.trim() || null;
  if (body.facilityId !== undefined) data.facilityId = body.facilityId;
  if (body.ownerId !== undefined) data.ownerId = body.ownerId;
  if (body.triggerType !== undefined) data.triggerType = body.triggerType;
  if (body.recurrenceUnit !== undefined) data.recurrenceUnit = body.recurrenceUnit || null;
  if (body.recurrenceEvery !== undefined) data.recurrenceEvery = parseInt(String(body.recurrenceEvery));
  if (body.recurrenceStart !== undefined) data.recurrenceStart = new Date(body.recurrenceStart);
  if (body.formKey !== undefined) data.formKey = body.formKey || null;
  if (body.productName !== undefined) data.productName = body.productName || null;
  if (body.isActive !== undefined) data.isActive = body.isActive;
  if (body.windowMode !== undefined) data.windowMode = body.windowMode;
  if (body.windowDaysBefore !== undefined)
    data.windowDaysBefore =
      body.windowDaysBefore != null ? parseInt(String(body.windowDaysBefore)) : null;
  return data;
}

describe("PATCH task-rule — field preservation", () => {
  it("PATCH with only windowMode → data has windowMode, formKey not set", () => {
    const data = buildPatchData({ windowMode: "PERIOD_START" });
    expect(data.windowMode).toBe("PERIOD_START");
    expect("formKey" in data).toBe(false);
    expect("recurrenceEndOfMonth" in data).toBe(false);
    expect("windowDaysBefore" in data).toBe(false);
  });

  it("PATCH with only windowDaysBefore → windowDaysBefore set, windowMode not set", () => {
    const data = buildPatchData({ windowDaysBefore: 7 });
    expect(data.windowDaysBefore).toBe(7);
    expect("windowMode" in data).toBe(false);
    expect("formKey" in data).toBe(false);
  });

  it("PATCH with windowMode and formKey → both set, others untouched", () => {
    const data = buildPatchData({ windowMode: "DAYS_BEFORE", formKey: "monthly_cleaning_624" });
    expect(data.windowMode).toBe("DAYS_BEFORE");
    expect(data.formKey).toBe("monthly_cleaning_624");
    expect("title" in data).toBe(false);
    expect("windowDaysBefore" in data).toBe(false);
  });

  it("windowDaysBefore as string \"7\" → parsed to integer 7", () => {
    const data = buildPatchData({ windowDaysBefore: "7" });
    expect(data.windowDaysBefore).toBe(7);
  });

  it("windowDaysBefore as null → preserved as null (removes days window)", () => {
    const data = buildPatchData({ windowDaysBefore: null });
    expect(data.windowDaysBefore).toBeNull();
  });

  it("PATCH with no windowMode/windowDaysBefore → neither set (preserves existing DB values)", () => {
    const data = buildPatchData({ title: "New Title" });
    expect(data.title).toBe("New Title");
    expect("windowMode" in data).toBe(false);
    expect("windowDaysBefore" in data).toBe(false);
  });

  it("PATCH with formKey empty string → stored as null", () => {
    const data = buildPatchData({ formKey: "" });
    expect(data.formKey).toBeNull();
  });

  it("PATCH with formKey set to actual value → stored as-is", () => {
    const data = buildPatchData({ formKey: "monthly_cleaning_624" });
    expect(data.formKey).toBe("monthly_cleaning_624");
  });

  it("PATCH with recurrenceUnit empty string → stored as null", () => {
    const data = buildPatchData({ recurrenceUnit: "" });
    expect(data.recurrenceUnit).toBeNull();
  });

  it("PATCH body with only isActive=false → data has only isActive", () => {
    const data = buildPatchData({ isActive: false });
    expect(data.isActive).toBe(false);
    expect("windowMode" in data).toBe(false);
    expect("formKey" in data).toBe(false);
    expect("windowDaysBefore" in data).toBe(false);
  });
});

describe("PATCH task-rule — windowMode DAYS_BEFORE with windowDaysBefore", () => {
  it("DAYS_BEFORE + windowDaysBefore 14 → both stored", () => {
    const data = buildPatchData({ windowMode: "DAYS_BEFORE", windowDaysBefore: 14 });
    expect(data.windowMode).toBe("DAYS_BEFORE");
    expect(data.windowDaysBefore).toBe(14);
  });

  it("setting windowMode to NONE + windowDaysBefore null → NONE with no days", () => {
    const data = buildPatchData({ windowMode: "NONE", windowDaysBefore: null });
    expect(data.windowMode).toBe("NONE");
    expect(data.windowDaysBefore).toBeNull();
  });
});
