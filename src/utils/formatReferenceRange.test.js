import { describe, expect, it } from "vitest";
import { formatReferenceRange } from "./formatReferenceRange";

describe("formatReferenceRange", () => {
  it("formats a two-sided range as 'low - high unit'", () => {
    expect(formatReferenceRange(4.8, 5.6, "%")).toBe("4.8 - 5.6 %");
  });

  it("formats a low-only range using the source-report '>' notation", () => {
    expect(formatReferenceRange(90, null, "ML/MIN")).toBe(">90 ML/MIN");
    expect(formatReferenceRange(49, null, "MG/DL")).toBe(">49 MG/DL");
  });

  it("formats a high-only range using the source-report '<' notation", () => {
    expect(formatReferenceRange(null, 100, "MG/DL")).toBe("<100 MG/DL");
    expect(formatReferenceRange(null, 37, "U/L")).toBe("<37 U/L");
  });

  it("returns null when there is no range at all, leaving the fallback text to the caller", () => {
    expect(formatReferenceRange(null, null, "MG/DL")).toBeNull();
    expect(formatReferenceRange(null, null, null)).toBeNull();
  });

  it("omits the unit suffix when no unit is given, for any range shape", () => {
    expect(formatReferenceRange(70, 99, null)).toBe("70 - 99");
    expect(formatReferenceRange(90, null, null)).toBe(">90");
    expect(formatReferenceRange(null, 100, null)).toBe("<100");
  });
});
