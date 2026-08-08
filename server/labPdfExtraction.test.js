import { describe, expect, it } from "vitest";
import {
  parseLabResultLines,
  parseReferenceRangeDescriptor,
  buildDraftRow,
  parseReportMetadata,
  detectKnownLabName,
} from "./labPdfExtraction.js";

const page = (pageNumber, lines) => [{ pageNumber, lines }];

describe("detectKnownLabName", () => {
  it("recognizes Sun Clinical Laboratories regardless of surrounding text or case", () => {
    expect(detectKnownLabName("SUN CLINICAL LABORATORIES\nMEDICAL DIRECTOR: DR. MUH YAU TANG")).toBe(
      "Sun Clinical Laboratories"
    );
    expect(detectKnownLabName("sun clinical laboratory")).toBe("Sun Clinical Laboratories");
  });

  it("recognizes Quest Diagnostics regardless of surrounding text or case", () => {
    expect(
      detectKnownLabName("Performing Sites\nEN Quest Diagnostics-West Hills, 8401 Fallbrook Ave")
    ).toBe("Quest Diagnostics");
    expect(detectKnownLabName("quest   diagnostics")).toBe("Quest Diagnostics");
  });

  it("returns null when no known lab is present", () => {
    expect(detectKnownLabName("LabCorp of America")).toBeNull();
    expect(detectKnownLabName("")).toBeNull();
    expect(detectKnownLabName(null)).toBeNull();
  });
});

describe("parseReportMetadata — laboratory detection", () => {
  it("detects Sun Clinical Laboratories from a letterhead with no 'Laboratory:' label", () => {
    const meta = parseReportMetadata(
      "SUN CLINICAL LABORATORIES\nMEDICAL DIRECTOR: DR. MUH YAU TANG\nCAO, ELAINE\nCOLLECTION DATE 07/20/26"
    );
    expect(meta.labName).toBe("Sun Clinical Laboratories");
  });

  it("detects Quest Diagnostics from a footer mention with no 'Laboratory:' label", () => {
    const meta = parseReportMetadata(
      "Performing Sites\nEN Quest Diagnostics-West Hills, 8401 Fallbrook Ave, West Hills, CA 91304"
    );
    expect(meta.labName).toBe("Quest Diagnostics");
  });

  it("falls back to a generic 'Laboratory: X' label for an unlisted lab", () => {
    const meta = parseReportMetadata("Patient: Jane Doe\nLaboratory: Example Regional Labs");
    expect(meta.labName).toBe("Example Regional Labs");
  });

  it("leaves labName null when nothing matches", () => {
    const meta = parseReportMetadata("Patient: Jane Doe\nNo lab info here.");
    expect(meta.labName).toBeNull();
  });
});

describe("parseReferenceRangeDescriptor", () => {
  it("parses a plain low-high range with a unit", () => {
    expect(parseReferenceRangeDescriptor("65-99 mg/dL")).toEqual({
      referenceLow: 65,
      referenceHigh: 99,
      unit: "mg/dL",
    });
  });

  it("parses an upper-bound-only range ('<')", () => {
    expect(parseReferenceRangeDescriptor("<200 mg/dL")).toEqual({
      referenceLow: null,
      referenceHigh: 200,
      unit: "mg/dL",
    });
  });

  it("parses a lower-bound-only range ('> OR =')", () => {
    expect(parseReferenceRangeDescriptor("> OR = 60 mL/min/1.73m2")).toEqual({
      referenceLow: 60,
      referenceHigh: null,
      unit: "mL/min/1.73m2",
    });
  });

  it("strips a trailing (calc) annotation from the unit", () => {
    expect(parseReferenceRangeDescriptor("1.0-2.5 (calc)")).toEqual({
      referenceLow: 1.0,
      referenceHigh: 2.5,
      unit: null,
    });
  });

  it("returns null for a qualitative (non-numeric) range", () => {
    expect(parseReferenceRangeDescriptor("NEGATIVE")).toBeNull();
    expect(parseReferenceRangeDescriptor("NO REFERENCE RANGE")).toBeNull();
  });
});

describe("parseLabResultLines — Quest junk-row rejection", () => {
  it("rejects a standalone mailing-address line (city, state, zip)", () => {
    const candidates = parseLabResultLines(
      page(1, ["GLUCOSE 123 H", "ROWLAND HEIGHTS, CA 91748-3074"])
    );
    expect(candidates.some((c) => c.rawLabel.includes("ROWLAND"))).toBe(false);
    expect(candidates.find((c) => c.rawLabel === "GLUCOSE")).toBeDefined();
  });

  it("rejects a per-page footer (name/id, page N / M, date) regardless of the name in it", () => {
    const candidates = parseLabResultLines(
      page(1, ["CREATININE 0.73", "BAI,TIE (ZD335663N) 1 / 4 7/28/26"])
    );
    expect(candidates.some((c) => c.rawLabel.includes("BAI"))).toBe(false);
    expect(candidates.find((c) => c.rawLabel === "CREATININE")).toBeDefined();
  });
});

describe("parseLabResultLines — reference range from the preceding line", () => {
  it("attaches a two-sided range from the line immediately before the analyte", () => {
    const candidates = parseLabResultLines(
      page(1, ["Reference Range: 65-99 mg/dL", "UREA NITROGEN (BUN) 23"])
    );
    expect(candidates).toEqual([
      expect.objectContaining({
        rawLabel: "UREA NITROGEN (BUN)",
        resultValue: 23,
        referenceLow: 65,
        referenceHigh: 99,
      }),
    ]);
  });

  it("attaches a one-sided range, and a range line only ever applies to the very next line", () => {
    const candidates = parseLabResultLines(
      page(1, [
        "Reference Range: > OR = 60 mL/min/1.73m2",
        "EGFR 101",
        "Reference Range: 6-22 (calc)",
        "BUN/CREATININE RATIO SEE NOTE:", // doesn't match RESULT_LINE_PATTERN — clears pendingRange
        "SODIUM 140",
      ])
    );
    const egfr = candidates.find((c) => c.rawLabel === "EGFR");
    expect(egfr.referenceLow).toBe(60);
    expect(egfr.referenceHigh).toBeNull();
    expect(egfr.unit).toBe("mL/min/1.73m2");

    // The 6-22 range belongs to BUN/CREATININE RATIO, which never produced a candidate (no
    // numeric value on its line) — SODIUM must not inherit a range meant for a different test.
    const sodium = candidates.find((c) => c.rawLabel === "SODIUM");
    expect(sodium.referenceLow).toBeNull();
    expect(sodium.referenceHigh).toBeNull();
  });

  it("still supports a single-line report with everything on one row (no preceding range line)", () => {
    const candidates = parseLabResultLines(page(1, ["Platelets   105  K/uL   150-450   L"]));
    expect(candidates).toEqual([
      expect.objectContaining({
        rawLabel: "Platelets",
        resultValue: 105,
        unit: "K/uL",
        referenceLow: 150,
        referenceHigh: 450,
        extractedFlag: "Low",
      }),
    ]);
  });
});

describe("parseLabResultLines — trailing abnormal-flag token is never misread as a unit", () => {
  it('parses "GLUCOSE 123 H" (unit/range from a preceding Reference Range line) as result 123, flag High, unit mg/dL — not unit "H"', () => {
    const candidates = parseLabResultLines(
      page(1, ["Reference Range: 65-99 mg/dL", "GLUCOSE 123 H"])
    );
    expect(candidates).toEqual([
      expect.objectContaining({
        rawLabel: "GLUCOSE",
        resultValue: 123,
        unit: "mg/dL",
        referenceLow: 65,
        referenceHigh: 99,
        extractedFlag: "High",
      }),
    ]);
  });

  it('still gets a same-line unit right alongside a trailing flag: "Platelets 105 K/UL 150-450 L" → unit K/UL, flag Low', () => {
    const candidates = parseLabResultLines(page(1, ["Platelets 105 K/UL 150-450 L"]));
    expect(candidates).toEqual([
      expect.objectContaining({
        rawLabel: "Platelets",
        resultValue: 105,
        unit: "K/UL",
        referenceLow: 150,
        referenceHigh: 450,
        extractedFlag: "Low",
      }),
    ]);
  });

  it("leaves an unflagged, normal-unit result line alone", () => {
    const candidates = parseLabResultLines(page(1, ["Sodium 140 mmol/L 136-145"]));
    expect(candidates).toEqual([
      expect.objectContaining({
        rawLabel: "Sodium",
        resultValue: 140,
        unit: "mmol/L",
        referenceLow: 136,
        referenceHigh: 145,
        extractedFlag: null,
      }),
    ]);
  });

  it("recognizes a same-line-unit-less trailing flag case-insensitively, both uppercase and lowercase", () => {
    const upper = parseLabResultLines(page(1, ["Reference Range: 65-99 mg/dL", "GLUCOSE 123 H"]));
    const lower = parseLabResultLines(page(1, ["Reference Range: 65-99 mg/dL", "glucose 123 h"]));
    expect(upper[0].extractedFlag).toBe("High");
    expect(upper[0].unit).toBe("mg/dL");
    expect(lower[0].extractedFlag).toBe("High");
    expect(lower[0].unit).toBe("mg/dL");
  });

  it("recognizes the full-word flag spellings (HIGH/LOW/ABNORMAL/CRITICAL) case-insensitively too", () => {
    const high = parseLabResultLines(page(1, ["Reference Range: 65-99 mg/dL", "GLUCOSE 123 high"]));
    const low = parseLabResultLines(page(1, ["Reference Range: 65-99 mg/dL", "GLUCOSE 55 LOW"]));
    expect(high[0].extractedFlag).toBe("High");
    expect(high[0].unit).toBe("mg/dL");
    expect(low[0].extractedFlag).toBe("Low");
    expect(low[0].unit).toBe("mg/dL");
  });
});

describe("buildDraftRow — one-sided reference ranges", () => {
  const reportMeta = { collectionDate: "2024-01-01", reportDate: null, labName: null };

  it("keeps a lower-bound-only range instead of discarding it for lacking an upper bound", () => {
    const draft = buildDraftRow(
      { pageNumber: 1, rawLabel: "EGFR", resultValue: 101, unit: "mL/min/1.73m2", referenceLow: 60, referenceHigh: null, extractedFlag: null },
      reportMeta
    );
    expect(draft.referenceLow).toBe(60);
    expect(draft.referenceHigh).toBeNull();
    expect(draft.rangeSource).toBe("extracted");
  });

  it("keeps an upper-bound-only range the same way", () => {
    const draft = buildDraftRow(
      { pageNumber: 1, rawLabel: "LDL-DIRECT", resultValue: 154, unit: "mg/dL", referenceLow: null, referenceHigh: 100, extractedFlag: "High" },
      reportMeta
    );
    expect(draft.referenceLow).toBeNull();
    expect(draft.referenceHigh).toBe(100);
    expect(draft.rangeSource).toBe("extracted");
  });

  it("marks rangeSource null (not extracted) when there is no range at all", () => {
    const draft = buildDraftRow(
      { pageNumber: 1, rawLabel: "CREATININE, URINE", resultValue: 26.4, unit: "mg/dL", referenceLow: null, referenceHigh: null, extractedFlag: null },
      reportMeta
    );
    expect(draft.rangeSource).toBeNull();
  });
});
