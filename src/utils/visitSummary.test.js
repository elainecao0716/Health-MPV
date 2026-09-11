import { describe, expect, it } from "vitest";
import { buildVisitSummarySections, formatFriendlyDate, visitSummaryToPlainText } from "./visitSummary";

describe("formatFriendlyDate", () => {
  it("formats a YYYY-MM-DD string consistently", () => {
    expect(formatFriendlyDate("2024-01-05")).toBe(
      new Date(2024, 0, 5).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    );
  });

  it("passes through an unparseable value unchanged rather than guessing", () => {
    expect(formatFriendlyDate("not-a-date")).toBe("not-a-date");
  });

  it("passes through null/undefined unchanged", () => {
    expect(formatFriendlyDate(null)).toBeNull();
  });
});

describe("buildVisitSummarySections", () => {
  const empty = { records: [], checkins: [], labResults: [], savedGoal: null };

  it("returns no sections when there is no data at all", () => {
    expect(buildVisitSummarySections(empty)).toEqual([]);
  });

  it("builds a Weight Summary section from health records", () => {
    const sections = buildVisitSummarySections({
      ...empty,
      records: [
        { record_date: "2024-01-01", weight: 180, notes: "" },
        { record_date: "2024-02-01", weight: 175, notes: "" },
      ],
    });
    const weightSection = sections.find((s) => s.title === "Weight Summary");
    expect(weightSection).toBeDefined();
    expect(weightSection.lines.join(" ")).toContain("175");
  });

  it("keeps calculated observations and user notes in separate sections", () => {
    const sections = buildVisitSummarySections({
      ...empty,
      records: [{ record_date: "2024-01-01", weight: 180, notes: "Felt great today" }],
    });
    const notesSection = sections.find((s) => s.title === "User-Entered Notes");
    const weightSection = sections.find((s) => s.title === "Weight Summary");
    expect(notesSection).toBeDefined();
    expect(notesSection.lines[0]).toContain("Felt great today");
    // The calculated section must never contain the free-text note.
    expect(weightSection.lines.join(" ")).not.toContain("Felt great today");
  });

  it("only reports a lab trend for tests with 2+ same-unit results", () => {
    const sections = buildVisitSummarySections({
      ...empty,
      labResults: [
        {
          test_name: "Glucose",
          test_date: "2024-01-01",
          result_value: 90,
          unit: "mg/dL",
          reference_low: 70,
          reference_high: 99,
          status: "In Range",
          notes: "",
        },
      ],
    });
    expect(sections.find((s) => s.title.startsWith("Lab Trends"))).toBeUndefined();
    expect(sections.find((s) => s.title === "Latest Lab Results")).toBeDefined();
  });

  it("puts out-of-range results in their own section", () => {
    const sections = buildVisitSummarySections({
      ...empty,
      labResults: [
        {
          test_name: "Glucose",
          test_date: "2024-01-01",
          result_value: 150,
          unit: "mg/dL",
          reference_low: 70,
          reference_high: 99,
          status: "High",
          notes: "",
        },
      ],
    });
    const outOfRange = sections.find((s) => s.title === "Out-of-Range Lab Results");
    expect(outOfRange).toBeDefined();
    expect(outOfRange.lines[0]).toContain("High");
  });

  it("rounds Lab Trends changes cleanly instead of showing floating-point noise", () => {
    const sections = buildVisitSummarySections({
      ...empty,
      labResults: [
        {
          test_name: "TSH",
          test_date: "2024-01-01",
          result_value: 1.0,
          unit: "mIU/L",
          reference_low: 0.4,
          reference_high: 4.0,
          status: "In Range",
          notes: "",
        },
        {
          test_name: "TSH",
          test_date: "2024-04-01",
          result_value: 1.003,
          unit: "mIU/L",
          reference_low: 0.4,
          reference_high: 4.0,
          status: "In Range",
          notes: "",
        },
      ],
    });
    const trendsSection = sections.find((s) => s.title.startsWith("Lab Trends"));
    expect(trendsSection).toBeDefined();
    const line = trendsSection.lines[0];
    expect(line).toContain("increased by 0.003 mIU/L");
    expect(line).toContain("(+0.3%)");
    expect(line).not.toMatch(/\d\.\d{5,}/);
  });

  it("never invents a diagnosis, medication, or history — only states recorded facts", () => {
    const sections = buildVisitSummarySections({
      ...empty,
      labResults: [
        {
          test_name: "Glucose",
          test_date: "2024-01-01",
          result_value: 150,
          unit: "mg/dL",
          reference_low: 70,
          reference_high: 99,
          status: "High",
          notes: "",
        },
      ],
    });
    const allText = sections.flatMap((s) => s.lines).join(" ").toLowerCase();
    for (const forbidden of ["diagnos", "prescri", "medication", "you have"]) {
      expect(allText).not.toContain(forbidden);
    }
  });
});

describe("visitSummaryToPlainText", () => {
  it("includes the Health MPV title and generated timestamp", () => {
    const text = visitSummaryToPlainText(
      [{ title: "Weight Summary", lines: ["Latest weight: 180 lbs on Jan 1, 2024"] }],
      "1/1/2024, 12:00:00 PM"
    );
    expect(text).toContain("Health MPV — Visit Summary");
    expect(text).toContain("Generated 1/1/2024, 12:00:00 PM");
    expect(text).toContain("Latest weight: 180 lbs on Jan 1, 2024");
  });
});
