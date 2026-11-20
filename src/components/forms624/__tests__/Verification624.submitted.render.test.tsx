import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CurrentPeriodNotice624, OpenCurrentFormButton624, VerificationSubmittedNotice624, VerificationSubmittedView624,
} from "@/components/forms624/VerificationSubmittedNotice624";
import type { VerificationListRow } from "@/components/forms624/VerificationRecordsTable624";
import { nextPeriod, periodDates, submittedForDate, submittedPeriodMessage } from "@/lib/verification-624";

const row = (period: string, status: string, over: Partial<VerificationListRow> = {}): VerificationListRow => ({
  id: `rec-${period}`, period, status, conductedBy: "Hugo Ayala", initials: "HA", okCount: 13, failCount: 0, notInUseCount: 1,
  submittedAt: status === "submitted" ? "2026-11-20T20:03:48.524Z" : null, submittedBy: status === "submitted" ? { name: "Hugo Ayala" } : null, ...over,
});
/** What the records page header and the area under it render for a given list and Pacific date. */
const recordsPage = (rows: VerificationListRow[], today: string) =>
  renderToStaticMarkup(
    <div>
      <OpenCurrentFormButton624 rows={rows} today={today} onOpen={() => {}} />
      <CurrentPeriodNotice624 rows={rows} today={today} onView={() => {}} />
    </div>,
  );

describe("the next period", () => {
  it("first half → second half of the same month", () => {
    expect(nextPeriod("2026-11-A")).toEqual({ key: "2026-11-B", start: "2026-11-16", end: "2026-11-30", half: "B" });
    expect(nextPeriod("2027-02-A")).toMatchObject({ key: "2027-02-B", start: "2027-02-16", end: "2027-02-28" });
    expect(nextPeriod("2028-02-A")).toMatchObject({ start: "2028-02-16", end: "2028-02-29" }); // leap year
  });
  it("second half → first half of the next month, whatever the month's length; December rolls into January", () => {
    expect(nextPeriod("2026-11-B")).toEqual({ key: "2026-12-A", start: "2026-12-01", end: "2026-12-15", half: "A" });
    expect(nextPeriod("2027-02-B")).toMatchObject({ key: "2027-03-A", start: "2027-03-01" }); // after the 28th
    expect(nextPeriod("2028-02-B")).toMatchObject({ key: "2028-03-A", start: "2028-03-01" }); // after the 29th
    expect(nextPeriod("2026-10-B")).toMatchObject({ key: "2026-11-A", start: "2026-11-01" }); // after the 31st
    expect(nextPeriod("2026-12-B")).toEqual({ key: "2027-01-A", start: "2027-01-01", end: "2027-01-15", half: "A" });
    expect(nextPeriod("nonsense")).toBeNull();
  });
  it("period dates in a sentence", () => {
    expect(periodDates("2026-11-B")).toBe("November 16–30, 2026");
    expect(periodDates("2026-12-A")).toBe("December 1–15, 2026");
    expect(periodDates("2028-02-B")).toBe("February 16–29, 2028");
  });
});

describe("the message for a submitted period", () => {
  it("says who submitted it and when, and when the next form opens — second half of a month", () => {
    expect(submittedPeriodMessage({ period: "2026-11-B", submittedAt: "2026-11-20T20:03:48.524Z", submittedBy: "Hugo Ayala" })).toEqual({
      submitted: "The November 16–30, 2026 verification was submitted on 11/20/2026 by Hugo Ayala.",
      next: "The next form, for December 1–15, 2026, opens on Tuesday, December 1, 2026 (Pacific time).",
      nextOpens: "2026-12-01",
    });
  });
  it("first half of a month: the next form opens on the 16th", () => {
    expect(submittedPeriodMessage({ period: "2026-12-A", submittedAt: "2026-12-03T18:00:00Z", submittedBy: "Carlos Gomory" })).toEqual({
      submitted: "The December 1–15, 2026 verification was submitted on 12/03/2026 by Carlos Gomory.",
      next: "The next form, for December 16–31, 2026, opens on Wednesday, December 16, 2026 (Pacific time).",
      nextOpens: "2026-12-16",
    });
  });
  it("month ends: February (28 and 29 days), a 31-day month, and December into January", () => {
    const next = (period: string) => submittedPeriodMessage({ period, submittedAt: null, submittedBy: null }).next;
    expect(next("2027-02-B")).toBe("The next form, for March 1–15, 2027, opens on Monday, March 1, 2027 (Pacific time).");
    expect(next("2028-02-B")).toBe("The next form, for March 1–15, 2028, opens on Wednesday, March 1, 2028 (Pacific time).");
    expect(next("2027-02-A")).toBe("The next form, for February 16–28, 2027, opens on Tuesday, February 16, 2027 (Pacific time).");
    expect(next("2026-10-B")).toBe("The next form, for November 1–15, 2026, opens on Sunday, November 1, 2026 (Pacific time).");
    expect(next("2026-12-B")).toBe("The next form, for January 1–15, 2027, opens on Friday, January 1, 2027 (Pacific time).");
  });
  it("the submitted date is the Pacific date, not the UTC one", () => {
    // 05:30 UTC on December 1st is still 9:30 PM on November 30th in California
    expect(submittedPeriodMessage({ period: "2026-11-B", submittedAt: "2026-12-01T05:30:00Z", submittedBy: "Hugo Ayala" }).submitted)
      .toBe("The November 16–30, 2026 verification was submitted on 11/30/2026 by Hugo Ayala.");
    // 07:59 UTC on the 16th is 11:59 PM on the 15th
    expect(submittedPeriodMessage({ period: "2026-12-A", submittedAt: "2026-12-16T07:59:00Z", submittedBy: "Hugo Ayala" }).submitted).toContain("on 12/15/2026 by");
  });
  it("missing name or date are simply left out", () => {
    expect(submittedPeriodMessage({ period: "2026-11-B", submittedAt: null, submittedBy: "  " }).submitted).toBe("The November 16–30, 2026 verification was submitted.");
  });
});

describe("records page (real components): the way into the form", () => {
  const SUBMITTED = [row("2026-11-B", "submitted"), row("2026-11-A", "submitted", { submittedAt: "2026-11-14T22:30:00Z" })];

  it("current period already submitted: no button at all, and the page says why, with a link to that record and the next opening date", () => {
    const html = recordsPage(SUBMITTED, "2026-11-20");
    expect(OpenCurrentFormButton624({ rows: SUBMITTED, today: "2026-11-20", onOpen: () => {} })).toBeNull();
    expect(renderToStaticMarkup(<OpenCurrentFormButton624 rows={SUBMITTED} today="2026-11-20" onOpen={() => {}} />)).toBe("");
    expect(html).not.toContain("Open current form");
    expect(html).not.toContain("Current form submitted");
    expect(html).not.toContain("disabled");
    expect(html.split("<button").length - 1).toBe(1); // the only button left is the notice's "View that record" link
    expect(html).toContain('data-period-submitted="2026-11-B"');
    expect(html).toContain("The November 16–30, 2026 verification was submitted on 11/20/2026 by Hugo Ayala.");
    expect(html).toContain(">View that record</button>");
    expect(html).toContain("The next form, for December 1–15, 2026, opens on Tuesday, December 1, 2026 (Pacific time).");
  });

  it("it stays that way through the last day of the period, and opens again on the next period's first day", () => {
    const lastDay = recordsPage(SUBMITTED, "2026-11-30");
    expect(lastDay).not.toContain("Open current form");
    expect(lastDay).toContain('data-period-submitted="2026-11-B"');
    const dec1 = recordsPage(SUBMITTED, "2026-12-01");
    expect(dec1).toContain(">Open current form</button>");
    expect(dec1).not.toContain("disabled");
    expect(dec1).not.toContain("data-period-submitted");
  });

  it("current period not submitted (a draft, or no record yet): the normal button and no notice", () => {
    for (const rows of [[row("2026-11-B", "draft"), row("2026-11-A", "submitted")], [row("2026-11-A", "submitted")], []]) {
      const html = recordsPage(rows, "2026-11-20");
      expect(html).toContain(">Open current form</button>");
      expect(html).not.toContain("disabled");
      expect(html).not.toContain("was submitted");
    }
  });

  it("the button, when shown, opens the form", () => {
    const onOpen = vi.fn();
    const button = OpenCurrentFormButton624({ rows: [row("2026-11-B", "draft")], today: "2026-11-20", onOpen }) as ReactElement<{ onClick: () => void; disabled?: boolean; children: string }>;
    expect(button.type).toBe("button");
    expect(button.props.children).toBe("Open current form");
    expect(button.props.disabled).toBeUndefined();
    button.props.onClick();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("only the period today falls in counts", () => {
    expect(submittedForDate(SUBMITTED, "2026-11-15")?.period).toBe("2026-11-A");
    expect(submittedForDate(SUBMITTED, "2026-11-16")?.period).toBe("2026-11-B");
    expect(submittedForDate(SUBMITTED, "2026-12-16")).toBeNull();
  });

  it("the name falls back to 'conducted by' when the submitting user is gone", () => {
    const html = recordsPage([row("2026-11-B", "submitted", { submittedBy: null, conductedBy: "Hugo A." })], "2026-11-20");
    expect(html).toContain("was submitted on 11/20/2026 by Hugo A.");
  });
});

describe("form route (real component): the current period is already submitted", () => {
  const html = renderToStaticMarkup(
    <VerificationSubmittedView624 info={{ period: "2026-11-B", submittedAt: "2026-11-20T20:03:48.524Z", submittedBy: "Hugo Ayala" }} onView={() => {}} onRecords={() => {}} />,
  );
  it("shows the same explanation instead of a form, with a link to the record and a way back to Records", () => {
    expect(html).toContain("data-form-closed");
    expect(html).toContain("The November 16–30, 2026 verification was submitted on 11/20/2026 by Hugo Ayala.");
    expect(html).toContain(">View that record</button>");
    expect(html).toContain("The next form, for December 1–15, 2026, opens on Tuesday, December 1, 2026 (Pacific time).");
    expect(html).toContain(">View Records</button>");
    expect(html).not.toContain("Submit verification");
    expect(html).not.toContain("<input");
  });
  it("without a view handler the notice has no link", () => {
    expect(renderToStaticMarkup(<VerificationSubmittedNotice624 info={{ period: "2026-11-B", submittedAt: null, submittedBy: null }} />)).not.toContain("<button");
  });
});
